mod signaling;

use std::net::SocketAddr;
use tracing::info;

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
        .unwrap_or(8);

    let app = signaling::build_router(max_peers);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!(
        "VeloVoice 2.0 signaling server listening on ws://{}/ws (max_peers={})",
        addr, max_peers
    );

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind failed");
    axum::serve(listener, app).await.expect("server error");
}
