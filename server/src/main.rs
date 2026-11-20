use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::Arc,
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
use tokio::sync::{mpsc, RwLock};
use tracing::{info, warn};
use uuid::Uuid;

type Tx = mpsc::UnboundedSender<String>;

#[derive(Clone, Debug, Serialize, Deserialize)]
struct PeerMeta {
    id: String,
    name: String,
    muted: bool,
    deafened: bool,
    sharing: bool,
}

struct PeerHandle {
    meta: PeerMeta,
    tx: Tx,
}

struct Room {
    password: Option<String>,
    peers: HashMap<String, PeerHandle>,
}

struct AppState {
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
    },
    Signal {
        to: String,
        payload: serde_json::Value,
    },
    StateUpdate {
        muted: bool,
        deafened: bool,
        sharing: bool,
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

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "velovoice_server=info".into()),
        )
        .init();

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(9000);

    let max_peers: usize = std::env::var("MAX_PEERS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(5);

    let state = Arc::new(AppState {
        rooms: RwLock::new(HashMap::new()),
        max_peers_per_room: max_peers,
    });

    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/ws", get(ws_handler))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("VeloVoice signaling server listening on ws://{} (max_peers={})", addr, max_peers);

    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind failed");
    axum::serve(listener, app).await.expect("server error");
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
                send_json(&tx, &ServerMsg::Error { message: format!("Invalid message: {e}") });
                continue;
            }
        };

        match parsed {
            ClientMsg::Ping { ts } => {
                send_json(&tx, &ServerMsg::Pong { ts });
            }
            ClientMsg::Join { room, name, password } => {
                let room_name = room.trim().to_string();
                let clean_name = name.trim().chars().take(24).collect::<String>();
                if room_name.is_empty() || clean_name.is_empty() {
                    send_json(&tx, &ServerMsg::Error { message: "Укажи имя и название комнаты".into() });
                    continue;
                }

                // Leave previous room if already connected
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
                        send_json(&tx, &ServerMsg::Error { message: "Неверный пароль комнаты".into() });
                        continue;
                    }
                }

                if entry.peers.len() >= state.max_peers_per_room {
                    send_json(
                        &tx,
                        &ServerMsg::Error {
                            message: format!("Комната заполнена (максимум {})", state.max_peers_per_room),
                        },
                    );
                    continue;
                }

                let existing_peers: Vec<PeerMeta> =
                    entry.peers.values().map(|p| p.meta.clone()).collect();

                let my_meta = PeerMeta {
                    id: peer_id.clone(),
                    name: clean_name,
                    muted: false,
                    deafened: false,
                    sharing: false,
                };

                // Notify existing peers
                for handle in entry.peers.values() {
                    send_json(&handle.tx, &ServerMsg::PeerJoined { peer: my_meta.clone() });
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
                    },
                );

                info!("Peer {} joined room '{}'", peer_id, room_name);
                joined_room = Some(room_name);
            }
            ClientMsg::Signal { to, payload } => {
                let Some(room_name) = &joined_room else { continue };
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
            ClientMsg::StateUpdate { muted, deafened, sharing } => {
                let Some(room_name) = &joined_room else { continue };
                let mut rooms = state.rooms.write().await;
                if let Some(room) = rooms.get_mut(room_name) {
                    let updated = if let Some(me) = room.peers.get_mut(&peer_id) {
                        me.meta.muted = muted;
                        me.meta.deafened = deafened;
                        me.meta.sharing = sharing;
                        Some(me.meta.clone())
                    } else {
                        None
                    };
                    if let Some(meta) = updated {
                        for (id, handle) in &room.peers {
                            if id != &peer_id {
                                send_json(&handle.tx, &ServerMsg::PeerState { peer: meta.clone() });
                            }
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
    warn!("Peer {} disconnected", peer_id);
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
        info!("Room '{}' removed (empty)", room_name);
    }
}
