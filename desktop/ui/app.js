(() => {
  "use strict";

  // --- DOM ---
  const loginView = document.getElementById("login-view");
  const roomView = document.getElementById("room-view");
  const joinForm = document.getElementById("join-form");
  const loginError = document.getElementById("login-error");

  const inputName = document.getElementById("input-name");
  const inputRoom = document.getElementById("input-room");
  const inputPass = document.getElementById("input-pass");
  const inputServer = document.getElementById("input-server");
  const selectMic = document.getElementById("select-mic");
  const optNoise = document.getElementById("opt-noise");
  const optEcho = document.getElementById("opt-echo");
  const optAgc = document.getElementById("opt-agc");
  const inputTurnUrl = document.getElementById("input-turn-url");
  const inputTurnUser = document.getElementById("input-turn-user");
  const inputTurnPass = document.getElementById("input-turn-pass");

  const roomTitle = document.getElementById("room-title");
  const pingBadge = document.getElementById("ping-badge");
  const peerCount = document.getElementById("peer-count");
  const peersList = document.getElementById("peers-list");
  const stageEmpty = document.getElementById("stage-empty");
  const streamsGrid = document.getElementById("streams-grid");
  const hiddenAudioSink = document.getElementById("hidden-audio-sink");

  const btnMute = document.getElementById("btn-mute");
  const btnDeafen = document.getElementById("btn-deafen");
  const btnShare = document.getElementById("btn-share");
  const btnLeave = document.getElementById("btn-leave");

  // --- App State ---
  let ws = null;
  let selfId = null;
  let selfName = "";
  let muted = false;
  let deafened = false;
  let sharing = false;
  let pingTimer = null;
  let vadTimer = null;

  let audioCtx = null;
  let localMicStream = null;
  let localMicAnalyser = null;
  let localScreenStream = null;

  /** @type {Map<string, { meta: any, pc: RTCPeerConnection, makingOffer: boolean, ignoreOffer: boolean, volume: number, voiceGain: GainNode|null, analyser: AnalyserNode|null, voiceAudioEl: HTMLAudioElement|null, screenStream: MediaStream|null, screenCard: HTMLElement|null }>} */
  const peers = new Map();

  // Восстанавливаем последние настройки
  function loadSavedPrefs() {
    inputName.value = localStorage.getItem("vv_name") || "";
    inputRoom.value = localStorage.getItem("vv_room") || "squad";
    inputServer.value = localStorage.getItem("vv_server") || "ws://127.0.0.1:9000/ws";
    inputTurnUrl.value = localStorage.getItem("vv_turn_url") || "";
    inputTurnUser.value = localStorage.getItem("vv_turn_user") || "";
  }

  async function populateMicrophones() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === "audioinput");
      selectMic.innerHTML = "";
      if (mics.length === 0) {
        selectMic.innerHTML = '<option value="">По умолчанию</option>';
        return;
      }
      for (const mic of mics) {
        const opt = document.createElement("option");
        opt.value = mic.deviceId;
        opt.textContent = mic.label || `Микрофон (${mic.deviceId.slice(0, 6)})`;
        selectMic.appendChild(opt);
      }
    } catch {
      selectMic.innerHTML = '<option value="">По умолчанию</option>';
    }
  }

  function buildRtcConfig() {
    const iceServers = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ];
    const turnUrl = inputTurnUrl.value.trim();
    if (turnUrl) {
      iceServers.push({
        urls: turnUrl,
        username: inputTurnUser.value.trim(),
        credential: inputTurnPass.value,
      });
    }
    return {
      iceServers,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    };
  }

  function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.classList.remove("hidden");
  }

  function hideLoginError() {
    loginError.classList.add("hidden");
  }

  function wsSend(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  // --- Audio Setup ---
  async function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: "interactive",
    });
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    const micId = selectMic.value;
    localMicStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: micId ? { exact: micId } : undefined,
        echoCancellation: optEcho.checked,
        noiseSuppression: optNoise.checked,
        autoGainControl: optAgc.checked,
        channelCount: 1,
        sampleRate: 48000,
      },
      video: false,
    });

    const src = audioCtx.createMediaStreamSource(localMicStream);
    localMicAnalyser = audioCtx.createAnalyser();
    localMicAnalyser.fftSize = 256;
    src.connect(localMicAnalyser);
  }

  // --- Peer Connection (Perfect Negotiation) ---
  function createPeer(meta) {
    if (peers.has(meta.id)) return peers.get(meta.id);

    const pc = new RTCPeerConnection(buildRtcConfig());
    const polite = selfId > meta.id;

    const entry = {
      meta,
      pc,
      polite,
      makingOffer: false,
      ignoreOffer: false,
      volume: Number(localStorage.getItem(`vv_vol_${meta.name}`) || 100),
      voiceGain: null,
      analyser: null,
      voiceAudioEl: null,
      screenStream: null,
      screenCard: null,
    };

    peers.set(meta.id, entry);

    // Добавляем локальный микрофон
    if (localMicStream) {
      for (const track of localMicStream.getAudioTracks()) {
        const sender = pc.addTrack(track, localMicStream);
        tuneVoiceSender(sender);
      }
    }

    // Если уже идёт локальный шаринг экрана — сразу добавляем новому участнику
    if (localScreenStream) {
      attachScreenTracksToPeer(entry, localScreenStream);
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        wsSend({ type: "signal", to: meta.id, payload: { candidate } });
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        entry.makingOffer = true;
        await pc.setLocalDescription();
        wsSend({
          type: "signal",
          to: meta.id,
          payload: { description: pc.localDescription },
        });
      } catch (err) {
        console.error("negotiationneeded error:", err);
      } finally {
        entry.makingOffer = false;
      }
    };

    pc.ontrack = (ev) => {
      const track = ev.track;
      const stream = ev.streams[0] || new MediaStream([track]);

      if (track.kind === "video") {
        // Входящая трансляция экрана
        attachRemoteScreen(entry, stream);
        track.onended = () => removeRemoteScreen(entry);
        track.onmute = () => {
          // Если трек остановился на той стороне
          if (track.readyState === "ended") removeRemoteScreen(entry);
        };
      } else if (track.kind === "audio") {
        // Если поток также содержит видео — это аудио трансляции экрана
        const isScreenAudio =
          stream.getVideoTracks().length > 0 ||
          (entry.screenStream && entry.screenStream.id === stream.id);

        if (isScreenAudio) {
          attachRemoteScreen(entry, stream);
        } else {
          attachRemoteVoice(entry, stream);
        }
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        pc.restartIce();
      }
    };

    renderPeersList();
    return entry;
  }

  async function tuneVoiceSender(sender) {
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      // 64 kbps Opus — отличная чёткость голоса при мизерном трафике
      params.encodings[0].maxBitrate = 64_000;
      await sender.setParameters(params);
    } catch {
      // Игнорируем, если браузер не даёт менять параметры
    }
  }

  async function tuneScreenVideoSender(sender) {
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      // 1080p 60 FPS: 7 Мбит/с + приоритет плавности кадров (maintain-framerate)
      params.encodings[0].maxBitrate = 7_000_000;
      params.encodings[0].maxFramerate = 60;
      params.degradationPreference = "maintain-framerate";
      await sender.setParameters(params);
    } catch (err) {
      console.warn("Не удалось применить битрейт экрана:", err);
    }
  }

  function attachScreenTracksToPeer(entry, stream) {
    for (const track of stream.getTracks()) {
      if (track.kind === "video") {
        try {
          track.contentHint = "motion";
        } catch {}
      }
      const sender = entry.pc.addTrack(track, stream);
      if (track.kind === "video") {
        tuneScreenVideoSender(sender);
      }
    }
  }

  function attachRemoteVoice(entry, stream) {
    // Workaround для Chromium/WebView2: скрытый muted <audio>, чтобы Web Audio API получал сэмплы
    if (!entry.voiceAudioEl) {
      const el = document.createElement("audio");
      el.autoplay = true;
      el.muted = true;
      el.playsInline = true;
      hiddenAudioSink.appendChild(el);
      entry.voiceAudioEl = el;
    }
    entry.voiceAudioEl.srcObject = stream;
    entry.voiceAudioEl.play().catch(() => {});

    if (audioCtx && !entry.voiceGain) {
      const src = audioCtx.createMediaStreamSource(stream);
      const gain = audioCtx.createGain();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;

      gain.gain.value = deafened ? 0 : entry.volume / 100;
      src.connect(analyser);
      analyser.connect(gain);
      gain.connect(audioCtx.destination);

      entry.voiceGain = gain;
      entry.analyser = analyser;
    }
  }

  function attachRemoteScreen(entry, stream) {
    entry.screenStream = stream;
    if (!entry.screenCard) {
      const card = document.createElement("div");
      card.className = "stream-card";
      card.innerHTML = `
        <video autoplay playsinline></video>
        <div class="stream-footer">
          <span class="stream-owner">Экран: ${escapeHtml(entry.meta.name)}</span>
          <div class="stream-controls">
            <span>Звук</span>
            <input type="range" min="0" max="100" value="80" class="stream-vol" />
            <button class="btn btn-fs">На весь экран</button>
          </div>
        </div>
      `;
      const video = card.querySelector("video");
      const volSlider = card.querySelector(".stream-vol");
      const btnFs = card.querySelector(".btn-fs");

      video.volume = deafened ? 0 : 0.8;
      volSlider.addEventListener("input", () => {
        video.volume = deafened ? 0 : Number(volSlider.value) / 100;
      });
      btnFs.addEventListener("click", () => {
        if (video.requestFullscreen) video.requestFullscreen();
      });

      entry.screenCard = card;
      streamsGrid.appendChild(card);
    }

    const video = entry.screenCard.querySelector("video");
    video.srcObject = stream;
    video.play().catch(() => {});
    updateStageVisibility();
  }

  function removeRemoteScreen(entry) {
    if (entry.screenCard) {
      entry.screenCard.remove();
      entry.screenCard = null;
    }
    entry.screenStream = null;
    updateStageVisibility();
  }

  function updateStageVisibility() {
    const hasStreams = streamsGrid.children.length > 0;
    streamsGrid.classList.toggle("hidden", !hasStreams);
    stageEmpty.classList.toggle("hidden", hasStreams);
  }

  async function handleSignal(fromId, payload) {
    const entry = peers.get(fromId);
    if (!entry) return;
    const pc = entry.pc;

    try {
      if (payload.description) {
        const desc = payload.description;
        const offerCollision =
          desc.type === "offer" &&
          (entry.makingOffer || pc.signalingState !== "stable");

        entry.ignoreOffer = !entry.polite && offerCollision;
        if (entry.ignoreOffer) return;

        await pc.setRemoteDescription(desc);
        if (desc.type === "offer") {
          await pc.setLocalDescription();
          wsSend({
            type: "signal",
            to: fromId,
            payload: { description: pc.localDescription },
          });
        }
      } else if (payload.candidate) {
        try {
          await pc.addIceCandidate(payload.candidate);
        } catch (err) {
          if (!entry.ignoreOffer) console.warn("ICE error:", err);
        }
      }
    } catch (err) {
      console.error("Signal handling error:", err);
    }
  }

  function removePeer(peerId) {
    const entry = peers.get(peerId);
    if (!entry) return;
    entry.pc.close();
    if (entry.voiceAudioEl) entry.voiceAudioEl.remove();
    if (entry.screenCard) entry.screenCard.remove();
    peers.delete(peerId);
    renderPeersList();
    updateStageVisibility();
  }

  // --- Screen Share (1080p 60fps + Audio) ---
  async function toggleScreenShare() {
    if (sharing) {
      stopScreenShare();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 60, max: 60 },
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        systemAudio: "include",
      });

      localScreenStream = stream;
      sharing = true;
      btnShare.classList.add("active");
      btnShare.textContent = "Стоп экран";

      // Превью своего экрана (без звука, чтобы не было эха)
      renderLocalScreenPreview(stream);

      for (const entry of peers.values()) {
        attachScreenTracksToPeer(entry, stream);
      }

      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        videoTrack.onended = () => stopScreenShare();
      }

      broadcastSelfState();
    } catch (err) {
      console.warn("Отмена или ошибка захвата экрана:", err);
    }
  }

  function renderLocalScreenPreview(stream) {
    let localCard = document.getElementById("local-screen-card");
    if (!localCard) {
      localCard = document.createElement("div");
      localCard.id = "local-screen-card";
      localCard.className = "stream-card";
      localCard.innerHTML = `
        <video autoplay muted playsinline></video>
        <div class="stream-footer">
          <span>Твой экран (1080p60)</span>
          <button class="btn btn-danger" id="btn-stop-inline">Остановить</button>
        </div>
      `;
      localCard.querySelector("#btn-stop-inline").addEventListener("click", stopScreenShare);
      streamsGrid.prepend(localCard);
    }
    const video = localCard.querySelector("video");
    video.srcObject = stream;
    video.play().catch(() => {});
    updateStageVisibility();
  }

  function stopScreenShare() {
    if (!localScreenStream) return;

    const trackIds = new Set(localScreenStream.getTracks().map((t) => t.id));
    for (const entry of peers.values()) {
      for (const sender of entry.pc.getSenders()) {
        if (sender.track && trackIds.has(sender.track.id)) {
          entry.pc.removeTrack(sender);
        }
      }
    }

    for (const track of localScreenStream.getTracks()) {
      track.stop();
    }
    localScreenStream = null;
    sharing = false;
    btnShare.classList.remove("active");
    btnShare.textContent = "Экран 1080p60";

    const localCard = document.getElementById("local-screen-card");
    if (localCard) localCard.remove();

    updateStageVisibility();
    broadcastSelfState();
  }

  // --- Controls ---
  function toggleMute() {
    muted = !muted;
    if (localMicStream) {
      for (const t of localMicStream.getAudioTracks()) {
        t.enabled = !muted;
      }
    }
    btnMute.textContent = muted ? "Микрофон: ВЫКЛ" : "Микрофон: ВКЛ";
    btnMute.classList.toggle("off", muted);
    broadcastSelfState();
    renderPeersList();
  }

  function toggleDeafen() {
    deafened = !deafened;
    for (const entry of peers.values()) {
      if (entry.voiceGain) {
        entry.voiceGain.gain.value = deafened ? 0 : entry.volume / 100;
      }
      if (entry.screenCard) {
        const v = entry.screenCard.querySelector("video");
        const s = entry.screenCard.querySelector(".stream-vol");
        if (v && s) v.volume = deafened ? 0 : Number(s.value) / 100;
      }
    }
    btnDeafen.textContent = deafened ? "Звук: ВЫКЛ" : "Звук: ВКЛ";
    btnDeafen.classList.toggle("off", deafened);
    broadcastSelfState();
    renderPeersList();
  }

  function broadcastSelfState() {
    wsSend({ type: "state_update", muted, deafened, sharing });
  }

  // --- Voice Activity Indicator ---
  function startVadLoop() {
    const buf = new Uint8Array(128);
    const getLevel = (analyser) => {
      if (!analyser) return 0;
      analyser.getByteFrequencyData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i];
      return sum / buf.length;
    };

    vadTimer = setInterval(() => {
      const selfCard = document.getElementById("peer-card-self");
      if (selfCard) {
        const speaking = !muted && getLevel(localMicAnalyser) > 14;
        selfCard.classList.toggle("speaking", speaking);
      }

      for (const [id, entry] of peers.entries()) {
        const card = document.getElementById(`peer-card-${id}`);
        if (!card) continue;
        const speaking = !entry.meta.muted && getLevel(entry.analyser) > 14;
        card.classList.toggle("speaking", speaking);
      }
    }, 90);
  }

  // --- UI Render ---
  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function renderPeersList() {
    peerCount.textContent = `${peers.size + 1} / 5`;
    peersList.innerHTML = "";

    // Карточка себя
    const selfCard = document.createElement("div");
    selfCard.id = "peer-card-self";
    selfCard.className = "peer-card";
    selfCard.innerHTML = `
      <div class="peer-top">
        <div class="peer-name"><span class="status-dot"></span>${escapeHtml(selfName)} <span class="muted">(ты)</span></div>
        <div class="peer-badges">
          ${sharing ? '<span class="badge-live">LIVE</span>' : ""}
          ${muted ? "<span>🔇</span>" : ""}
          ${deafened ? "<span>🔕</span>" : ""}
        </div>
      </div>
    `;
    peersList.appendChild(selfCard);

    // Карточки друзей с ползунком громкости 0-200%
    for (const [id, entry] of peers.entries()) {
      const card = document.createElement("div");
      card.id = `peer-card-${id}`;
      card.className = "peer-card";
      card.innerHTML = `
        <div class="peer-top">
          <div class="peer-name"><span class="status-dot"></span>${escapeHtml(entry.meta.name)}</div>
          <div class="peer-badges">
            ${entry.meta.sharing ? '<span class="badge-live">LIVE</span>' : ""}
            ${entry.meta.muted ? "<span>🔇</span>" : ""}
            ${entry.meta.deafened ? "<span>🔕</span>" : ""}
          </div>
        </div>
        <div class="volume-row">
          <span>Громкость</span>
          <input type="range" min="0" max="200" value="${entry.volume}" />
          <span class="vol-val">${entry.volume}%</span>
        </div>
      `;

      const slider = card.querySelector("input[type='range']");
      const volVal = card.querySelector(".vol-val");
      slider.addEventListener("input", () => {
        entry.volume = Number(slider.value);
        volVal.textContent = `${entry.volume}%`;
        localStorage.setItem(`vv_vol_${entry.meta.name}`, String(entry.volume));
        if (entry.voiceGain && !deafened) {
          entry.voiceGain.gain.value = entry.volume / 100;
        }
      });

      peersList.appendChild(card);
    }
  }

  // --- Join / Leave ---
  async function connectAndJoin(ev) {
    ev.preventDefault();
    hideLoginError();

    selfName = inputName.value.trim();
    const room = inputRoom.value.trim();
    const password = inputPass.value;
    const serverUrl = inputServer.value.trim();

    localStorage.setItem("vv_name", selfName);
    localStorage.setItem("vv_room", room);
    localStorage.setItem("vv_server", serverUrl);
    localStorage.setItem("vv_turn_url", inputTurnUrl.value.trim());
    localStorage.setItem("vv_turn_user", inputTurnUser.value.trim());

    try {
      await initAudio();
    } catch (err) {
      showLoginError("Нет доступа к микрофону: " + err.message);
      return;
    }

    try {
      ws = new WebSocket(serverUrl);
    } catch (err) {
      showLoginError("Некорректный адрес сервера: " + err.message);
      return;
    }

    ws.onopen = () => {
      wsSend({ type: "join", room, name: selfName, password: password || null });
      pingTimer = setInterval(() => {
        wsSend({ type: "ping", ts: Date.now() });
      }, 3000);
    };

    ws.onerror = () => {
      showLoginError("Не удалось подключиться к серверу сигналинга. Проверь адрес и порт.");
    };

    ws.onclose = () => {
      if (!roomView.classList.contains("hidden")) {
        leaveRoom();
        showLoginError("Соединение с сервером потеряно.");
      }
    };

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "error":
          showLoginError(msg.message);
          leaveRoom(false);
          break;
        case "pong":
          pingBadge.textContent = `Пинг: ${Date.now() - msg.ts} мс`;
          break;
        case "joined":
          selfId = msg.self_id;
          roomTitle.textContent = `# ${msg.room}`;
          loginView.classList.add("hidden");
          roomView.classList.remove("hidden");
          for (const p of msg.peers) {
            createPeer(p);
          }
          renderPeersList();
          startVadLoop();
          break;
        case "peer_joined":
          createPeer(msg.peer);
          break;
        case "peer_left":
          removePeer(msg.peer_id);
          break;
        case "peer_state": {
          const entry = peers.get(msg.peer.id);
          if (entry) {
            entry.meta = msg.peer;
            if (!msg.peer.sharing) removeRemoteScreen(entry);
            renderPeersList();
          }
          break;
        }
        case "signal":
          await handleSignal(msg.from, msg.payload);
          break;
      }
    };
  }

  function leaveRoom(closeSocket = true) {
    if (pingTimer) clearInterval(pingTimer);
    if (vadTimer) clearInterval(vadTimer);
    pingTimer = null;
    vadTimer = null;

    stopScreenShare();
    for (const id of [...peers.keys()]) {
      removePeer(id);
    }

    if (localMicStream) {
      for (const t of localMicStream.getTracks()) t.stop();
      localMicStream = null;
    }
    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    if (closeSocket && ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }

    muted = false;
    deafened = false;
    btnMute.textContent = "Микрофон: ВКЛ";
    btnMute.classList.remove("off");
    btnDeafen.textContent = "Звук: ВКЛ";
    btnDeafen.classList.remove("off");

    roomView.classList.add("hidden");
    loginView.classList.remove("hidden");
  }

  // Горячие клавиши внутри окна (M — мут, D — звук)
  window.addEventListener("keydown", (e) => {
    if (roomView.classList.contains("hidden")) return;
    if (e.target.tagName === "INPUT") return;
    if (e.code === "KeyM") toggleMute();
    if (e.code === "KeyD") toggleDeafen();
  });

  joinForm.addEventListener("submit", connectAndJoin);
  btnMute.addEventListener("click", toggleMute);
  btnDeafen.addEventListener("click", toggleDeafen);
  btnShare.addEventListener("click", toggleScreenShare);
  btnLeave.addEventListener("click", () => leaveRoom(true));

  loadSavedPrefs();
  populateMicrophones();
})();
