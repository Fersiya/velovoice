(() => {
  "use strict";

  const tauriInvoke =
    window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke
      ? window.__TAURI__.core.invoke
      : null;

  // --- DOM Elements ---
  const loginView = document.getElementById("login-view");
  const roomView = document.getElementById("room-view");
  const joinForm = document.getElementById("join-form");
  const loginError = document.getElementById("login-error");
  const btnSubmitJoin = document.getElementById("btn-submit-join");
  const modeTabs = document.querySelectorAll(".mode-tab");
  const hostFields = document.getElementById("host-fields");
  const joinFields = document.getElementById("join-fields");

  const inputName = document.getElementById("input-name");
  const loginAvatarPreview = document.getElementById("login-avatar-preview");
  const colorSwatches = document.getElementById("color-swatches");

  const inputHostRoom = document.getElementById("input-host-room");
  const inputHostPort = document.getElementById("input-host-port");
  const inputHostPass = document.getElementById("input-host-pass");

  const inputInvite = document.getElementById("input-invite");
  const btnPasteInvite = document.getElementById("btn-paste-invite");
  const inviteParsedBadge = document.getElementById("invite-parsed-badge");
  const inputServer = document.getElementById("input-server");
  const inputRoom = document.getElementById("input-room");
  const inputPass = document.getElementById("input-pass");
  const inputTurnUrl = document.getElementById("input-turn-url");
  const inputTurnUser = document.getElementById("input-turn-user");
  const inputTurnPass = document.getElementById("input-turn-pass");

  // Audio settings modal DOM
  const modalAudio = document.getElementById("modal-audio");
  const selectMic = document.getElementById("select-mic");
  const selectSpeaker = document.getElementById("select-speaker");
  const btnRefreshDevices = document.getElementById("btn-refresh-devices");
  const optNoise = document.getElementById("opt-noise");
  const optEcho = document.getElementById("opt-echo");
  const optAgc = document.getElementById("opt-agc");
  const optSfx = document.getElementById("opt-sfx");
  const inputVadThreshold = document.getElementById("input-vad-threshold");
  const vadValLabel = document.getElementById("vad-val-label");
  const testVuFill = document.getElementById("test-vu-fill");
  const testVadMarker = document.getElementById("test-vad-marker");
  const micTestState = document.getElementById("mic-test-state");
  const btnToggleMicTest = document.getElementById("btn-toggle-mic-test");

  // Stream modal DOM
  const modalStream = document.getElementById("modal-stream");
  const streamRes = document.getElementById("stream-res");
  const streamFps = document.getElementById("stream-fps");
  const streamBitrate = document.getElementById("stream-bitrate");
  const streamAudio = document.getElementById("stream-audio");
  const btnConfirmStream = document.getElementById("btn-confirm-stream");

  // Invite modal DOM
  const modalInvite = document.getElementById("modal-invite");
  const inviteHostEndpoints = document.getElementById("invite-host-endpoints");
  const selectInviteEndpoint = document.getElementById("select-invite-endpoint");
  const inviteCodeOutput = document.getElementById("invite-code-output");
  const btnCopyInvite = document.getElementById("btn-copy-invite");

  // Workspace DOM
  const roomTitle = document.getElementById("room-title");
  const topbarRoomName = document.getElementById("topbar-room-name");
  const pingBadge = document.getElementById("ping-badge");
  const connDot = document.getElementById("conn-dot");
  const hostBadge = document.getElementById("host-badge");
  const peerCount = document.getElementById("peer-count");
  const peersList = document.getElementById("peers-list");
  const voiceGrid = document.getElementById("voice-grid");
  const streamsGrid = document.getElementById("streams-grid");
  const hiddenAudioSink = document.getElementById("hidden-audio-sink");

  const dockSelfCard = document.getElementById("dock-self-card");
  const dockAvatar = document.getElementById("dock-avatar");
  const dockName = document.getElementById("dock-name");
  const dockStatus = document.getElementById("dock-status");
  const footerMicDot = document.getElementById("footer-mic-dot");
  const footerMicLabel = document.getElementById("footer-mic-label");
  const footerVuFill = document.getElementById("footer-vu-fill");

  const btnMute = document.getElementById("btn-mute");
  const btnDeafen = document.getElementById("btn-deafen");
  const iconMicOn = document.getElementById("icon-mic-on");
  const iconMicOff = document.getElementById("icon-mic-off");
  const iconDeafOff = document.getElementById("icon-deaf-off");
  const iconDeafOn = document.getElementById("icon-deaf-on");
  const btnShare = document.getElementById("btn-share");
  const btnLeave = document.getElementById("btn-leave");
  const btnOpenInvite = document.getElementById("btn-open-invite");
  const btnAudioSettings = document.getElementById("btn-audio-settings");
  const btnLoginAudio = document.getElementById("btn-login-audio");

  // Chat DOM
  const chatDrawer = document.getElementById("chat-drawer");
  const btnToggleChat = document.getElementById("btn-toggle-chat");
  const btnCloseChat = document.getElementById("btn-close-chat");
  const chatUnreadBadge = document.getElementById("chat-unread-badge");
  const chatMessages = document.getElementById("chat-messages");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");

  // RAM DOM
  const loginRamPill = document.getElementById("login-ram-pill");
  const roomRamTotal = document.getElementById("room-ram-total");
  const roomRamDetail = document.getElementById("room-ram-detail");
  const toastEl = document.getElementById("toast");

  // --- Constants & State ---
  const AVATAR_COLORS = [
    "#5865f2",
    "#23a55a",
    "#e11d48",
    "#ea580c",
    "#d97706",
    "#0891b2",
    "#7c3aed",
    "#db2777",
  ];

  let authMode = "host"; // 'host' | 'join'
  let selfColor = localStorage.getItem("vv_color") || AVATAR_COLORS[0];
  let selfId = null;
  let selfName = "";
  let currentRoom = "";
  let currentPassword = "";
  let currentServerUrl = "";
  let isHost = false;
  let hostEndpoints = [];
  let maxPeers = 8;

  let ws = null;
  let muted = false;
  let deafened = false;
  let sharing = false;
  let unreadChat = 0;

  let pingTimer = null;
  let vadRaf = null;
  let toastTimer = null;

  let audioCtx = null;
  let localMicStream = null;
  let localMicAnalyser = null;
  let localMicSource = null;
  let localScreenStream = null;
  let selfSpeakingUntil = 0;
  let selfSpeaking = false;

  // Mic test state
  let micTestActive = false;
  let testAudioCtx = null;
  let testStream = null;
  let testAnalyser = null;
  let testLoopbackEl = null;
  let testRaf = null;

  // Preferences
  let selectedMicId = localStorage.getItem("vv_mic_id") || "";
  let selectedSpeakerId = localStorage.getItem("vv_speaker_id") || "";
  let vadThresholdPct = Number(localStorage.getItem("vv_vad_pct") || 15);

  /** @type {Map<string, any>} */
  const peers = new Map();

  // --- Toast Helper ---
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2600);
  }

  // --- Soft UI Sounds (Web Audio Synth) ---
  function playTone(freqs, duration = 0.09, gainVal = 0.06) {
    if (!optSfx.checked) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, now + idx * 0.065);
        g.gain.setValueAtTime(0.0001, now + idx * 0.065);
        g.gain.exponentialRampToValueAtTime(gainVal, now + idx * 0.065 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.065 + duration);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + idx * 0.065);
        osc.stop(now + idx * 0.065 + duration + 0.02);
      });
      setTimeout(() => ctx.close().catch(() => {}), 500);
    } catch {}
  }

  // --- Invite Code Encoding / Decoding ---
  function encodeInviteCode(wsUrl, room, password, turnUrl, turnUser, turnPass) {
    const payload = { s: wsUrl, r: room };
    if (password) payload.p = password;
    if (turnUrl) {
      payload.t = turnUrl;
      if (turnUser) payload.tu = turnUser;
      if (turnPass) payload.tp = turnPass;
    }
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return "VV2:" + b64;
  }

  function decodeInviteCode(raw) {
    const clean = raw.trim();
    if (!clean.startsWith("VV2:")) return null;
    try {
      let b64 = clean.slice(4).replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const data = JSON.parse(new TextDecoder().decode(bytes));
      if (!data.s || !data.r) return null;
      return data;
    } catch {
      return null;
    }
  }

  // --- Avatar Swatches ---
  function initAvatarPicker() {
    colorSwatches.innerHTML = "";
    for (const color of AVATAR_COLORS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch" + (color === selfColor ? " selected" : "");
      btn.style.background = color;
      btn.addEventListener("click", () => {
        selfColor = color;
        localStorage.setItem("vv_color", color);
        updateAvatarPreview();
        initAvatarPicker();
      });
      colorSwatches.appendChild(btn);
    }
    updateAvatarPreview();
  }

  function updateAvatarPreview() {
    const letter = (inputName.value.trim()[0] || "V").toUpperCase();
    loginAvatarPreview.textContent = letter;
    loginAvatarPreview.style.background = selfColor;
  }

  // --- Mode Tabs ---
  function setAuthMode(mode) {
    authMode = mode;
    modeTabs.forEach((t) => t.classList.toggle("active", t.dataset.mode === mode));
    hostFields.classList.toggle("hidden", mode !== "host");
    joinFields.classList.toggle("hidden", mode !== "join");
    btnSubmitJoin.textContent =
      mode === "host" ? "Создать комнату и войти" : "Подключиться к голосу";
    hideLoginError();
  }

  modeTabs.forEach((t) => t.addEventListener("click", () => setAuthMode(t.dataset.mode)));

  // --- Invite Paste & Auto-parse ---
  function handleInviteInput() {
    const parsed = decodeInviteCode(inputInvite.value);
    if (parsed) {
      inputServer.value = parsed.s;
      inputRoom.value = parsed.r;
      inputPass.value = parsed.p || "";
      if (parsed.t) inputTurnUrl.value = parsed.t;
      if (parsed.tu) inputTurnUser.value = parsed.tu;
      if (parsed.tp) inputTurnPass.value = parsed.tp;

      const hostDisplay = parsed.s.replace(/^wss?:\/\//, "").replace(/\/ws$/, "");
      inviteParsedBadge.textContent = `Готово к входу: #${parsed.r} • Сервер ${hostDisplay}`;
      inviteParsedBadge.classList.remove("hidden");
    } else {
      inviteParsedBadge.classList.add("hidden");
    }
  }

  inputInvite.addEventListener("input", handleInviteInput);

  btnPasteInvite.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        inputInvite.value = text.trim();
        handleInviteInput();
      }
    } catch {
      showToast("Вставь код сочетанием Ctrl+V");
      inputInvite.focus();
    }
  });

  // --- RAM Monitoring via Rust ---
  async function pollMemoryStats() {
    if (!tauriInvoke) {
      loginRamPill.textContent = "RAM: браузерный режим";
      roomRamTotal.textContent = "—";
      roomRamDetail.textContent = "Запусти через velovoice.exe";
      return;
    }
    try {
      const stats = await tauriInvoke("get_memory_stats");
      const total = `${stats.total_mb.toFixed(1)} МБ`;
      loginRamPill.textContent = `RAM: ${total}`;
      loginRamPill.title = `Ядро Rust: ${stats.app_mb.toFixed(1)} МБ • WebView2 (${stats.webview_procs} проц.): ${stats.webview_mb.toFixed(1)} МБ`;
      roomRamTotal.textContent = total;
      roomRamDetail.textContent = `Rust: ${stats.app_mb.toFixed(1)} МБ • WebView2 (${stats.webview_procs}): ${stats.webview_mb.toFixed(1)} МБ`;
    } catch {}
  }

  setInterval(pollMemoryStats, 3000);
  pollMemoryStats();

  // --- Audio Device Enumeration (Reliable with Permission Probe) ---
  async function refreshAudioDevices(requestPermissionIfEmpty = false) {
    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      const hasLabels = devices.some((d) => d.kind === "audioinput" && d.label);

      if (!hasLabels && requestPermissionIfEmpty) {
        try {
          const probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          probe.getTracks().forEach((t) => t.stop());
          devices = await navigator.mediaDevices.enumerateDevices();
        } catch (err) {
          showToast("Нет доступа к микрофону: проверь права Windows");
        }
      }

      const mics = devices.filter((d) => d.kind === "audioinput");
      const speakers = devices.filter((d) => d.kind === "audiooutput");

      selectMic.innerHTML = "";
      if (mics.length === 0) {
        selectMic.innerHTML = '<option value="">Микрофон не найден</option>';
      } else {
        for (const m of mics) {
          const opt = document.createElement("option");
          opt.value = m.deviceId;
          opt.textContent = m.label || `Микрофон (${m.deviceId.slice(0, 6) || "по умолчанию"})`;
          selectMic.appendChild(opt);
        }
        if (selectedMicId && mics.some((m) => m.deviceId === selectedMicId)) {
          selectMic.value = selectedMicId;
        }
      }

      selectSpeaker.innerHTML = "";
      if (speakers.length === 0) {
        selectSpeaker.innerHTML = '<option value="">По умолчанию (система)</option>';
      } else {
        for (const s of speakers) {
          const opt = document.createElement("option");
          opt.value = s.deviceId;
          opt.textContent = s.label || `Вывод (${s.deviceId.slice(0, 6) || "по умолчанию"})`;
          selectSpeaker.appendChild(opt);
        }
        if (selectedSpeakerId && speakers.some((s) => s.deviceId === selectedSpeakerId)) {
          selectSpeaker.value = selectedSpeakerId;
        }
      }
    } catch (err) {
      console.warn("enumerateDevices error:", err);
    }
  }

  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", () => refreshAudioDevices(false));
  }

  // --- Accurate RMS Volume Calculation (0..100 scale) ---
  function computeRmsLevel(analyser, buf) {
    if (!analyser) return 0;
    analyser.getFloatTimeDomainData(buf);
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) {
      sumSq += buf[i] * buf[i];
    }
    const rms = Math.sqrt(sumSq / buf.length);
    // Boost logarithmically/perceptually into 0..100 range
    return Math.min(100, Math.round(rms * 380));
  }

  // --- Build Mic Constraints (Graceful fallback with ideal, never OverconstrainedError) ---
  function getMicConstraints() {
    const micId = selectMic.value || selectedMicId;
    return {
      audio: {
        deviceId: micId && micId !== "default" ? { ideal: micId } : undefined,
        echoCancellation: optEcho.checked,
        noiseSuppression: optNoise.checked,
        autoGainControl: optAgc.checked,
        channelCount: 1,
        sampleRate: 48000,
      },
      video: false,
    };
  }

  // --- Apply Output Speaker Device (`setSinkId`) ---
  async function applySpeakerToElement(el) {
    if (!el || typeof el.setSinkId !== "function") return;
    if (!selectedSpeakerId) return;
    try {
      await el.setSinkId(selectedSpeakerId);
    } catch {}
  }

  async function applySpeakerToAllOutputs() {
    if (audioCtx && typeof audioCtx.setSinkId === "function" && selectedSpeakerId) {
      try {
        await audioCtx.setSinkId(selectedSpeakerId);
      } catch {}
    }
    for (const entry of peers.values()) {
      if (entry.screenCard) {
        const video = entry.screenCard.querySelector("video");
        await applySpeakerToElement(video);
      }
    }
    if (testLoopbackEl) {
      await applySpeakerToElement(testLoopbackEl);
    }
  }

  // --- Live Mic Swap while in a room ---
  async function hotSwapMicrophone() {
    if (!localMicStream || !audioCtx) return;
    try {
      const newStream = await navigator.mediaDevices.getUserMedia(getMicConstraints());
      const newTrack = newStream.getAudioTracks()[0];
      if (!newTrack) return;
      newTrack.enabled = !muted;

      const oldTrack = localMicStream.getAudioTracks()[0];

      // Replace in all peer connections without renegotiation drop
      for (const entry of peers.values()) {
        const sender = entry.pc
          .getSenders()
          .find((s) => s.track && oldTrack && s.track.id === oldTrack.id);
        if (sender) {
          await sender.replaceTrack(newTrack);
        }
      }

      // Rewire local analyser
      if (localMicSource) {
        try { localMicSource.disconnect(); } catch {}
      }
      localMicStream.getTracks().forEach((t) => t.stop());
      localMicStream = newStream;
      localMicSource = audioCtx.createMediaStreamSource(localMicStream);
      localMicSource.connect(localMicAnalyser);

      showToast("Микрофон обновлён без разрыва связи");
    } catch (err) {
      showToast("Ошибка смены микрофона: " + err.message);
    }
  }

  // --- Mic Test Loop ("Проверка микрофона") ---
  async function startMicTest() {
    stopMicTest();
    try {
      testStream = await navigator.mediaDevices.getUserMedia(getMicConstraints());
      testAudioCtx = new (window.AudioContext || window.webkitAudioContext)({
        latencyHint: "interactive",
      });
      if (testAudioCtx.state === "suspended") await testAudioCtx.resume();

      const src = testAudioCtx.createMediaStreamSource(testStream);
      testAnalyser = testAudioCtx.createAnalyser();
      testAnalyser.fftSize = 512;
      src.connect(testAnalyser);

      // Route to speaker via <audio> so setSinkId works
      testLoopbackEl = document.createElement("audio");
      testLoopbackEl.autoplay = true;
      testLoopbackEl.srcObject = testStream;
      await applySpeakerToElement(testLoopbackEl);
      testLoopbackEl.play().catch(() => {});

      micTestActive = true;
      btnToggleMicTest.textContent = "Остановить тест";
      btnToggleMicTest.classList.remove("btn-primary");
      btnToggleMicTest.classList.add("btn-danger");

      const buf = new Float32Array(testAnalyser.fftSize);
      const tick = () => {
        if (!micTestActive) return;
        const level = computeRmsLevel(testAnalyser, buf);
        testVuFill.style.width = `${level}%`;
        const isTalking = level >= vadThresholdPct;
        micTestState.textContent = isTalking ? "Голос слышен!" : "Тишина";
        micTestState.classList.toggle("active", isTalking);
        testRaf = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      showToast("Нет доступа к микрофону: " + err.message);
      stopMicTest();
    }
  }

  function stopMicTest() {
    micTestActive = false;
    if (testRaf) cancelAnimationFrame(testRaf);
    testRaf = null;
    if (testLoopbackEl) {
      testLoopbackEl.pause();
      testLoopbackEl.srcObject = null;
      testLoopbackEl = null;
    }
    if (testStream) {
      testStream.getTracks().forEach((t) => t.stop());
      testStream = null;
    }
    if (testAudioCtx) {
      testAudioCtx.close().catch(() => {});
      testAudioCtx = null;
    }
    testAnalyser = null;
    testVuFill.style.width = "0%";
    micTestState.textContent = "Тест выкл";
    micTestState.classList.remove("active");
    btnToggleMicTest.textContent = "Включить тест и слышать себя";
    btnToggleMicTest.classList.remove("btn-danger");
    btnToggleMicTest.classList.add("btn-primary");
  }

  btnToggleMicTest.addEventListener("click", () => {
    if (micTestActive) stopMicTest();
    else startMicTest();
  });

  // Update VAD threshold UI
  function syncVadUi() {
    inputVadThreshold.value = String(vadThresholdPct);
    vadValLabel.textContent = `${vadThresholdPct}%`;
    testVadMarker.style.left = `${vadThresholdPct}%`;
  }

  inputVadThreshold.addEventListener("input", () => {
    vadThresholdPct = Number(inputVadThreshold.value);
    localStorage.setItem("vv_vad_pct", String(vadThresholdPct));
    syncVadUi();
  });

  selectMic.addEventListener("change", () => {
    selectedMicId = selectMic.value;
    localStorage.setItem("vv_mic_id", selectedMicId);
    if (micTestActive) startMicTest();
    if (localMicStream) hotSwapMicrophone();
  });

  selectSpeaker.addEventListener("change", () => {
    selectedSpeakerId = selectSpeaker.value;
    localStorage.setItem("vv_speaker_id", selectedSpeakerId);
    applySpeakerToAllOutputs();
  });

  [optNoise, optEcho, optAgc].forEach((cb) => {
    cb.addEventListener("change", () => {
      localStorage.setItem("vv_ns", optNoise.checked ? "1" : "0");
      localStorage.setItem("vv_aec", optEcho.checked ? "1" : "0");
      localStorage.setItem("vv_agc", optAgc.checked ? "1" : "0");
      if (micTestActive) startMicTest();
      if (localMicStream) hotSwapMicrophone();
    });
  });

  optSfx.addEventListener("change", () => {
    localStorage.setItem("vv_sfx", optSfx.checked ? "1" : "0");
  });

  btnRefreshDevices.addEventListener("click", async () => {
    await refreshAudioDevices(true);
    showToast("Список аудиоустройств обновлён");
  });

  // --- Modals ---
  async function openAudioModal() {
    modalAudio.classList.remove("hidden");
    await refreshAudioDevices(true);
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add("hidden");
    if (id === "modal-audio") stopMicTest();
  }

  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
  });

  [modalAudio, modalStream, modalInvite].forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal(backdrop.id);
    });
  });

  btnLoginAudio.addEventListener("click", openAudioModal);
  btnAudioSettings.addEventListener("click", openAudioModal);

  // --- Invite Modal ---
  async function openInviteModal() {
    if (isHost && tauriInvoke) {
      try {
        const port = Number(inputHostPort.value) || 9000;
        hostEndpoints = await tauriInvoke("get_network_endpoints", { port });
      } catch {}
    }

    if (isHost && hostEndpoints.length > 0) {
      inviteHostEndpoints.classList.remove("hidden");
      selectInviteEndpoint.innerHTML = "";
      for (const ep of hostEndpoints) {
        const opt = document.createElement("option");
        opt.value = ep.ws_url;
        opt.textContent = ep.label;
        selectInviteEndpoint.appendChild(opt);
      }
      updateInviteOutputFromSelect();
    } else {
      inviteHostEndpoints.classList.add("hidden");
      inviteCodeOutput.value = encodeInviteCode(
        currentServerUrl,
        currentRoom,
        currentPassword,
        inputTurnUrl.value.trim(),
        inputTurnUser.value.trim(),
        inputTurnPass.value
      );
    }

    modalInvite.classList.remove("hidden");
  }

  function updateInviteOutputFromSelect() {
    const wsUrl = selectInviteEndpoint.value || currentServerUrl;
    inviteCodeOutput.value = encodeInviteCode(
      wsUrl,
      currentRoom,
      currentPassword,
      inputTurnUrl.value.trim(),
      inputTurnUser.value.trim(),
      inputTurnPass.value
    );
  }

  selectInviteEndpoint.addEventListener("change", updateInviteOutputFromSelect);
  btnOpenInvite.addEventListener("click", openInviteModal);

  btnCopyInvite.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(inviteCodeOutput.value);
      showToast("Код приглашения скопирован!");
    } catch {
      inviteCodeOutput.select();
      document.execCommand("copy");
      showToast("Код приглашения скопирован!");
    }
  });

  // --- WebRTC & Audio Init ---
  function buildRtcConfig() {
    const iceServers = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" },
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

  function wsSend(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  async function initVoiceAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: "interactive",
    });
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    if (typeof audioCtx.setSinkId === "function" && selectedSpeakerId) {
      try {
        await audioCtx.setSinkId(selectedSpeakerId);
      } catch {}
    }

    localMicStream = await navigator.mediaDevices.getUserMedia(getMicConstraints());
    // Refresh device names now that permission is guaranteed
    refreshAudioDevices(false);

    localMicSource = audioCtx.createMediaStreamSource(localMicStream);
    localMicAnalyser = audioCtx.createAnalyser();
    localMicAnalyser.fftSize = 512;
    localMicSource.connect(localMicAnalyser);
  }

  // --- Peer Management (Perfect Negotiation) ---
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
      speakingUntil: 0,
      speaking: false,
    };

    peers.set(meta.id, entry);

    if (localMicStream) {
      for (const track of localMicStream.getAudioTracks()) {
        const sender = pc.addTrack(track, localMicStream);
        tuneVoiceSender(sender);
      }
    }

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
        attachRemoteScreen(entry, stream);
        track.onended = () => removeRemoteScreen(entry);
        track.onmute = () => {
          if (track.readyState === "ended") removeRemoteScreen(entry);
        };
      } else if (track.kind === "audio") {
        const isScreenAudio =
          stream.getVideoTracks().length > 0 ||
          (entry.meta.screen_stream_id && stream.id === entry.meta.screen_stream_id) ||
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

    renderAllParticipants();
    return entry;
  }

  async function tuneVoiceSender(sender) {
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      params.encodings[0].maxBitrate = 64_000;
      await sender.setParameters(params);
    } catch {}
  }

  async function tuneScreenVideoSender(sender) {
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      params.encodings[0].maxBitrate = Number(streamBitrate.value) || 6_000_000;
      params.encodings[0].maxFramerate = Number(streamFps.value) || 60;
      params.degradationPreference = "maintain-framerate";
      await sender.setParameters(params);
    } catch {}
  }

  function attachScreenTracksToPeer(entry, stream) {
    for (const track of stream.getTracks()) {
      if (track.kind === "video") {
        try { track.contentHint = "motion"; } catch {}
      }
      const sender = entry.pc.addTrack(track, stream);
      if (track.kind === "video") {
        tuneScreenVideoSender(sender);
      }
    }
  }

  function attachRemoteVoice(entry, stream) {
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
      analyser.fftSize = 512;

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
        <div class="stream-video-wrap">
          <video autoplay playsinline></video>
          <span class="stream-quality-badge">LIVE</span>
        </div>
        <div class="stream-footer">
          <span class="stream-owner">
            <span class="badge-live">LIVE</span>
            ${escapeHtml(entry.meta.name)}
          </span>
          <div class="stream-controls">
            <span>Звук</span>
            <input type="range" min="0" max="100" value="80" class="stream-vol" />
            <button class="btn btn-sm btn-fs">На весь экран</button>
          </div>
        </div>
      `;
      const video = card.querySelector("video");
      const badge = card.querySelector(".stream-quality-badge");
      const volSlider = card.querySelector(".stream-vol");
      const btnFs = card.querySelector(".btn-fs");

      video.volume = deafened ? 0 : 0.8;
      applySpeakerToElement(video);

      video.addEventListener("resize", () => {
        if (video.videoHeight) {
          badge.textContent = `${video.videoWidth}×${video.videoHeight} LIVE`;
        }
      });

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
    updateStageLayout();
  }

  function removeRemoteScreen(entry) {
    if (entry.screenCard) {
      entry.screenCard.remove();
      entry.screenCard = null;
    }
    entry.screenStream = null;
    updateStageLayout();
  }

  function updateStageLayout() {
    const hasStreams = streamsGrid.children.length > 0;
    streamsGrid.classList.toggle("hidden", !hasStreams);
    voiceGrid.classList.toggle("compact", hasStreams);
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
      console.error("Signal error:", err);
    }
  }

  function removePeer(peerId) {
    const entry = peers.get(peerId);
    if (!entry) return;
    entry.pc.close();
    if (entry.voiceAudioEl) entry.voiceAudioEl.remove();
    if (entry.screenCard) entry.screenCard.remove();
    peers.delete(peerId);
    renderAllParticipants();
    updateStageLayout();
  }

  // --- Screen Share (Go Live Modal + Capture) ---
  btnShare.addEventListener("click", () => {
    if (sharing) {
      stopScreenShare();
    } else {
      modalStream.classList.remove("hidden");
    }
  });

  btnConfirmStream.addEventListener("click", async () => {
    closeModal("modal-stream");
    const [w, h] = streamRes.value.split("x").map(Number);
    const fps = Number(streamFps.value) || 60;
    const includeAudio = streamAudio.checked;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: w, max: w },
          height: { ideal: h, max: h },
          frameRate: { ideal: fps, max: fps },
        },
        audio: includeAudio
          ? {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            }
          : false,
        systemAudio: includeAudio ? "include" : "exclude",
      });

      localScreenStream = stream;
      sharing = true;
      btnShare.classList.add("active");
      btnShare.querySelector("span").textContent = "Стоп экран";
      playTone([520, 680], 0.08);

      renderLocalScreenPreview(stream, fps);

      // Broadcast stream ID first so peers route stream audio cleanly
      broadcastSelfState();

      for (const entry of peers.values()) {
        attachScreenTracksToPeer(entry, stream);
      }

      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        videoTrack.onended = () => stopScreenShare();
      }
      renderAllParticipants();
    } catch (err) {
      if (err.name !== "NotAllowedError") {
        showToast("Не удалось запустить трансляцию: " + err.message);
      }
    }
  });

  function renderLocalScreenPreview(stream, fps) {
    let localCard = document.getElementById("local-screen-card");
    if (!localCard) {
      localCard = document.createElement("div");
      localCard.id = "local-screen-card";
      localCard.className = "stream-card";
      localCard.innerHTML = `
        <div class="stream-video-wrap">
          <video autoplay muted playsinline></video>
          <span class="stream-quality-badge" id="local-stream-badge">ТВОЙ ЭКРАН</span>
        </div>
        <div class="stream-footer">
          <span class="stream-owner"><span class="badge-live">LIVE</span> Твоя трансляция</span>
          <button class="btn btn-sm btn-danger" id="btn-stop-inline">Остановить</button>
        </div>
      `;
      localCard.querySelector("#btn-stop-inline").addEventListener("click", stopScreenShare);
      streamsGrid.prepend(localCard);
    }
    const video = localCard.querySelector("video");
    const badge = localCard.querySelector("#local-stream-badge");
    video.srcObject = stream;
    video.addEventListener("resize", () => {
      if (video.videoHeight) {
        badge.textContent = `${video.videoWidth}×${video.videoHeight} @ ${fps} FPS`;
      }
    });
    video.play().catch(() => {});
    updateStageLayout();
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
    localScreenStream.getTracks().forEach((t) => t.stop());
    localScreenStream = null;
    sharing = false;
    btnShare.classList.remove("active");
    btnShare.querySelector("span").textContent = "Экран 1080p60";

    const localCard = document.getElementById("local-screen-card");
    if (localCard) localCard.remove();

    playTone([480, 360], 0.08);
    updateStageLayout();
    broadcastSelfState();
    renderAllParticipants();
  }

  // --- Controls (Mute / Deafen) ---
  function toggleMute() {
    muted = !muted;
    if (localMicStream) {
      localMicStream.getAudioTracks().forEach((t) => (t.enabled = !muted));
    }
    btnMute.classList.toggle("off", muted);
    iconMicOn.classList.toggle("hidden", muted);
    iconMicOff.classList.toggle("hidden", !muted);
    playTone(muted ? [320] : [520], 0.06, 0.04);
    updateDockStatus();
    broadcastSelfState();
    renderAllParticipants();
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
    btnDeafen.classList.toggle("off", deafened);
    iconDeafOff.classList.toggle("hidden", deafened);
    iconDeafOn.classList.toggle("hidden", !deafened);
    playTone(deafened ? [260] : [580], 0.06, 0.04);
    updateDockStatus();
    broadcastSelfState();
    renderAllParticipants();
  }

  function updateDockStatus() {
    if (deafened) {
      dockStatus.textContent = "Звук отключён";
    } else if (muted) {
      dockStatus.textContent = "Микрофон выкл";
    } else if (selfSpeaking) {
      dockStatus.textContent = "Говоришь...";
    } else {
      dockStatus.textContent = "В голосе";
    }
  }

  function broadcastSelfState() {
    wsSend({
      type: "state_update",
      muted,
      deafened,
      sharing,
      screen_stream_id: localScreenStream ? localScreenStream.id : null,
    });
  }

  // --- Accurate RMS Speaking Loop (requestAnimationFrame) ---
  function startVadLoop() {
    const buf = new Float32Array(512);
    const HOLD_MS = 220;

    const step = () => {
      if (!localMicAnalyser) return;
      const now = performance.now();

      // Local Mic Level & Speaking State
      const level = muted ? 0 : computeRmsLevel(localMicAnalyser, buf);
      footerVuFill.style.width = `${level}%`;

      if (level >= vadThresholdPct && !muted) {
        selfSpeakingUntil = now + HOLD_MS;
      }
      const nowSelfSpeaking = !muted && now < selfSpeakingUntil;

      if (nowSelfSpeaking !== selfSpeaking) {
        selfSpeaking = nowSelfSpeaking;
        dockSelfCard.classList.toggle("speaking", selfSpeaking);
        const sideSelf = document.getElementById("peer-item-self");
        if (sideSelf) sideSelf.classList.toggle("speaking", selfSpeaking);
        const tileSelf = document.getElementById("voice-tile-self");
        if (tileSelf) tileSelf.classList.toggle("speaking", selfSpeaking);
        updateDockStatus();
      }

      footerMicDot.classList.toggle("speaking", selfSpeaking);
      footerMicDot.classList.toggle("muted", muted);
      footerMicLabel.textContent = muted
        ? "Микрофон выключен"
        : selfSpeaking
        ? "Тебя слышно!"
        : "Микрофон слушает";

      // Remote Peers Speaking State
      for (const [id, entry] of peers.entries()) {
        if (!entry.analyser) continue;
        const pLevel = entry.meta.muted ? 0 : computeRmsLevel(entry.analyser, buf);
        if (pLevel >= 10 && !entry.meta.muted) {
          entry.speakingUntil = now + HOLD_MS;
        }
        const pSpeaking = !entry.meta.muted && now < entry.speakingUntil;
        if (pSpeaking !== entry.speaking) {
          entry.speaking = pSpeaking;
          const sideEl = document.getElementById(`peer-item-${id}`);
          if (sideEl) sideEl.classList.toggle("speaking", pSpeaking);
          const tileEl = document.getElementById(`voice-tile-${id}`);
          if (tileEl) tileEl.classList.toggle("speaking", pSpeaking);
        }
      }

      vadRaf = requestAnimationFrame(step);
    };

    vadRaf = requestAnimationFrame(step);
  }

  // --- Render Sidebar + Main Voice Stage ---
  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function firstChar(name) {
    return (name.trim()[0] || "?").toUpperCase();
  }

  function renderAllParticipants() {
    peerCount.textContent = `${peers.size + 1} / ${maxPeers}`;
    peersList.innerHTML = "";
    voiceGrid.innerHTML = "";

    // --- SELF ---
    const selfItem = document.createElement("div");
    selfItem.id = "peer-item-self";
    selfItem.className = "peer-item" + (selfSpeaking ? " speaking" : "");
    selfItem.innerHTML = `
      <div class="peer-row-top">
        <div class="avatar sm" style="background:${selfColor}">${escapeHtml(firstChar(selfName))}</div>
        <div class="peer-info">
          <div class="peer-name-line">${escapeHtml(selfName)} <span class="muted">(ты)</span></div>
        </div>
        <div class="peer-badges">
          ${sharing ? '<span class="badge-live">LIVE</span>' : ""}
          ${muted ? '<span title="Микрофон выкл">🔇</span>' : ""}
          ${deafened ? '<span title="Звук выкл">🔕</span>' : ""}
        </div>
      </div>
    `;
    peersList.appendChild(selfItem);

    const selfTile = document.createElement("div");
    selfTile.id = "voice-tile-self";
    selfTile.className = "voice-tile" + (selfSpeaking ? " speaking" : "");
    selfTile.innerHTML = `
      <div class="tile-corner-badges">
        ${sharing ? '<span class="badge-live">LIVE</span>' : ""}
        ${muted ? "<span>🔇</span>" : ""}
        ${deafened ? "<span>🔕</span>" : ""}
      </div>
      <div class="avatar lg" style="background:${selfColor}">${escapeHtml(firstChar(selfName))}</div>
      <div class="tile-name">${escapeHtml(selfName)} <span class="muted">(ты)</span></div>
      <div class="tile-speaking-tag">Говорит</div>
    `;
    voiceGrid.appendChild(selfTile);

    // --- REMOTE PEERS ---
    for (const [id, entry] of peers.entries()) {
      const color = entry.meta.avatar_color || "#5865f2";

      const item = document.createElement("div");
      item.id = `peer-item-${id}`;
      item.className = "peer-item" + (entry.speaking ? " speaking" : "");
      item.innerHTML = `
        <div class="peer-row-top">
          <div class="avatar sm" style="background:${color}">${escapeHtml(firstChar(entry.meta.name))}</div>
          <div class="peer-info">
            <div class="peer-name-line">${escapeHtml(entry.meta.name)}</div>
          </div>
          <div class="peer-badges">
            ${entry.meta.sharing ? '<span class="badge-live">LIVE</span>' : ""}
            ${entry.meta.muted ? '<span title="Микрофон выкл">🔇</span>' : ""}
            ${entry.meta.deafened ? '<span title="Звук выкл">🔕</span>' : ""}
          </div>
        </div>
        <div class="volume-row">
          <span>Громк.</span>
          <input type="range" min="0" max="200" value="${entry.volume}" />
          <span class="vol-val">${entry.volume}%</span>
        </div>
      `;

      const slider = item.querySelector("input[type='range']");
      const volVal = item.querySelector(".vol-val");
      slider.addEventListener("input", () => {
        entry.volume = Number(slider.value);
        volVal.textContent = `${entry.volume}%`;
        localStorage.setItem(`vv_vol_${entry.meta.name}`, String(entry.volume));
        if (entry.voiceGain && !deafened) {
          entry.voiceGain.gain.value = entry.volume / 100;
        }
      });
      peersList.appendChild(item);

      const tile = document.createElement("div");
      tile.id = `voice-tile-${id}`;
      tile.className = "voice-tile" + (entry.speaking ? " speaking" : "");
      tile.innerHTML = `
        <div class="tile-corner-badges">
          ${entry.meta.sharing ? '<span class="badge-live">LIVE</span>' : ""}
          ${entry.meta.muted ? "<span>🔇</span>" : ""}
          ${entry.meta.deafened ? "<span>🔕</span>" : ""}
        </div>
        <div class="avatar lg" style="background:${color}">${escapeHtml(firstChar(entry.meta.name))}</div>
        <div class="tile-name">${escapeHtml(entry.meta.name)}</div>
        <div class="tile-speaking-tag">Говорит</div>
      `;
      voiceGrid.appendChild(tile);
    }
  }

  // --- Text Chat ---
  function toggleChatDrawer(forceOpen = null) {
    const shouldOpen = forceOpen !== null ? forceOpen : chatDrawer.classList.contains("hidden");
    chatDrawer.classList.toggle("hidden", !shouldOpen);
    if (shouldOpen) {
      unreadChat = 0;
      chatUnreadBadge.classList.add("hidden");
      chatInput.focus();
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  btnToggleChat.addEventListener("click", () => toggleChatDrawer());
  btnCloseChat.addEventListener("click", () => toggleChatDrawer(false));

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    wsSend({ type: "chat", text });
    chatInput.value = "";
  });

  function appendChatMessage(msg) {
    const time = new Date(msg.ts || Date.now()).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const el = document.createElement("div");
    el.className = "chat-msg";
    el.innerHTML = `
      <div class="avatar sm" style="background:${msg.avatar_color || "#5865f2"}">${escapeHtml(firstChar(msg.from_name))}</div>
      <div class="chat-msg-body">
        <div class="chat-msg-meta">
          <span class="chat-author">${escapeHtml(msg.from_name)}</span>
          <span class="chat-time">${time}</span>
        </div>
        <div class="chat-text">${escapeHtml(msg.text)}</div>
      </div>
    `;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (chatDrawer.classList.contains("hidden") && msg.from_id !== selfId) {
      unreadChat += 1;
      chatUnreadBadge.textContent = String(unreadChat);
      chatUnreadBadge.classList.remove("hidden");
      playTone([660], 0.05, 0.03);
    }
  }

  // --- Login Error Helpers ---
  function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.classList.remove("hidden");
  }

  function hideLoginError() {
    loginError.classList.add("hidden");
  }

  // --- Connect & Join Flow ---
  async function connectAndJoin(ev) {
    ev.preventDefault();
    hideLoginError();
    stopMicTest();

    selfName = inputName.value.trim();
    if (!selfName) {
      showLoginError("Введи свой ник.");
      return;
    }

    localStorage.setItem("vv_name", selfName);
    localStorage.setItem("vv_turn_url", inputTurnUrl.value.trim());
    localStorage.setItem("vv_turn_user", inputTurnUser.value.trim());

    btnSubmitJoin.disabled = true;
    const prevBtnText = btnSubmitJoin.textContent;
    btnSubmitJoin.textContent = "Подключение...";

    try {
      if (authMode === "host") {
        const port = Number(inputHostPort.value) || 9000;
        currentRoom = inputHostRoom.value.trim() || "squad";
        currentPassword = inputHostPass.value;
        localStorage.setItem("vv_host_room", currentRoom);
        localStorage.setItem("vv_host_port", String(port));

        if (tauriInvoke) {
          const status = await tauriInvoke("start_host_server", { port, maxPeers: 8 });
          hostEndpoints = status.endpoints || [];
          currentServerUrl = status.local_ws;
          isHost = true;
        } else {
          currentServerUrl = `ws://127.0.0.1:${port}/ws`;
          isHost = true;
        }
      } else {
        // Parse invite code if pasted
        handleInviteInput();
        currentServerUrl = inputServer.value.trim();
        currentRoom = inputRoom.value.trim() || "squad";
        currentPassword = inputPass.value;
        localStorage.setItem("vv_server", currentServerUrl);
        localStorage.setItem("vv_room", currentRoom);
        isHost = false;
      }

      try {
        await initVoiceAudio();
      } catch (err) {
        showLoginError("Нет доступа к микрофону: " + err.message);
        return;
      }

      ws = new WebSocket(currentServerUrl);

      ws.onopen = () => {
        wsSend({
          type: "join",
          room: currentRoom,
          name: selfName,
          password: currentPassword || null,
          avatar_color: selfColor,
        });
        pingTimer = setInterval(() => {
          wsSend({ type: "ping", ts: Date.now() });
        }, 3000);
      };

      ws.onerror = () => {
        showLoginError(
          isHost
            ? "Не удалось подключиться к встроенному серверу. Попробуй другой порт."
            : "Не удалось подключиться к серверу. Проверь код приглашения, запущен ли хост у друга и включён ли Tailscale."
        );
        cleanupAudioAndSocket(false);
      };

      ws.onclose = () => {
        if (!roomView.classList.contains("hidden")) {
          leaveRoom(false);
          showLoginError("Соединение с комнатой потеряно.");
        }
      };

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "error":
            showLoginError(msg.message);
            leaveRoom(false);
            break;
          case "pong": {
            const ms = Date.now() - msg.ts;
            pingBadge.textContent = `Пинг: ${ms} мс`;
            connDot.className = "conn-dot " + (ms < 70 ? "good" : ms < 160 ? "warn" : "bad");
            break;
          }
          case "joined":
            selfId = msg.self_id;
            maxPeers = msg.max_peers || 8;
            roomTitle.textContent = msg.room;
            topbarRoomName.textContent = `# ${msg.room}`;
            hostBadge.classList.toggle("hidden", !isHost);

            dockAvatar.textContent = firstChar(selfName);
            dockAvatar.style.background = selfColor;
            dockName.textContent = selfName;
            updateDockStatus();

            loginView.classList.add("hidden");
            roomView.classList.remove("hidden");

            for (const p of msg.peers) {
              createPeer(p);
            }
            renderAllParticipants();
            startVadLoop();
            playTone([440, 587], 0.09);

            if (isHost) {
              showToast("Комната создана! Нажми кнопку приглашения слева сверху.");
            }
            break;
          case "peer_joined":
            createPeer(msg.peer);
            playTone([520, 660], 0.08);
            showToast(`${msg.peer.name} подключился`);
            break;
          case "peer_left": {
            const p = peers.get(msg.peer_id);
            if (p) showToast(`${p.meta.name} вышел`);
            removePeer(msg.peer_id);
            playTone([440, 330], 0.08);
            break;
          }
          case "peer_state": {
            const entry = peers.get(msg.peer.id);
            if (entry) {
              entry.meta = msg.peer;
              if (!msg.peer.sharing) removeRemoteScreen(entry);
              renderAllParticipants();
            }
            break;
          }
          case "chat":
            appendChatMessage(msg);
            break;
          case "signal":
            await handleSignal(msg.from, msg.payload);
            break;
        }
      };
    } catch (err) {
      showLoginError(String(err));
    } finally {
      btnSubmitJoin.disabled = false;
      btnSubmitJoin.textContent = prevBtnText;
    }
  }

  function cleanupAudioAndSocket(closeSocket = true) {
    if (pingTimer) clearInterval(pingTimer);
    if (vadRaf) cancelAnimationFrame(vadRaf);
    pingTimer = null;
    vadRaf = null;

    stopScreenShare();
    for (const id of [...peers.keys()]) {
      removePeer(id);
    }

    if (localMicStream) {
      localMicStream.getTracks().forEach((t) => t.stop());
      localMicStream = null;
    }
    localMicSource = null;
    localMicAnalyser = null;

    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    if (closeSocket && ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
  }

  async function leaveRoom(closeSocket = true) {
    cleanupAudioAndSocket(closeSocket);

    if (isHost && tauriInvoke) {
      try {
        await tauriInvoke("stop_host_server");
      } catch {}
    }
    isHost = false;
    selfSpeaking = false;
    muted = false;
    deafened = false;
    unreadChat = 0;

    btnMute.classList.remove("off");
    iconMicOn.classList.remove("hidden");
    iconMicOff.classList.add("hidden");
    btnDeafen.classList.remove("off");
    iconDeafOff.classList.remove("hidden");
    iconDeafOn.classList.add("hidden");
    chatDrawer.classList.add("hidden");
    chatUnreadBadge.classList.add("hidden");

    roomView.classList.add("hidden");
    loginView.classList.remove("hidden");
    playTone([392, 293], 0.09);
  }

  // --- Hotkeys ---
  window.addEventListener("keydown", (e) => {
    if (roomView.classList.contains("hidden")) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
    if (e.code === "KeyM") toggleMute();
    if (e.code === "KeyD") toggleDeafen();
    if (e.code === "KeyT") toggleChatDrawer();
  });

  // --- Load Saved Preferences ---
  function loadSavedPrefs() {
    inputName.value = localStorage.getItem("vv_name") || "";
    inputHostRoom.value = localStorage.getItem("vv_host_room") || "squad";
    inputHostPort.value = localStorage.getItem("vv_host_port") || "9000";
    inputRoom.value = localStorage.getItem("vv_room") || "squad";
    inputServer.value = localStorage.getItem("vv_server") || "ws://127.0.0.1:9000/ws";
    inputTurnUrl.value = localStorage.getItem("vv_turn_url") || "";
    inputTurnUser.value = localStorage.getItem("vv_turn_user") || "";

    optNoise.checked = localStorage.getItem("vv_ns") !== "0";
    optEcho.checked = localStorage.getItem("vv_aec") !== "0";
    optAgc.checked = localStorage.getItem("vv_agc") === "1";
    optSfx.checked = localStorage.getItem("vv_sfx") !== "0";

    syncVadUi();
    initAvatarPicker();
    inputName.addEventListener("input", updateAvatarPreview);
  }

  joinForm.addEventListener("submit", connectAndJoin);
  btnMute.addEventListener("click", toggleMute);
  btnDeafen.addEventListener("click", toggleDeafen);
  btnLeave.addEventListener("click", () => leaveRoom(true));

  loadSavedPrefs();
  refreshAudioDevices(false);
})();
