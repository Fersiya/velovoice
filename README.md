# VeloVoice — лёгкий свой «Discord» на Rust + Tauri 2.0

Минималистичное десктоп-приложение для компании до 5 человек:
- **Голос с минимальной задержкой** (WebRTC P2P Mesh + Opus 48 кГц, индикатор говорящего).
- **Регулировка громкости каждого участника 0–200%** (Web Audio API `GainNode`, сохраняется локально).
- **Трансляция экрана 1080p 60 FPS + звук** (`getDisplayMedia`, битрейт до 7 Мбит/с, приоритет плавности кадров).
- **Без Electron и Node.js** — фронтенд на чистом HTML/CSS/JS, оболочка на [Tauri 2.0](https://v2.tauri.app/) (использует системный WebView2 в Windows), сервер сигналинга на Rust ([Axum](https://github.com/tokio-rs/axum)).

---

## Что нужно установить для сборки (Windows 11)

1. **Rust** — скачать с [rustup.rs](https://rustup.rs/) (установит `cargo` и `rustc`).
2. **Microsoft C++ Build Tools** (обычно уже стоят с Rust; нужен компонент *Desktop development with C++*).
3. **Tauri CLI**:
   ```powershell
   cargo install tauri-cli --version "^2"
   ```
   *(Node.js не требуется — сборка полностью через Cargo.)*

---

## 1. Запуск сервера сигналинга (`server/`)

Сервер весит пару мегабайт и почти не потребляет CPU/RAM, так как медиа идёт напрямую (P2P).

```powershell
cd server
cargo run --release
```

По умолчанию слушает `0.0.0.0:9000` (адрес для подключения: `ws://<IP-сервера>:9000/ws`) и пускает до 5 человек в комнату.
Настройки через переменные окружения:
- `PORT=9000` — порт WebSocket-сервера.
- `MAX_PEERS=5` — лимит участников в одной комнате.

> **Если хостишь на VPS:** открой порт `9000/tcp` в файрволе (или поставь перед ним Caddy/Nginx с `wss://your-domain.ru/ws`).

---

## 2. Сборка десктоп-установщика (`desktop/`)

Для тестового запуска:
```powershell
cd desktop/src-tauri
cargo tauri dev
```

Для сборки готового установщика (`.exe` NSIS и `.msi`), который можно скинуть друзьям:
```powershell
cd desktop/src-tauri
cargo tauri build
```

Готовые установщики появятся в:
- `desktop/src-tauri/target/release/bundle/nsis/VeloVoice_0.1.0_x64-setup.exe`
- `desktop/src-tauri/target/release/bundle/msi/VeloVoice_0.1.0_x64_en-US.msi`

---

## 3. Советы по трансляции экрана и NAT

- **Звук при шаринге экрана:** при нажатии *«Экран 1080p60»* в окне выбора экрана Windows/WebView2 обязательно включи переключатель **«Поделиться системным аудио»**.
- **Если у кого-то из друзей строгий NAT (не слышно/чёрный экран):** подними [coturn](https://github.com/coturn/coturn) или [turn-rs](https://github.com/mycrl/turn-rs) на том же VPS и укажи `turn:ip:3478`, логин и пароль в раскрывающемся блоке *«Настройки звука и TURN»*.
- **Горячие клавиши в окне:** `M` — мут микрофона, `D` — отключить весь входящий звук.
