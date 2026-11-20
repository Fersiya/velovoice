use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, oneshot, RwLock};
use uuid::Uuid;

type Tx = mpsc::UnboundedSender<String>;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PeerMeta {
    pub id: String,
    pub name: String,
    pub avatar_color: String,
    pub muted: bool,
    pub deafened: bool,
    pub sharing: bool,
    pub screen_stream_id: Option<String>,
}

struct PeerHandle {
    meta: PeerMeta,
    tx: Tx,
}

struct Room {
    password: Option<String>,
    peers: HashMap<String, PeerHandle>,
}

pub struct AppState {
    rooms: RwLock<HashMap<String, Room>>,
    max_peers_per_room: usize,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMsg {
    Join {
        room: String,
        name: String,
        password: Option<String>,
        avatar_color: Option<String>,
    },
    Signal {
        to: String,
        payload: serde_json::Value,
    },
    StateUpdate {
        muted: bool,
        deafened: bool,
        sharing: bool,
        screen_stream_id: Option<String>,
    },
    Chat {
        text: String,
    },
    Ping {
        ts: u64,
    },
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ServerMsg {
    Joined {
        self_id: String,
        room: String,
        peers: Vec<PeerMeta>,
        max_peers: usize,
    },
    PeerJoined {
        peer: PeerMeta,
    },
    PeerLeft {
        peer_id: String,
    },
    PeerState {
        peer: PeerMeta,
    },
    Chat {
        id: String,
        from_id: String,
        from_name: String,
        avatar_color: String,
        text: String,
        ts: u64,
    },
    Signal {
        from: String,
        payload: serde_json::Value,
    },
    Pong {
        ts: u64,
    },
    Error {
        message: String,
    },
}

fn send_json(tx: &Tx, msg: &ServerMsg) {
    if let Ok(text) = serde_json::to_string(msg) {
        let _ = tx.send(text);
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn build_router(max_peers: usize) -> Router {
    let state = Arc::new(AppState {
        rooms: RwLock::new(HashMap::new()),
        max_peers_per_room: max_peers,
    });

    Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/ws", get(ws_handler))
        .with_state(state)
}

pub async fn run_server_with_shutdown(
    port: u16,
    max_peers: usize,
    shutdown_rx: oneshot::Receiver<()>,
) -> Result<(), String> {
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("Не удалось занять порт {port}: {e}"))?;

    let app = build_router(max_peers);
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
        })
        .await
        .map_err(|e| format!("Ошибка сервера: {e}"))
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut ws_tx, mut ws_rx) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    let write_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_tx.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    let peer_id = Uuid::new_v4().simple().to_string()[..12].to_string();
    let mut joined_room: Option<String> = None;

    while let Some(Ok(frame)) = ws_rx.next().await {
        let Message::Text(raw) = frame else {
            if matches!(frame, Message::Close(_)) {
                break;
            }
            continue;
        };

        let parsed: ClientMsg = match serde_json::from_str(&raw) {
            Ok(v) => v,
            Err(e) => {
                send_json(
                    &tx,
                    &ServerMsg::Error {
                        message: format!("Некорректное сообщение: {e}"),
                    },
                );
                continue;
            }
        };

        match parsed {
            ClientMsg::Ping { ts } => {
                send_json(&tx, &ServerMsg::Pong { ts });
            }
            ClientMsg::Join {
                room,
                name,
                password,
                avatar_color,
            } => {
                let room_name = room.trim().chars().take(32).collect::<String>();
                let clean_name = name.trim().chars().take(24).collect::<String>();
                if room_name.is_empty() || clean_name.is_empty() {
                    send_json(
                        &tx,
                        &ServerMsg::Error {
                            message: "Укажи ник и название комнаты".into(),
                        },
                    );
                    continue;
                }

                if let Some(prev_room) = joined_room.take() {
                    remove_peer(&state, &prev_room, &peer_id).await;
                }

                let mut rooms = state.rooms.write().await;
                let entry = rooms.entry(room_name.clone()).or_insert_with(|| Room {
                    password: password.clone().filter(|p| !p.is_empty()),
                    peers: HashMap::new(),
                });

                if let Some(expected) = &entry.password {
                    if password.as_deref().unwrap_or("") != expected {
                        send_json(
                            &tx,
                            &ServerMsg::Error {
                                message: "Неверный пароль комнаты".into(),
                            },
                        );
                        continue;
                    }
                }

                if entry.peers.len() >= state.max_peers_per_room {
                    send_json(
                        &tx,
                        &ServerMsg::Error {
                            message: format!(
                                "Комната заполнена (максимум {} человек)",
                                state.max_peers_per_room
                            ),
                        },
                    );
                    continue;
                }

                let existing_peers: Vec<PeerMeta> =
                    entry.peers.values().map(|p| p.meta.clone()).collect();

                let color = avatar_color
                    .filter(|c| c.starts_with('#') && (c.len() == 7 || c.len() == 4))
                    .unwrap_or_else(|| "#5865f2".to_string());

                let my_meta = PeerMeta {
                    id: peer_id.clone(),
                    name: clean_name,
                    avatar_color: color,
                    muted: false,
                    deafened: false,
                    sharing: false,
                    screen_stream_id: None,
                };

                for handle in entry.peers.values() {
                    send_json(
                        &handle.tx,
                        &ServerMsg::PeerJoined {
                            peer: my_meta.clone(),
                        },
                    );
                }

                entry.peers.insert(
                    peer_id.clone(),
                    PeerHandle {
                        meta: my_meta,
                        tx: tx.clone(),
                    },
                );

                send_json(
                    &tx,
                    &ServerMsg::Joined {
                        self_id: peer_id.clone(),
                        room: room_name.clone(),
                        peers: existing_peers,
                        max_peers: state.max_peers_per_room,
                    },
                );

                joined_room = Some(room_name);
            }
            ClientMsg::Signal { to, payload } => {
                let Some(room_name) = &joined_room else {
                    continue;
                };
                let rooms = state.rooms.read().await;
                if let Some(room) = rooms.get(room_name) {
                    if let Some(target) = room.peers.get(&to) {
                        send_json(
                            &target.tx,
                            &ServerMsg::Signal {
                                from: peer_id.clone(),
                                payload,
                            },
                        );
                    }
                }
            }
            ClientMsg::StateUpdate {
                muted,
                deafened,
                sharing,
                screen_stream_id,
            } => {
                let Some(room_name) = &joined_room else {
                    continue;
                };
                let mut rooms = state.rooms.write().await;
                if let Some(room) = rooms.get_mut(room_name) {
                    let updated = if let Some(me) = room.peers.get_mut(&peer_id) {
                        me.meta.muted = muted;
                        me.meta.deafened = deafened;
                        me.meta.sharing = sharing;
                        me.meta.screen_stream_id = screen_stream_id;
                        Some(me.meta.clone())
                    } else {
                        None
                    };
                    if let Some(meta) = updated {
                        for (id, handle) in &room.peers {
                            if id != &peer_id {
                                send_json(
                                    &handle.tx,
                                    &ServerMsg::PeerState { peer: meta.clone() },
                                );
                            }
                        }
                    }
                }
            }
            ClientMsg::Chat { text } => {
                let Some(room_name) = &joined_room else {
                    continue;
                };
                let clean_text = text.trim().chars().take(1000).collect::<String>();
                if clean_text.is_empty() {
                    continue;
                }
                let rooms = state.rooms.read().await;
                if let Some(room) = rooms.get(room_name) {
                    if let Some(me) = room.peers.get(&peer_id) {
                        let msg = ServerMsg::Chat {
                            id: Uuid::new_v4().simple().to_string()[..10].to_string(),
                            from_id: peer_id.clone(),
                            from_name: me.meta.name.clone(),
                            avatar_color: me.meta.avatar_color.clone(),
                            text: clean_text,
                            ts: now_ms(),
                        };
                        for handle in room.peers.values() {
                            send_json(&handle.tx, &msg);
                        }
                    }
                }
            }
        }
    }

    if let Some(room_name) = joined_room {
        remove_peer(&state, &room_name, &peer_id).await;
    }

    write_task.abort();
}

async fn remove_peer(state: &Arc<AppState>, room_name: &str, peer_id: &str) {
    let mut rooms = state.rooms.write().await;
    let should_remove_room = if let Some(room) = rooms.get_mut(room_name) {
        room.peers.remove(peer_id);
        for handle in room.peers.values() {
            send_json(
                &handle.tx,
                &ServerMsg::PeerLeft {
                    peer_id: peer_id.to_string(),
                },
            );
        }
        room.peers.is_empty()
    } else {
        false
    };
    if should_remove_room {
        rooms.remove(room_name);
    }
}
