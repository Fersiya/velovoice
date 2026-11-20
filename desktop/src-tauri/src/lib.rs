mod signaling;

use std::{
    collections::{HashSet, VecDeque},
    net::IpAddr,
    sync::Mutex,
};

use serde::Serialize;
use sysinfo::{Pid, ProcessesToUpdate, System};
use tokio::sync::{oneshot, Mutex as AsyncMutex};

struct RunningServer {
    port: u16,
    shutdown_tx: oneshot::Sender<()>,
}

struct AppBackend {
    server: AsyncMutex<Option<RunningServer>>,
    sys: Mutex<System>,
}

impl AppBackend {
    fn new() -> Self {
        Self {
            server: AsyncMutex::new(None),
            sys: Mutex::new(System::new()),
        }
    }
}

#[derive(Clone, Serialize)]
struct NetworkEndpoint {
    ip: String,
    kind: String,
    label: String,
    ws_url: String,
    priority: u8,
}

#[derive(Serialize)]
struct HostStatus {
    running: bool,
    port: u16,
    local_ws: String,
    endpoints: Vec<NetworkEndpoint>,
}

#[derive(Serialize)]
struct MemoryStats {
    app_mb: f64,
    webview_mb: f64,
    total_mb: f64,
    webview_procs: usize,
}

fn collect_network_endpoints(port: u16) -> Vec<NetworkEndpoint> {
    let mut results = Vec::new();
    let mut seen = HashSet::new();

    if let Ok(ifaces) = local_ip_address::list_afinet_netifas() {
        for (name, ip) in ifaces {
            let IpAddr::V4(v4) = ip else {
                continue;
            };
            if v4.is_loopback() || v4.is_link_local() || v4.is_unspecified() {
                continue;
            }
            let ip_str = v4.to_string();
            if !seen.insert(ip_str.clone()) {
                continue;
            }

            let octets = v4.octets();
            let name_lc = name.to_lowercase();

            // Tailscale CGNAT range: 100.64.0.0/10
            let is_tailscale = (octets[0] == 100 && (64..=127).contains(&octets[1]))
                || name_lc.contains("tailscale");

            let is_private = v4.is_private();

            let (kind, label, priority) = if is_tailscale {
                (
                    "tailscale".to_string(),
                    format!("Tailscale / VPN ({ip_str})"),
                    0,
                )
            } else if is_private {
                (
                    "lan".to_string(),
                    format!("Локальная сеть ({ip_str})"),
                    1,
                )
            } else {
                (
                    "public".to_string(),
                    format!("Внешний IP ({ip_str})"),
                    2,
                )
            };

            results.push(NetworkEndpoint {
                ws_url: format!("ws://{ip_str}:{port}/ws"),
                ip: ip_str,
                kind,
                label,
                priority,
            });
        }
    }

    results.sort_by_key(|e| (e.priority, e.ip.clone()));
    results
}

#[tauri::command]
fn get_network_endpoints(port: u16) -> Vec<NetworkEndpoint> {
    collect_network_endpoints(port)
}

#[tauri::command]
async fn start_host_server(
    port: u16,
    max_peers: Option<usize>,
    state: tauri::State<'_, AppBackend>,
) -> Result<HostStatus, String> {
    let mut guard = state.server.lock().await;

    // Already running on same port
    if let Some(existing) = guard.as_ref() {
        if existing.port == port {
            return Ok(HostStatus {
                running: true,
                port,
                local_ws: format!("ws://127.0.0.1:{port}/ws"),
                endpoints: collect_network_endpoints(port),
            });
        }
    }

    // Stop previous server if changing port
    if let Some(prev) = guard.take() {
        let _ = prev.shutdown_tx.send(());
        tokio::time::sleep(std::time::Duration::from_millis(80)).await;
    }

    // Verify we can bind port before spawning task
    let bind_addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(bind_addr)
        .await
        .map_err(|e| format!("Порт {port} занят или недоступен ({e}). Попробуй другой порт."))?;

    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let limit = max_peers.unwrap_or(8).clamp(2, 16);
    let router = signaling::build_router(limit);

    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
            })
            .await;
    });

    *guard = Some(RunningServer { port, shutdown_tx });

    Ok(HostStatus {
        running: true,
        port,
        local_ws: format!("ws://127.0.0.1:{port}/ws"),
        endpoints: collect_network_endpoints(port),
    })
}

#[tauri::command]
async fn stop_host_server(state: tauri::State<'_, AppBackend>) -> Result<(), String> {
    let mut guard = state.server.lock().await;
    if let Some(prev) = guard.take() {
        let _ = prev.shutdown_tx.send(());
    }
    Ok(())
}

#[tauri::command]
fn get_memory_stats(state: tauri::State<'_, AppBackend>) -> MemoryStats {
    let Ok(mut sys) = state.sys.lock() else {
        return MemoryStats {
            app_mb: 0.0,
            webview_mb: 0.0,
            total_mb: 0.0,
            webview_procs: 0,
        };
    };

    sys.refresh_processes(ProcessesToUpdate::All, true);

    let root_pid = Pid::from_u32(std::process::id());
    let procs = sys.processes();

    let app_bytes = procs.get(&root_pid).map(|p| p.memory()).unwrap_or(0);

    // Collect all descendant processes of velovoice.exe (including all msedgewebview2.exe workers)
    let mut visited = HashSet::new();
    let mut queue = VecDeque::new();
    visited.insert(root_pid);
    queue.push_back(root_pid);

    let mut webview_bytes: u64 = 0;
    let mut webview_procs: usize = 0;

    while let Some(parent_pid) = queue.pop_front() {
        for (&pid, proc_info) in procs {
            if visited.contains(&pid) {
                continue;
            }
            if proc_info.parent() == Some(parent_pid) {
                visited.insert(pid);
                queue.push_back(pid);
                webview_bytes = webview_bytes.saturating_add(proc_info.memory());
                webview_procs += 1;
            }
        }
    }

    let to_mb = |b: u64| ((b as f64 / (1024.0 * 1024.0)) * 10.0).round() / 10.0;
    let app_mb = to_mb(app_bytes);
    let webview_mb = to_mb(webview_bytes);
    let total_mb = ((app_mb + webview_mb) * 10.0).round() / 10.0;

    MemoryStats {
        app_mb,
        webview_mb,
        total_mb,
        webview_procs,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppBackend::new())
        .invoke_handler(tauri::generate_handler![
            start_host_server,
            stop_host_server,
            get_network_endpoints,
            get_memory_stats
        ])
        .run(tauri::generate_context!())
        .expect("error while running VeloVoice");
}
