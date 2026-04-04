(function () {
  "use strict";

  const GRID = 24;
  const START_TICK_MS = 340;
  const MIN_TICK_MS = 48;
  const FAST_TICK_FACTOR = 0.55;
  const FAST_MIN_TICK_MS = 30;
  const SCORE_CURVE_K = 200;
  const HIGH_KEY = "neonSnakeHighScore";

  const FOOD = {
    NORMAL: "normal",
    DOUBLE: "double",
    CHRONO: "chrono",
    SHIELD: "shield",
    GROWTH: "growth",
  };

  const BONUS_SCORE_STEP = 50;
  const BONUS_TYPES = [
    FOOD.DOUBLE,
    FOOD.CHRONO,
    FOOD.SHIELD,
    FOOD.GROWTH,
  ];

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlaySub = document.getElementById("overlaySub");
  const titleBlock = document.getElementById("titleBlock");
  const pauseBlock = document.getElementById("pauseBlock");
  const gameoverBlock = document.getElementById("gameoverBlock");
  const btnStart = document.getElementById("btnStart");
  const btnResume = document.getElementById("btnResume");
  const btnAgain = document.getElementById("btnAgain");
  const scoreEl = document.getElementById("score");
  const highScoreEl = document.getElementById("highScore");
  let cellSize = 1;
  let logicalSize = 720;

  let snake = [];
  let prevSnake = [];
  let direction = { x: 1, y: 0 };
  let pendingDir = null;
  /** @type {{ x: number, y: number, type: string }} */
  let food = { x: 0, y: 0, type: FOOD.NORMAL };
  let score = 0;
  let highScore = 0;
  try {
    highScore = Number(localStorage.getItem(HIGH_KEY)) || 0;
  } catch (_) {
    highScore = 0;
  }

  let hardcore = false;
  let lastTick = 0;
  let state = "title";

  let slowKeyHeld = false;
  let fastKeyHeld = false;
  let scoreMultiplierUntil = 0;
  let chronoUntil = 0;
  let shieldUntil = 0;
  let portalPulseUntil = 0;

  let trailSnapshots = [];
  const TRAIL_MAX = 7;
  const TRAIL_INTERVAL = 2;
  let trailFrame = 0;

  let theme = { tier: 0 };
  let bonusSpawnQueue = 0;

  function pickRandomBonusType() {
    return BONUS_TYPES[Math.floor(Math.random() * BONUS_TYPES.length)];
  }

  function baseTickFromScore(s) {
    const k = 1 - Math.exp(-s / SCORE_CURVE_K);
    return START_TICK_MS + (MIN_TICK_MS - START_TICK_MS) * k;
  }

  function effectiveTickMs(now) {
    let t = baseTickFromScore(score);
    if (slowKeyHeld) {
      t = START_TICK_MS;
    } else if (fastKeyHeld) {
      t *= FAST_TICK_FACTOR;
    }
    if (now < chronoUntil) t *= 1.5;
    const floor = fastKeyHeld && !slowKeyHeld ? FAST_MIN_TICK_MS : MIN_TICK_MS * 0.85;
    return Math.max(floor, t);
  }

  function updateThemeClass() {
    let tier = 0;
    if (score >= 260) tier = 2;
    else if (score >= 90) tier = 1;
    theme.tier = tier;
    document.body.classList.remove("theme-purple", "theme-pink");
    if (tier === 1) document.body.classList.add("theme-purple");
    if (tier === 2) document.body.classList.add("theme-pink");
  }

  function themeColors() {
    if (theme.tier >= 2) {
      return {
        bg: "#0a060c",
        grid: "rgba(244, 114, 182, 0.07)",
        bodyA: "#e879f9",
        bodyB: "#86198f",
        bodyGlow: "rgba(236, 72, 153, 0.5)",
        accent: "#fbcfe8",
      };
    }
    if (theme.tier >= 1) {
      return {
        bg: "#080612",
        grid: "rgba(167, 139, 250, 0.08)",
        bodyA: "#a78bfa",
        bodyB: "#5b21b6",
        bodyGlow: "rgba(139, 92, 246, 0.5)",
        accent: "#ddd6fe",
      };
    }
    return {
      bg: "#050508",
      grid: "rgba(0, 245, 255, 0.045)",
      bodyA: "#22d3ee",
      bodyB: "#0e7490",
      bodyGlow: "rgba(0, 245, 255, 0.45)",
      accent: "#a5f3fc",
    };
  }

  function resize() {
    const wrap = canvas.parentElement;
    const w = Math.min(wrap.clientWidth, 720);
    logicalSize = Math.floor(w);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = logicalSize * dpr;
    canvas.height = logicalSize * dpr;
    canvas.style.width = logicalSize + "px";
    canvas.style.height = logicalSize + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cellSize = logicalSize / GRID;
  }

  function randCell() {
    return {
      x: Math.floor(Math.random() * GRID),
      y: Math.floor(Math.random() * GRID),
    };
  }

  function placeFood() {
    let p;
    let guard = 0;
    do {
      p = randCell();
      guard++;
    } while (guard < 600 && snake.some((s) => s.x === p.x && s.y === p.y));
    let type = FOOD.NORMAL;
    if (bonusSpawnQueue > 0) {
      type = pickRandomBonusType();
      bonusSpawnQueue--;
    }
    food = { x: p.x, y: p.y, type: type };
  }

  function readDifficulty() {
    const el = document.querySelector('input[name="difficulty"]:checked');
    hardcore = el && el.value === "hardcore";
  }

  function resetGame() {
    readDifficulty();
    const cx = Math.floor(GRID / 2);
    const cy = Math.floor(GRID / 2);
    snake = [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
    ];
    prevSnake = snake.map((s) => ({ ...s }));
    direction = { x: 1, y: 0 };
    pendingDir = null;
    slowKeyHeld = false;
    fastKeyHeld = false;
    bonusSpawnQueue = 0;
    score = 0;
    scoreMultiplierUntil = 0;
    chronoUntil = 0;
    shieldUntil = 0;
    portalPulseUntil = 0;
    trailSnapshots = [];
    trailFrame = 0;
    lastTick = performance.now();
    placeFood();
    scoreEl.textContent = String(score);
    updateThemeClass();
  }

  function isOpposite(a, b) {
    return a.x === -b.x && a.y === -b.y;
  }

  function applyPendingDirection() {
    if (!pendingDir) return;
    if (!isOpposite(pendingDir, direction)) direction = pendingDir;
    pendingDir = null;
  }

  function wrapCoord(v) {
    return ((v % GRID) + GRID) % GRID;
  }

  function shortestDelta1D(a, b) {
    let d = b - a;
    if (d > GRID >> 1) d -= GRID;
    if (d < -(GRID >> 1)) d += GRID;
    return d;
  }

  function lerpToroidal(a, b, t) {
    return a.x + shortestDelta1D(a.x, b.x) * t;
  }

  function lerpToroidalY(a, b, t) {
    return a.y + shortestDelta1D(a.y, b.y) * t;
  }

  function tick(scheduledAt) {
    const wall = performance.now();
    applyPendingDirection();

    prevSnake = snake.map((s) => ({ ...s }));

    const head = snake[0];
    const rawNx = head.x + direction.x;
    const rawNy = head.y + direction.y;
    let nx = rawNx;
    let ny = rawNy;

    if (hardcore) {
      if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) {
        gameOver();
        return;
      }
    } else {
      if (rawNx < 0 || rawNx >= GRID || rawNy < 0 || rawNy >= GRID) {
        portalPulseUntil = wall + 420;
      }
      nx = wrapCoord(rawNx);
      ny = wrapCoord(rawNy);
    }

    const newHead = { x: nx, y: ny };
    const eating = newHead.x === food.x && newHead.y === food.y;

    const shielded = wall < shieldUntil;

    if (!shielded) {
      for (let i = 0; i < snake.length; i++) {
        if (newHead.x === snake[i].x && newHead.y === snake[i].y) {
          if (!eating && i === snake.length - 1) continue;
          gameOver();
          return;
        }
      }
    }

    let newSnake;

    if (eating) {
      const ft = food.type;
      newSnake = [newHead, ...snake];

      if (ft === FOOD.GROWTH) {
        const tail = newSnake[newSnake.length - 1];
        newSnake.push({ ...tail }, { ...tail });
      }

      const hadMult = wall < scoreMultiplierUntil;
      if (ft === FOOD.DOUBLE) scoreMultiplierUntil = wall + 12000;

      let base = 10;
      if (ft === FOOD.CHRONO) {
        base = 12;
        chronoUntil = wall + 9000;
      } else if (ft === FOOD.SHIELD) {
        base = 14;
        shieldUntil = wall + 8000;
      } else if (ft === FOOD.GROWTH) base = 16;
      else if (ft === FOOD.DOUBLE) base = 10;

      const mult = hadMult || ft === FOOD.DOUBLE ? 2 : 1;
      const add = base * mult;
      const prevScore = score;
      const prevTier = Math.floor(prevScore / BONUS_SCORE_STEP);
      score += add;
      const newTier = Math.floor(score / BONUS_SCORE_STEP);
      if (newTier > prevTier) {
        bonusSpawnQueue += newTier - prevTier;
      }
      scoreEl.textContent = String(score);
      try {
        if (score > highScore) {
          highScore = score;
          highScoreEl.textContent = String(highScore);
          localStorage.setItem(HIGH_KEY, String(highScore));
        }
      } catch (_) {}

      updateThemeClass();

      while (prevSnake.length < newSnake.length) {
        prevSnake.push({ ...snake[snake.length - 1] });
      }

      placeFood();
    } else {
      newSnake = [newHead, ...snake.slice(0, -1)];
    }

    snake = newSnake;
    lastTick = scheduledAt;
  }

  function gameOver() {
    state = "gameover";
    overlayTitle.textContent = "Game Over";
    overlaySub.textContent = "Счёт: " + score;
    overlaySub.classList.remove("hidden");
    titleBlock.classList.add("hidden");
    pauseBlock.classList.add("hidden");
    gameoverBlock.classList.remove("hidden");
    overlay.classList.remove("hidden");
  }

  function showTitle() {
    state = "title";
    overlayTitle.textContent = "Neon Snake";
    overlaySub.classList.add("hidden");
    titleBlock.classList.remove("hidden");
    pauseBlock.classList.add("hidden");
    gameoverBlock.classList.add("hidden");
    overlay.classList.remove("hidden");
  }

  /** Сброс поля и переход к выбору сложности (после проигрыша, по R и т.д.) */
  function openDifficultyScreen() {
    resetGame();
    showTitle();
  }

  function showPause() {
    state = "paused";
    overlayTitle.textContent = "Пауза";
    overlaySub.classList.add("hidden");
    titleBlock.classList.add("hidden");
    pauseBlock.classList.remove("hidden");
    gameoverBlock.classList.add("hidden");
    overlay.classList.remove("hidden");
  }

  function hideOverlayPanels() {
    titleBlock.classList.add("hidden");
    pauseBlock.classList.add("hidden");
    gameoverBlock.classList.add("hidden");
    overlaySub.classList.add("hidden");
    overlay.classList.add("hidden");
  }

  function beginPlay() {
    readDifficulty();
    const savedDir = pendingDir;
    const initialDir = { x: 1, y: 0 };
    hideOverlayPanels();
    resetGame();
    if (savedDir && !isOpposite(savedDir, initialDir)) {
      direction = savedDir;
    }
    pendingDir = null;
    prevSnake = snake.map((s) => ({ ...s }));
    state = "playing";
    lastTick = performance.now();
  }

  function resumePlay() {
    state = "playing";
    hideOverlayPanels();
    lastTick = performance.now();
  }

  function togglePause() {
    if (state === "title") return;
    if (state === "gameover") return;
    if (state === "playing") showPause();
    else if (state === "paused") resumePlay();
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function drawPortalRim(now) {
    if (now > portalPulseUntil) return;
    const u = (portalPulseUntil - now) / 420;
    const a = u * 0.55;
    const tc = themeColors();
    ctx.save();
    ctx.strokeStyle = tc.accent;
    ctx.lineWidth = 3;
    ctx.shadowColor = tc.bodyGlow;
    ctx.shadowBlur = 22 * u;
    ctx.globalAlpha = a;
    ctx.strokeRect(1.5, 1.5, logicalSize - 3, logicalSize - 3);
    ctx.restore();
  }

  function drawBackground() {
    const tc = themeColors();
    ctx.fillStyle = tc.bg;
    ctx.fillRect(0, 0, logicalSize, logicalSize);

    ctx.strokeStyle = tc.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID; i++) {
      const p = i * cellSize;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, logicalSize);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(logicalSize, p);
      ctx.stroke();
    }
  }

  function fillRoundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
    ctx.fill();
  }

  function foodStyle(type) {
    if (type !== FOOD.NORMAL) {
      return {
        core: "#e2e2f0",
        hi: "#ffffff",
        glow: "rgba(255, 255, 255, 0.95)",
      };
    }
    return {
      core: "#ec4899",
      hi: "#f9a8d4",
      glow: "rgba(236, 72, 153, 0.55)",
    };
  }

  function drawFood() {
    const pad = cellSize * 0.17;
    const x = food.x * cellSize + pad;
    const y = food.y * cellSize + pad;
    const s = cellSize - pad * 2;
    const st = foodStyle(food.type);
    const isBonus = food.type !== FOOD.NORMAL;

    const g = ctx.createRadialGradient(
      x + s * 0.35,
      y + s * 0.35,
      0,
      x + s * 0.5,
      y + s * 0.5,
      s * 0.85
    );
    g.addColorStop(0, st.hi);
    g.addColorStop(1, st.core);

    ctx.save();
    ctx.shadowColor = st.glow;
    ctx.shadowBlur = isBonus ? 24 : 20;
    ctx.fillStyle = g;
    fillRoundRect(x, y, s, s, s * 0.38);
    ctx.restore();
  }

  function drawTrail(alphaPlaying) {
    const tc = themeColors();
    for (let t = trailSnapshots.length - 1; t >= 0; t--) {
      const snap = trailSnapshots[t];
      const fade = (t + 1) / (trailSnapshots.length + 2);
      const baseA = 0.08 * fade * (state === "playing" ? alphaPlaying * 0.5 + 0.5 : 1);
      for (let i = snap.length - 1; i >= 0; i--) {
        if (i === 0) continue;
        const seg = snap[i];
        const pad = cellSize * 0.16;
        const sx = seg.x * cellSize + pad;
        const sy = seg.y * cellSize + pad;
        const w = cellSize - pad * 2;
        ctx.save();
        ctx.globalAlpha = baseA;
        ctx.fillStyle = tc.bodyA;
        ctx.shadowColor = tc.bodyGlow;
        ctx.shadowBlur = 10;
        fillRoundRect(sx, sy, w, w, w * 0.32);
        ctx.restore();
      }
    }
  }

  function drawShieldRing(headCx, headCy, headR) {
    const now = performance.now();
    if (now >= shieldUntil) return;
    const tc = themeColors();
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = Math.max(2, cellSize * 0.12);
    ctx.shadowColor = "rgba(250, 204, 21, 0.9)";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(headCx, headCy, headR + cellSize * 0.08, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawSnake(alpha) {
    const n = snake.length;
    const tc = themeColors();
    const headGreen = "#39ff14";
    const headGreenHi = "#86efac";
    const headGlow = "rgba(57, 255, 20, 0.55)";

    for (let i = n - 1; i >= 0; i--) {
      const a = prevSnake[i] || snake[i];
      const b = snake[i];
      const gx = lerpToroidal(a, b, alpha);
      const gy = lerpToroidalY(a, b, alpha);
      let px = gx;
      let py = gy;
      while (px >= GRID) px -= GRID;
      while (px < 0) px += GRID;
      while (py >= GRID) py -= GRID;
      while (py < 0) py += GRID;

      const pad = cellSize * (i === 0 ? 0.09 : 0.13);
      const x = px * cellSize + pad;
      const y = py * cellSize + pad;
      const w = cellSize - pad * 2;

      ctx.save();
      if (i === 0) {
        ctx.shadowColor = headGlow;
        ctx.shadowBlur = 22;
        const g = ctx.createLinearGradient(x, y, x + w, y + w);
        g.addColorStop(0, headGreenHi);
        g.addColorStop(0.55, headGreen);
        g.addColorStop(1, "#16a34a");
        ctx.fillStyle = g;
        const rad = w * 0.42;
        fillRoundRect(x, y, w, w, rad);
        const cx = x + w * 0.5;
        const cy = y + w * 0.5;
        drawShieldRing(cx, cy, w * 0.36);
      } else {
        ctx.shadowColor = tc.bodyGlow;
        ctx.shadowBlur = 14;
        const g = ctx.createLinearGradient(x, y, x + w, y + w);
        g.addColorStop(0, tc.bodyA);
        g.addColorStop(1, tc.bodyB);
        ctx.fillStyle = g;
        const rad = w * 0.34;
        fillRoundRect(x, y, w, w, rad);
      }
      ctx.restore();
    }
  }

  const MAX_CATCHUP_STEPS = 5;
  let lastFrame = 0;

  function frame(now) {
    if (!lastFrame) lastFrame = now;
    lastFrame = now;

    const tickMs = effectiveTickMs(now);
    let alpha = 1;

    if (state === "playing") {
      const elapsed = now - lastTick;
      alpha = Math.min(1, Math.max(0, elapsed / tickMs));
      let steps = 0;
      while (
        state === "playing" &&
        now - lastTick >= tickMs &&
        steps < MAX_CATCHUP_STEPS
      ) {
        tick(lastTick + tickMs);
        steps++;
        if (state !== "playing") break;
      }

      trailFrame++;
      if (trailFrame % TRAIL_INTERVAL === 0) {
        trailSnapshots.push(snake.map((s) => ({ x: s.x, y: s.y })));
        if (trailSnapshots.length > TRAIL_MAX) trailSnapshots.shift();
      }
    } else {
      alpha = 1;
    }

    drawBackground();
    drawPortalRim(now);
    drawTrail(alpha);
    drawFood();
    drawSnake(state === "playing" ? alpha : 1);

    requestAnimationFrame(frame);
  }

  function setDirection(next) {
    if (state === "title") {
      pendingDir = next;
      beginPlay();
      return;
    }
    if (state !== "playing") return;
    const effectiveDir = pendingDir !== null ? pendingDir : direction;
    if (isOpposite(next, effectiveDir)) return;
    pendingDir = next;
  }

  function onKeyDown(e) {
    const key = e.key.toLowerCase();

    if (e.code === "KeyS") {
      slowKeyHeld = true;
    }
    if (e.code === "KeyF") {
      if (state === "playing" || state === "paused") {
        e.preventDefault();
      }
      fastKeyHeld = true;
    }

    if (key === " " || key === "spacebar") {
      e.preventDefault();
      if (state === "title") {
        btnStart.click();
        return;
      }
      togglePause();
      return;
    }

    if (key === "r") {
      e.preventDefault();
      openDifficultyScreen();
      return;
    }

    let next = null;
    if (e.key === "ArrowUp" || key === "w") next = { x: 0, y: -1 };
    else if (e.key === "ArrowDown") next = { x: 0, y: 1 };
    else if (e.key === "ArrowLeft" || key === "a") next = { x: -1, y: 0 };
    else if (e.key === "ArrowRight" || key === "d") next = { x: 1, y: 0 };

    if (!next) return;
    e.preventDefault();
    setDirection(next);
  }

  function onKeyUp(e) {
    if (e.code === "KeyS") slowKeyHeld = false;
    if (e.code === "KeyF") fastKeyHeld = false;
  }

  btnStart.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (state !== "title") return;
    if (titleBlock.classList.contains("hidden")) return;
    beginPlay();
  });

  btnResume.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (state === "paused") resumePlay();
  });

  btnAgain.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (state !== "gameover") return;
    openDifficultyScreen();
  });

  let touchStart = null;
  canvas.addEventListener(
    "touchstart",
    (e) => {
      const t = e.changedTouches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    },
    { passive: true }
  );
  canvas.addEventListener(
    "touchend",
    (e) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) < 28 && Math.abs(dy) < 28) return;
      let next = null;
      if (Math.abs(dx) > Math.abs(dy)) {
        next = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
      } else {
        next = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
      }
      setDirection(next);
    },
    { passive: true }
  );

  window.addEventListener("resize", resize);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  highScoreEl.textContent = String(highScore);
  showTitle();
  resetGame();
  resize();

  requestAnimationFrame(frame);
})();
