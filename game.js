(function () {
  "use strict";

  const GRID = 24;
  const BASE_TICK_MS = 135;
  const MIN_TICK_MS = 72;
  const HIGH_KEY = "neonSnakeHighScore";

  const COLORS = {
    bg: "#050508",
    grid: "rgba(0, 245, 255, 0.04)",
    snakeHead: "#00f5ff",
    snakeBody: "#00c8e8",
    snakeGlow: "rgba(0, 245, 255, 0.45)",
    food: "#ff00ea",
    foodGlow: "rgba(255, 0, 234, 0.55)",
  };

  /** @type {HTMLCanvasElement} */
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const btnResume = document.getElementById("btnResume");
  const scoreEl = document.getElementById("score");
  const highScoreEl = document.getElementById("highScore");

  let cellSize = 1;
  let logicalSize = 720;

  let snake = [];
  let prevSnake = [];
  let direction = { x: 1, y: 0 };
  let pendingDir = null;
  let food = { x: 0, y: 0 };
  let score = 0;
  let highScore = Number(localStorage.getItem(HIGH_KEY)) || 0;

  let lastTick = 0;
  let tickMs = BASE_TICK_MS;
  let state = "title"; // title | playing | paused | gameover

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
    } while (guard < 500 && snake.some((s) => s.x === p.x && s.y === p.y));
    food = p;
  }

  function resetGame() {
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
    score = 0;
    tickMs = BASE_TICK_MS;
    lastTick = performance.now();
    placeFood();
    scoreEl.textContent = String(score);
  }

  function isOpposite(a, b) {
    return a.x === -b.x && a.y === -b.y;
  }

  function applyPendingDirection() {
    if (!pendingDir) return;
    if (!isOpposite(pendingDir, direction)) direction = pendingDir;
    pendingDir = null;
  }

  function tick(now) {
    applyPendingDirection();

    prevSnake = snake.map((s) => ({ ...s }));

    const head = snake[0];
    const newHead = { x: head.x + direction.x, y: head.y + direction.y };

    if (
      newHead.x < 0 ||
      newHead.x >= GRID ||
      newHead.y < 0 ||
      newHead.y >= GRID
    ) {
      gameOver();
      return;
    }

    const eating = newHead.x === food.x && newHead.y === food.y;

    for (let i = 0; i < snake.length; i++) {
      if (newHead.x === snake[i].x && newHead.y === snake[i].y) {
        if (!eating && i === snake.length - 1) continue;
        gameOver();
        return;
      }
    }
    let newSnake;
    if (eating) {
      newSnake = [newHead, ...snake];
      prevSnake.push({ ...snake[snake.length - 1] });
      score += 10;
      scoreEl.textContent = String(score);
      if (score > highScore) {
        highScore = score;
        highScoreEl.textContent = String(highScore);
        localStorage.setItem(HIGH_KEY, String(highScore));
      }
      tickMs = Math.max(MIN_TICK_MS, BASE_TICK_MS - Math.floor(score / 50) * 4);
      placeFood();
    } else {
      newSnake = [newHead, ...snake.slice(0, -1)];
    }
    snake = newSnake;
    lastTick = now;
  }

  function gameOver() {
    state = "gameover";
    overlayTitle.textContent = "Игра окончена";
    overlay.classList.remove("hidden");
    btnResume.textContent = "Играть снова";
  }

  function setOverlayTitlePaused() {
    overlayTitle.textContent = "Пауза";
    btnResume.textContent = "Продолжить";
  }

  function startFromTitle() {
    const savedDir = pendingDir;
    const initialDir = { x: 1, y: 0 };
    resetGame();
    if (savedDir && !isOpposite(savedDir, initialDir)) {
      direction = savedDir;
    }
    pendingDir = null;
    prevSnake = snake.map((s) => ({ ...s }));
    state = "playing";
    overlay.classList.add("hidden");
    lastTick = performance.now();
  }

  function togglePause() {
    if (state === "title") {
      startFromTitle();
      return;
    }
    if (state === "gameover") return;
    if (state === "playing") {
      state = "paused";
      setOverlayTitlePaused();
      overlay.classList.remove("hidden");
      return;
    }
    if (state === "paused") {
      state = "playing";
      overlay.classList.add("hidden");
      lastTick = performance.now();
    }
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function drawBackground() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, logicalSize, logicalSize);

    ctx.strokeStyle = COLORS.grid;
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

  function drawFood() {
    const pad = cellSize * 0.18;
    const x = food.x * cellSize + pad;
    const y = food.y * cellSize + pad;
    const s = cellSize - pad * 2;

    const g = ctx.createRadialGradient(
      x + s * 0.35,
      y + s * 0.35,
      0,
      x + s * 0.5,
      y + s * 0.5,
      s * 0.8
    );
    g.addColorStop(0, "#ff6bff");
    g.addColorStop(1, COLORS.food);

    ctx.save();
    ctx.shadowColor = COLORS.foodGlow;
    ctx.shadowBlur = 18;
    ctx.fillStyle = g;
    fillRoundRect(x, y, s, s, s * 0.35);
    ctx.restore();
  }

  function drawSnake(alpha) {
    const n = snake.length;
    for (let i = n - 1; i >= 0; i--) {
      const a = prevSnake[i] || snake[i];
      const b = snake[i];
      const px = lerp(a.x, b.x, alpha);
      const py = lerp(a.y, b.y, alpha);
      const pad = cellSize * (i === 0 ? 0.1 : 0.14);
      const x = px * cellSize + pad;
      const y = py * cellSize + pad;
      const w = cellSize - pad * 2;

      const headColor = COLORS.snakeHead;
      const bodyColor = i === 0 ? headColor : COLORS.snakeBody;

      ctx.save();
      ctx.shadowColor = COLORS.snakeGlow;
      ctx.shadowBlur = i === 0 ? 20 : 12;
      const g = ctx.createLinearGradient(x, y, x + w, y + w);
      if (i === 0) {
        g.addColorStop(0, "#b8ffff");
        g.addColorStop(1, headColor);
      } else {
        g.addColorStop(0, bodyColor);
        g.addColorStop(1, "#006a7a");
      }
      ctx.fillStyle = g;
      const rad = i === 0 ? w * 0.35 : w * 0.3;
      fillRoundRect(x, y, w, w, rad);
      ctx.restore();
    }
  }

  let lastFrame = 0;
  const MAX_CATCHUP_STEPS = 5;

  function frame(now) {
    if (!lastFrame) lastFrame = now;
    lastFrame = now;

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
    } else if (state === "paused" || state === "title" || state === "gameover") {
      alpha = 1;
    }

    drawBackground();
    drawFood();
    drawSnake(state === "playing" ? alpha : 1);

    requestAnimationFrame(frame);
  }

  function onKeyDown(e) {
    const key = e.key.toLowerCase();

    if (key === " " || key === "spacebar") {
      e.preventDefault();
      togglePause();
      return;
    }
    if (key === "r") {
      e.preventDefault();
      resetGame();
      state = "playing";
      overlay.classList.add("hidden");
      lastTick = performance.now();
      return;
    }

    let next = null;
    if (e.key === "ArrowUp" || key === "w") next = { x: 0, y: -1 };
    else if (e.key === "ArrowDown" || key === "s") next = { x: 0, y: 1 };
    else if (e.key === "ArrowLeft" || key === "a") next = { x: -1, y: 0 };
    else if (e.key === "ArrowRight" || key === "d") next = { x: 1, y: 0 };

    if (!next) return;
    e.preventDefault();

    if (state === "title") {
      pendingDir = next;
      startFromTitle();
      return;
    }
    if (state !== "playing") return;
    const effectiveDir = pendingDir !== null ? pendingDir : direction;
    if (isOpposite(next, effectiveDir)) return;
    pendingDir = next;
  }

  btnResume.addEventListener("click", () => {
    if (state === "gameover") {
      resetGame();
      state = "playing";
      overlay.classList.add("hidden");
      lastTick = performance.now();
      return;
    }
    togglePause();
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
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
      let next = null;
      if (Math.abs(dx) > Math.abs(dy)) {
        next = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
      } else {
        next = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
      }
      if (state === "title") {
        pendingDir = next;
        startFromTitle();
        return;
      }
      if (state !== "playing") return;
      const effectiveDir = pendingDir !== null ? pendingDir : direction;
      if (isOpposite(next, effectiveDir)) return;
      pendingDir = next;
    },
    { passive: true }
  );

  window.addEventListener("resize", resize);
  window.addEventListener("keydown", onKeyDown);

  highScoreEl.textContent = String(highScore);
  overlayTitle.textContent = "Neon Snake";
  btnResume.textContent = "Играть";

  resetGame();
  resize();

  requestAnimationFrame(frame);
})();
