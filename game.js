/* =====================================================================
 * Tron Light Cycles
 * ===================================================================== */

(() => {
  "use strict";

  // -------------------- Config --------------------
  const COLS = 40;
  const ROWS = 30;
  const TICK_BASE_MS = 80;
  const TICK_MIN_MS = 42;
  const TICK_STEP_MS = 6;
  const MAX_ROUNDS = 5;
  const MAX_LEADERS = 3;
  const CPU_RANDOM_TURN_CHANCE = 0.10;

  const COLORS = {
    boardBg:   "#0b0e13",
    grid:      "rgba(255, 255, 255, 0.025)",
    p1Trail:   "#22c997",
    p1TrailDim:"rgba(34, 201, 151, 0.45)",
    p1Head:    "#54e6b8",
    p1Glow:    "rgba(34, 201, 151, 0.55)",
    p2Trail:   "#e5484d",
    p2TrailDim:"rgba(229, 72, 77, 0.45)",
    p2Head:    "#ff7a7e",
    p2Glow:    "rgba(229, 72, 77, 0.55)",
  };

  const LS_KEYS = {
    name: "tron.player",
    leaderboard: "tron.leaderboard",
  };

  const DIRS = {
    Up:    { x: 0,  y: -1 },
    Down:  { x: 0,  y:  1 },
    Left:  { x: -1, y:  0 },
    Right: { x: 1,  y:  0 },
  };
  const DIR_LIST = [DIRS.Up, DIRS.Down, DIRS.Left, DIRS.Right];

  // -------------------- DOM --------------------
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const els = {
    scoreValue: document.getElementById("scoreValue"),
    cpuValue:   document.getElementById("cpuValue"),
    roundValue: document.getElementById("roundValue"),
    playerName: document.getElementById("playerName"),
    changePlayerBtn: document.getElementById("changePlayerBtn"),

    overlayStart:  document.getElementById("overlayStart"),
    overlayPaused: document.getElementById("overlayPaused"),
    overlayOver:   document.getElementById("overlayOver"),
    overScore: document.getElementById("overScore"),
    overBest:  document.getElementById("overBest"),
    overTitle: document.getElementById("overTitle"),
    overMsg:   document.getElementById("overMsg"),
    playAgainBtn: document.getElementById("playAgainBtn"),

    leaderboardList: document.getElementById("leaderboardList"),
    resetScoresBtn: document.getElementById("resetScoresBtn"),

    nameModal: document.getElementById("nameModal"),
    nameForm:  document.getElementById("nameForm"),
    nameInput: document.getElementById("nameInput"),
    nameCancelBtn: document.getElementById("nameCancelBtn"),

    touchPause: document.getElementById("touchPause"),
    touchUp:    document.getElementById("touchUp"),
    touchDown:  document.getElementById("touchDown"),
    touchLeft:  document.getElementById("touchLeft"),
    touchRight: document.getElementById("touchRight"),
  };

  const PLAY_ICON  = "\u25B6";
  const PAUSE_ICON = "\u275A\u275A";

  // -------------------- State --------------------
  /** @typedef {"idle"|"ready"|"playing"|"paused"|"over"|"match-over"} GameState */

  const state = {
    /** @type {GameState} */
    status: "idle",
    round: 1,
    pScore: 0,
    cScore: 0,
    tickMs: TICK_BASE_MS,
    lastTick: 0,
    lastFrame: 0,
    shake: 0,
    player: "",
    leaders: /** @type {{name:string, score:number, at:number}[]} */ ([]),
    grid: /** @type {Uint8Array} */ (new Uint8Array(COLS * ROWS)),
    p1: /** @type {{x:number,y:number,dir:{x:number,y:number},alive:boolean,trail:{x:number,y:number}[]}} */ (null),
    p2: null,
    inputDir: /** @type {{x:number,y:number}|null} */ (null),
    lastResult: /** @type {"win"|"lose"|"draw"|null} */ (null),
  };

  // -------------------- Audio --------------------
  /** @type {AudioContext|null} */
  let audio = null;
  function ensureAudio() {
    if (!audio) {
      try { audio = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (_) { audio = null; }
    }
    if (audio && audio.state === "suspended") audio.resume();
  }
  function beep(freq = 660, dur = 0.08, type = "triangle", gain = 0.04) {
    if (!audio) return;
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(audio.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  const sfx = {
    turn()     { beep(880, 0.03, "square", 0.025); },
    crash()    { beep(330, 0.10, "sawtooth", 0.06); setTimeout(() => beep(180, 0.16, "sawtooth", 0.06), 80); setTimeout(() => beep(90, 0.22, "sawtooth", 0.05), 180); },
    winRound() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.09), i * 70)); },
    loseRound(){ [784, 659, 523, 392].forEach((f, i) => setTimeout(() => beep(f, 0.10, "triangle", 0.05), i * 80)); },
    newRound() { beep(900, 0.06); setTimeout(() => beep(1320, 0.08), 60); },
    pause()    { beep(440, 0.05); },
    resume()   { beep(660, 0.05); },
  };

  // -------------------- Storage --------------------
  function loadPlayer() {
    try { return localStorage.getItem(LS_KEYS.name) || ""; }
    catch (_) { return ""; }
  }
  function savePlayer(name) {
    try { localStorage.setItem(LS_KEYS.name, name); } catch (_) {}
  }
  function loadLeadersLocal() {
    try {
      const raw = localStorage.getItem(LS_KEYS.leaderboard);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr
        .filter(e => e && typeof e.score === "number" && typeof e.name === "string")
        .slice(0, MAX_LEADERS);
    } catch (_) { return []; }
  }
  function saveLeadersLocal(list) {
    try { localStorage.setItem(LS_KEYS.leaderboard, JSON.stringify(list.slice(0, MAX_LEADERS))); }
    catch (_) {}
  }
  function setLeaders(list) {
    state.leaders = (list || []).slice(0, MAX_LEADERS);
    saveLeadersLocal(state.leaders);
    renderLeaderboard();
  }

  // -------------------- Grid helpers --------------------
  function gidx(x, y) { return y * COLS + x; }
  function clearGrid() { state.grid.fill(0); }
  function inBounds(x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS; }
  function isBlocked(x, y) {
    if (!inBounds(x, y)) return true;
    return state.grid[gidx(x, y)] !== 0;
  }

  // -------------------- Round lifecycle --------------------
  function resetMatch() {
    state.round = 1;
    state.pScore = 0;
    state.cScore = 0;
    state.tickMs = TICK_BASE_MS;
    state.lastResult = null;
    setupRound();
  }

  function setupRound() {
    clearGrid();
    const py = Math.floor(ROWS / 2);
    const cy = Math.floor(ROWS / 2);
    const px = 5;
    const cx = COLS - 6;
    state.p1 = { x: px, y: py, dir: { ...DIRS.Right }, alive: true, trail: [{ x: px, y: py }] };
    state.p2 = { x: cx, y: cy, dir: { ...DIRS.Left  }, alive: true, trail: [{ x: cx, y: cy }] };
    state.grid[gidx(px, py)] = 1;
    state.grid[gidx(cx, cy)] = 2;
    state.inputDir = null;
    state.status = "ready";
    state.tickMs = Math.max(TICK_MIN_MS, TICK_BASE_MS - (state.round - 1) * TICK_STEP_MS);

    showReadyOverlay();
    updateHud();
    updateTouchPauseIcon();
  }

  function showReadyOverlay() {
    const card = els.overlayStart.querySelector(".overlay__card");
    card.innerHTML = `
      <h2>Round ${state.round} — Ready?</h2>
      <p>Press a direction or <span class="kbd">Space</span> to start.</p>
    `;
    hideAllOverlays();
    showOverlay("start");
  }

  function startRound() {
    if (state.status !== "ready") return;
    state.status = "playing";
    state.lastTick = performance.now();
    hideAllOverlays();
    sfx.newRound();
    updateTouchPauseIcon();
  }

  function pauseGame() {
    if (state.status !== "playing") return;
    state.status = "paused";
    showOverlay("paused");
    sfx.pause();
    updateTouchPauseIcon();
  }
  function resumeGame() {
    if (state.status !== "paused") return;
    state.status = "playing";
    state.lastTick = performance.now();
    hideOverlay("paused");
    sfx.resume();
    updateTouchPauseIcon();
  }
  function togglePause() {
    if (state.status === "ready") startRound();
    else if (state.status === "playing") pauseGame();
    else if (state.status === "paused")  resumeGame();
    else if (state.status === "over")    setupRound();
    else if (state.status === "match-over") { resetMatch(); }
  }

  function endRound() {
    state.status = "over";
    state.shake = 280;
    sfx.crash();
    updateTouchPauseIcon();

    const p1Alive = state.p1.alive;
    const p2Alive = state.p2.alive;
    let title, msg, result;
    if (p1Alive && !p2Alive) {
      state.pScore += 1;
      result = "win";
      title = "You won the round!";
      msg = `Press <span class="kbd">Space</span> or <span class="kbd">R</span> for next round.`;
      setTimeout(() => sfx.winRound(), 320);
    } else if (!p1Alive && p2Alive) {
      state.cScore += 1;
      result = "lose";
      title = "CPU won the round.";
      msg = `Press <span class="kbd">Space</span> or <span class="kbd">R</span> for next round.`;
      setTimeout(() => sfx.loseRound(), 320);
    } else {
      result = "draw";
      title = "Draw — both crashed!";
      msg = `Press <span class="kbd">Space</span> or <span class="kbd">R</span> for next round.`;
    }
    state.lastResult = result;

    const matchDone = state.round >= MAX_ROUNDS;
    if (matchDone) {
      state.status = "match-over";
      const won = state.pScore > state.cScore;
      const tied = state.pScore === state.cScore;
      title = won ? "Match won!" : tied ? "Match tied." : "Match lost.";
      msg = `Final: <strong>${state.pScore}</strong> — <strong>${state.cScore}</strong>. Press <span class="kbd">Space</span> or <span class="kbd">R</span> to play again.`;
      submitToLeaderboard(state.player, state.pScore);
      els.playAgainBtn.textContent = "Play again";
    } else {
      els.playAgainBtn.textContent = "Next round";
    }

    els.overScore.textContent = String(state.pScore);
    els.overBest.textContent  = String(state.cScore);
    els.overTitle.textContent = title;
    els.overMsg.innerHTML = msg;
    showOverlay("over");
    updateHud();
    renderLeaderboard();
  }

  function nextRound() {
    if (state.status === "match-over") {
      resetMatch();
    } else if (state.status === "over") {
      state.round += 1;
      setupRound();
    }
  }

  // -------------------- Input --------------------
  function queueDirection(dirName) {
    const next = DIRS[dirName];
    if (!next || !state.p1) return;
    if (state.status === "ready") {
      const cur = state.p1.dir;
      if (next.x === -cur.x && next.y === -cur.y) return;
      state.p1.dir = next;
      state.inputDir = next;
      startRound();
      sfx.turn();
      return;
    }
    if (state.status !== "playing") return;
    const cur = state.p1.dir;
    if (next.x === -cur.x && next.y === -cur.y) return;
    if (next.x === cur.x && next.y === cur.y) return;
    state.inputDir = next;
    sfx.turn();
  }

  // -------------------- CPU AI --------------------
  function chooseCpuDir() {
    const p = state.p2;
    const ahead = { x: p.x + p.dir.x, y: p.y + p.dir.y };
    const aheadBlocked = isBlocked(ahead.x, ahead.y);

    const perpOptions = DIR_LIST.filter(d =>
      !(d.x === p.dir.x && d.y === p.dir.y) &&
      !(d.x === -p.dir.x && d.y === -p.dir.y)
    );

    if (aheadBlocked) {
      const safe = perpOptions.filter(d => !isBlocked(p.x + d.x, p.y + d.y));
      if (safe.length === 0) return p.dir;
      return safe[Math.floor(Math.random() * safe.length)];
    }

    if (Math.random() < CPU_RANDOM_TURN_CHANCE) {
      const safe = perpOptions.filter(d => !isBlocked(p.x + d.x, p.y + d.y));
      if (safe.length > 0) return safe[Math.floor(Math.random() * safe.length)];
    }
    return p.dir;
  }

  // -------------------- Tick --------------------
  function tick() {
    if (state.inputDir) {
      const cur = state.p1.dir;
      if (!(state.inputDir.x === -cur.x && state.inputDir.y === -cur.y)) {
        state.p1.dir = state.inputDir;
      }
      state.inputDir = null;
    }
    state.p2.dir = chooseCpuDir();

    const p1Next = { x: state.p1.x + state.p1.dir.x, y: state.p1.y + state.p1.dir.y };
    const p2Next = { x: state.p2.x + state.p2.dir.x, y: state.p2.y + state.p2.dir.y };

    const p1Crash = isBlocked(p1Next.x, p1Next.y);
    const p2Crash = isBlocked(p2Next.x, p2Next.y);
    const headOn  = p1Next.x === p2Next.x && p1Next.y === p2Next.y;

    if (p1Crash || headOn) state.p1.alive = false;
    if (p2Crash || headOn) state.p2.alive = false;

    if (state.p1.alive) {
      state.p1.x = p1Next.x; state.p1.y = p1Next.y;
      state.p1.trail.push({ x: p1Next.x, y: p1Next.y });
      state.grid[gidx(p1Next.x, p1Next.y)] = 1;
    }
    if (state.p2.alive) {
      state.p2.x = p2Next.x; state.p2.y = p2Next.y;
      state.p2.trail.push({ x: p2Next.x, y: p2Next.y });
      if (state.grid[gidx(p2Next.x, p2Next.y)] === 0) state.grid[gidx(p2Next.x, p2Next.y)] = 2;
    }

    if (!state.p1.alive || !state.p2.alive) {
      endRound();
    }
  }

  // -------------------- Rendering --------------------
  function cellW() { return canvas.width / COLS; }
  function cellH() { return canvas.height / ROWS; }

  function draw(now) {
    const w = canvas.width;
    const h = canvas.height;
    const cw = cellW();
    const ch = cellH();

    let ox = 0, oy = 0;
    if (state.shake > 0) {
      const mag = Math.min(6, state.shake / 60);
      ox = (Math.random() - 0.5) * mag;
      oy = (Math.random() - 0.5) * mag;
    }

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.translate(ox, oy);

    ctx.fillStyle = COLORS.boardBg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < COLS; i++) {
      const p = i * cw;
      ctx.moveTo(p + 0.5, 0);
      ctx.lineTo(p + 0.5, h);
    }
    for (let i = 1; i < ROWS; i++) {
      const p = i * ch;
      ctx.moveTo(0, p + 0.5);
      ctx.lineTo(w, p + 0.5);
    }
    ctx.stroke();

    drawCycle(state.p1, COLORS.p1Trail, COLORS.p1TrailDim, COLORS.p1Head, COLORS.p1Glow, cw, ch, now);
    drawCycle(state.p2, COLORS.p2Trail, COLORS.p2TrailDim, COLORS.p2Head, COLORS.p2Glow, cw, ch, now);

    ctx.restore();
  }

  function drawCycle(p, trailColor, dimColor, headColor, glowColor, cw, ch, now) {
    if (!p || p.trail.length === 0) return;

    if (p.trail.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < p.trail.length; i++) {
        const t = p.trail[i];
        const px = (t.x + 0.5) * cw;
        const py = (t.y + 0.5) * ch;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.strokeStyle = dimColor;
      ctx.lineWidth = Math.min(cw, ch) * 0.85;
      ctx.stroke();

      ctx.strokeStyle = trailColor;
      ctx.lineWidth = Math.min(cw, ch) * 0.55;
      ctx.stroke();
    }

    const hx = (p.x + 0.5) * cw;
    const hy = (p.y + 0.5) * ch;
    const r = Math.min(cw, ch) * 0.42;

    const grad = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 2.2);
    grad.addColorStop(0, glowColor);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(hx, hy, r * 2.2, 0, Math.PI * 2);
    ctx.fill();

    if (!p.alive) {
      const phase = ((now / 80) | 0) % 2;
      ctx.fillStyle = phase ? "#fff" : headColor;
    } else {
      ctx.fillStyle = headColor;
    }
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, Math.PI * 2);
    ctx.fill();

    if (p.alive) {
      ctx.fillStyle = "#0b0e13";
      ctx.beginPath();
      ctx.arc(hx + p.dir.x * r * 0.35, hy + p.dir.y * r * 0.35, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // -------------------- Loop --------------------
  function loop(now) {
    const dt = now - state.lastFrame;
    state.lastFrame = now;

    if (state.status === "playing") {
      if (now - state.lastTick > 500) state.lastTick = now;
      let safety = 4;
      while (state.status === "playing" && now - state.lastTick >= state.tickMs && safety-- > 0) {
        state.lastTick += state.tickMs;
        tick();
      }
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);

    draw(now);
    requestAnimationFrame(loop);
  }

  // -------------------- HUD --------------------
  function updateHud() {
    els.scoreValue.textContent = String(state.pScore);
    els.cpuValue.textContent   = String(state.cScore);
    els.roundValue.textContent = String(state.round);
    els.playerName.textContent = state.player || "Guest";
  }
  function showOverlay(which) {
    if (which === "start")  els.overlayStart.classList.remove("hidden");
    if (which === "paused") els.overlayPaused.classList.remove("hidden");
    if (which === "over")   els.overlayOver.classList.remove("hidden");
  }
  function hideOverlay(which) {
    if (which === "start")  els.overlayStart.classList.add("hidden");
    if (which === "paused") els.overlayPaused.classList.add("hidden");
    if (which === "over")   els.overlayOver.classList.add("hidden");
  }
  function hideAllOverlays() {
    hideOverlay("start"); hideOverlay("paused"); hideOverlay("over");
  }

  function updateTouchPauseIcon() {
    if (!els.touchPause) return;
    const playing = state.status === "playing";
    els.touchPause.textContent = playing ? PAUSE_ICON : PLAY_ICON;
    els.touchPause.setAttribute("aria-label", playing ? "Pause" : "Play");
  }

  function bindTouchControls() {
    const dirMap = [
      [els.touchUp,    "Up"],
      [els.touchDown,  "Down"],
      [els.touchLeft,  "Left"],
      [els.touchRight, "Right"],
    ];
    for (const [btn, dirName] of dirMap) {
      if (!btn) continue;
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        ensureAudio();
        queueDirection(dirName);
      });
      btn.addEventListener("click", (e) => e.preventDefault());
    }
    if (els.touchPause) {
      els.touchPause.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        ensureAudio();
        togglePause();
        updateTouchPauseIcon();
      });
      els.touchPause.addEventListener("click", (e) => e.preventDefault());
    }
  }

  // -------------------- Leaderboard --------------------
  function submitToLeaderboard(name, score) {
    if (!name || score <= 0) return;
    const merged = state.leaders.concat([{ name, score, at: Date.now() }]);
    merged.sort((a, b) => b.score - a.score || a.at - b.at);
    setLeaders(merged);
  }

  function renderLeaderboard() {
    const list = state.leaders;
    els.leaderboardList.innerHTML = "";
    if (!list.length) {
      const li = document.createElement("li");
      li.className = "leaderboard__empty";
      li.textContent = "No scores yet.";
      els.leaderboardList.appendChild(li);
      return;
    }
    list.forEach((entry, idx) => {
      const li = document.createElement("li");
      if (entry.name === state.player) li.classList.add("you");
      li.innerHTML = `
        <span class="lb-rank">${idx + 1}</span>
        <span class="lb-name">${escapeHtml(entry.name)}</span>
        <span class="lb-score">${entry.score}</span>
      `;
      els.leaderboardList.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // -------------------- Keyboard --------------------
  function onKeyDown(e) {
    if (document.activeElement === els.nameInput) return;
    const k = e.key;
    if (k === "ArrowUp" || k === "w" || k === "W") {
      e.preventDefault(); ensureAudio(); queueDirection("Up");
    } else if (k === "ArrowDown" || k === "s" || k === "S") {
      e.preventDefault(); ensureAudio(); queueDirection("Down");
    } else if (k === "ArrowLeft" || k === "a" || k === "A") {
      e.preventDefault(); ensureAudio(); queueDirection("Left");
    } else if (k === "ArrowRight" || k === "d" || k === "D") {
      e.preventDefault(); ensureAudio(); queueDirection("Right");
    } else if (k === " " || k === "Spacebar") {
      e.preventDefault(); ensureAudio();
      if (state.status === "over") nextRound();
      else if (state.status === "match-over") resetMatch();
      else togglePause();
    } else if (k === "r" || k === "R") {
      e.preventDefault(); ensureAudio();
      resetMatch();
    }
  }

  // -------------------- Name modal --------------------
  let wasPlayingBeforeModal = false;
  function openNameModal(canCancel) {
    els.nameModal.classList.remove("hidden");
    els.nameModal.setAttribute("aria-hidden", "false");
    els.nameInput.value = state.player || "";
    wasPlayingBeforeModal = state.status === "playing";
    if (wasPlayingBeforeModal) pauseGame();
    if (canCancel) els.nameCancelBtn.classList.remove("hidden");
    else els.nameCancelBtn.classList.add("hidden");
    setTimeout(() => { els.nameInput.focus(); els.nameInput.select(); }, 30);
  }
  function closeNameModal() {
    els.nameModal.classList.add("hidden");
    els.nameModal.setAttribute("aria-hidden", "true");
  }

  els.nameForm.addEventListener("submit", e => {
    e.preventDefault();
    const clean = els.nameInput.value.trim().replace(/\s+/g, " ").slice(0, 14);
    if (!clean) return;
    state.player = clean;
    savePlayer(clean);
    updateHud();
    renderLeaderboard();
    closeNameModal();
  });
  els.nameCancelBtn.addEventListener("click", () => {
    if (!state.player) return;
    closeNameModal();
  });
  els.changePlayerBtn.addEventListener("click", e => {
    e.stopPropagation();
    openNameModal(true);
  });
  els.playAgainBtn.addEventListener("click", () => {
    ensureAudio();
    if (state.status === "match-over") resetMatch();
    else nextRound();
  });
  els.resetScoresBtn.addEventListener("click", () => {
    if (confirm("Clear the Top 3 leaderboard?")) setLeaders([]);
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !els.nameModal.classList.contains("hidden") && state.player) {
      closeNameModal();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.status === "playing") pauseGame();
  });

  // -------------------- DPI / resize --------------------
  function fitCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // [fit-board] Desktop: fit the board into the stage's available area so it
    // never overflows and the footer stays visible. Touch keeps CSS sizing.
    if (!document.documentElement.classList.contains("is-touch")) {
      const _wrap = canvas.parentElement;
      const _stage = _wrap.parentElement;
      const _cs = getComputedStyle(_wrap);
      const _gap = parseFloat(getComputedStyle(_stage).rowGap) || 0;
      const _wr = _wrap.getBoundingClientRect();
      let _budget = _stage.clientHeight;
      for (const _sib of _stage.children) {
        if (_sib === _wrap) continue;
        const _r = _sib.getBoundingClientRect();
        if (_r.top >= _wr.bottom - 2) _budget -= _r.height + _gap;
      }
      const _availW = _wrap.clientWidth
        - parseFloat(_cs.paddingLeft) - parseFloat(_cs.paddingRight);
      const _availH = _budget
        - parseFloat(_cs.paddingTop) - parseFloat(_cs.paddingBottom)
        - parseFloat(_cs.borderTopWidth) - parseFloat(_cs.borderBottomWidth);
      if (_availW > 0 && _availH > 0) {
        let _cw = _availW, _ch = _cw * (600 / 800);
        if (_ch > _availH) { _ch = _availH; _cw = _ch * (800 / 600); }
        canvas.style.width = Math.floor(_cw) + "px";
        canvas.style.height = Math.floor(_ch) + "px";
      }
    } else {
      canvas.style.width = "";
      canvas.style.height = "";
    }
    const rect = canvas.getBoundingClientRect();
    const wPx = Math.round(rect.width * dpr);
    const hPx = Math.round(rect.height * dpr);
    const cellPxW = Math.max(8, Math.floor(wPx / COLS));
    const cellPxH = Math.max(8, Math.floor(hPx / ROWS));
    const cell = Math.min(cellPxW, cellPxH);
    const targetW = cell * COLS;
    const targetH = cell * ROWS;
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
  }
  window.addEventListener("resize", fitCanvas);

  // -------------------- Init --------------------
  function init() {
    document.addEventListener("keydown", onKeyDown);
    bindTouchControls();

    state.player = loadPlayer();
    fitCanvas();
    state.leaders = loadLeadersLocal();
    renderLeaderboard();

    resetMatch();

    if (!state.player) openNameModal(false);

    requestAnimationFrame(t => {
      state.lastFrame = t;
      loop(t);
    });
  }

  init();
})();
