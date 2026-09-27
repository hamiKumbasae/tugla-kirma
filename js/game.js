// Game engine, input and menus. Level data lives in js/levels/*.js, brick
// layouts in js/patterns.js, sound in js/audio.js.

// ---- Canvas (logical 800×600, sharp on high-DPI screens) ----
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = 800, H = 600;
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr;
canvas.height = H * dpr;
ctx.scale(dpr, dpr);

// ---- Constants ----
const PADDLE_H = 14;
const BALL_R = 8;
const BRICK_COLS = 10;
const BRICK_W = 72, BRICK_H = 24, BRICK_GAP = 6;
const DIGIT_BRICK_W = 26; // narrower bricks so a 4-digit year's 23 columns fit on screen
const BRICK_TOP = 60;
const ROW_COLORS = ["#ff5e5e", "#ff9f4a", "#ffd84a", "#7ee06f", "#5ea8ff"];
const ROW_POINTS = [50, 40, 30, 20, 10];
const SHARD_GRAVITY = 0.35;
const MAX_BALLS = 6;
const POWERUP_DROP_CHANCE = 0.18;
const POWERUP_TYPES = [
  { type: "wide",  color: "#5ea8ff", label: "W", weight: 35 },
  { type: "multi", color: "#ff5ea0", label: "M", weight: 25 },
  { type: "slow",  color: "#7ee06f", label: "S", weight: 25 },
  { type: "bonus", color: "#ffd84a", label: "+", weight: 15 },
];
const STEP_MS = 1000 / 60; // physics runs at a fixed 60 Hz regardless of screen refresh rate

// Map levels (classic.js) draw bricks with one character per cell:
// "#" normal · "3" stone, breaks on the 3rd hit · "I" iron, never breaks ·
// "T" TNT, destroys its 8 neighbours · "K" key · "L" lock, unbreakable until every key is gone
const MAP_BRICKS = {
  "#": { kind: "normal" },
  "3": { kind: "stone", hp: 3, points: 60 },
  "I": { kind: "iron", points: 0 },
  "T": { kind: "tnt", points: 30 },
  "K": { kind: "key", points: 100 },
  "L": { kind: "lock" },
};
const STONE_COLORS = ["#8a8176", "#a39a8e", "#bdb4a7"]; // index = hits left - 1
const SLIDE_SPEED = 0.02;        // radians per step for sliding rows (~5 s per sweep)
const STALL_STEPS = 60 * 8;      // no progress this long → nudge the ball out of a loop
const MIN_VERTICAL = 0.3;        // |vy| never drops below this share of the ball's speed

// ---- Modes: flatten chapters into one ordered level list per mode ----
function buildMode(id, title, chapters, toLevel) {
  const levels = [];
  chapters.forEach((chapter) => {
    chapter.levels.forEach((def) => levels.push(toLevel(def, chapter, levels.length)));
  });
  return { id, title, chapters, levels };
}

const MODES = {
  classic: buildMode("classic", "Klasik", CLASSIC_CHAPTERS, (def, chapter, i) => ({
    ...def,
    id: def.name,
    chapter: chapter.title,
    rows: def.map ? def.map.length : def.rows || SHAPE_ROWS[def.pattern].length,
    label: (i + 1) + ". " + def.name,
  })),
  history: buildMode("history", "Tarih", HISTORY_CHAPTERS, (def, chapter) => ({
    ...def,
    id: def.digits,
    chapter: chapter.title,
    pattern: "digits",
    rows: DIGIT_H,
    rowColors: chapter.rowColors,
    label: def.year + " · " + def.name,
  })),
};

// Difficulty rises smoothly through each mode: faster ball, narrower paddle.
function difficultyFor(index, total) {
  const t = total > 1 ? index / (total - 1) : 0;
  return {
    ballSpeed: 7.0 + 2.5 * t, // px per 60 Hz step: ~420 → ~570 px/s
    paddleW: Math.round(110 - 22 * t),
  };
}

// ---- Progress (completed levels per mode, kept in this browser only) ----
const PROGRESS_KEY = "tugla-kirma:progress";
let progress = { classic: [], history: [] };
try {
  const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY));
  if (saved) progress = { ...progress, ...saved };
} catch (e) { /* storage unavailable — progress lasts for this session only */ }

function markCompleted(mode, level) {
  if (progress[mode.id].includes(level.id)) return;
  progress[mode.id].push(level.id);
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (e) {}
}
function isCompleted(mode, level) { return progress[mode.id].includes(level.id); }

// ---- Game state ----
let mode = MODES.classic;
let levelIndex = 0;
let difficulty = difficultyFor(0, 1);
let paddle, balls, bricks, particles, powerups, shards, flashes;
let brickGrid = new Map(); // "row:col" → brick, for TNT neighbours
let slideRows = [], slideStep = 0;
let score = 0;
let state = "menu"; // menu | playing | paused
let shakeMagnitude = 0;
let slowUntil = 0, currentSpeedMul = 1;

function currentLevel() { return mode.levels[levelIndex]; }

function resetPaddleAndBall() {
  const w = difficulty.paddleW;
  paddle = { x: W / 2 - w / 2, y: H - 40, w, h: PADDLE_H, speed: 10, wideUntil: 0 };
  balls = [{ x: W / 2, y: paddle.y - BALL_R - 1, vx: 0, vy: 0, r: BALL_R, stuck: true, stall: 0 }];
  particles = [];
  powerups = [];
  shards = [];
  flashes = [];
  slowUntil = 0;
  currentSpeedMul = 1;
}

// Which map character (or "#") sits at row r, column c of the current level.
function cellAt(def, r, c, cols) {
  if (def.map) return def.map[r][c] === "." ? null : def.map[r][c];
  if (def.pattern === "digits") return digitsPatternActive(def.digits, r, c) ? "#" : null;
  return patternActive(def.pattern, r, c, def.rows, cols) ? "#" : null;
}

// Short crack polylines inside a brick, fixed per brick so they don't flicker.
function makeCracks(r, c, w, h) {
  let seed = (r * 73856093) ^ (c * 19349663);
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const cracks = [];
  for (let i = 0; i < 3; i++) {
    let x = w * (0.2 + 0.6 * rand()), y = rand() < 0.5 ? 0 : h;
    const path = [[x, y]];
    for (let s = 0; s < 3; s++) {
      x = Math.max(2, Math.min(w - 2, x + (rand() - 0.5) * w * 0.35));
      y = y === 0 || y < h / 2 ? y + h / 3 : y - h / 3;
      path.push([x, y]);
    }
    cracks.push(path);
  }
  return cracks;
}

function buildBricks() {
  bricks = [];
  brickGrid = new Map();
  slideRows = [];
  slideStep = 0;
  const def = currentLevel();
  const isDigits = def.pattern === "digits";
  const cols = def.map ? def.map[0].length : isDigits ? digitsCols(def.digits) : BRICK_COLS;
  const brickW = isDigits ? DIGIT_BRICK_W : BRICK_W;
  const left = (W - (cols * (brickW + BRICK_GAP) - BRICK_GAP)) / 2;
  const rowColors = def.rowColors || ROW_COLORS;
  for (let r = 0; r < def.rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = cellAt(def, r, c, cols);
      if (!ch) continue;
      const type = MAP_BRICKS[ch];
      const x = left + c * (brickW + BRICK_GAP);
      const brick = {
        x, baseX: x,
        y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
        w: brickW, h: BRICK_H,
        r, c,
        kind: type.kind,
        hp: type.hp || 1,
        color: rowColors[r % rowColors.length],
        points: type.points !== undefined ? type.points : ROW_POINTS[r % ROW_POINTS.length],
        alive: true,
      };
      if (brick.kind === "stone") brick.cracks = makeCracks(r, c, brickW, BRICK_H);
      bricks.push(brick);
      brickGrid.set(r + ":" + c, brick);
    }
  }

  // Sliding rows sweep across all the free width on either side of their bricks.
  (def.slide || []).forEach((row, i) => {
    const rowBricks = bricks.filter(b => b.r === row);
    const minX = Math.min(...rowBricks.map(b => b.baseX));
    const maxX = Math.max(...rowBricks.map(b => b.baseX + b.w));
    const lo = -(minX - 6), hi = W - 6 - maxX;
    slideRows.push({ bricks: rowBricks, center: (lo + hi) / 2, amp: (hi - lo) / 2, dir: i % 2 ? -1 : 1 });
  });
  moveSlidingRows();
}

function moveSlidingRows() {
  for (const s of slideRows) {
    const offset = s.center + s.amp * Math.sin(slideStep * SLIDE_SPEED) * s.dir;
    for (const b of s.bricks) b.x = b.baseX + offset;
  }
}

function isBreakable(b) { return b.kind !== "iron" && b.kind !== "lock"; }
function levelIsClear() { return bricks.every(b => !b.alive || b.kind === "iron"); }

function loadLevel(index) {
  levelIndex = index;
  difficulty = difficultyFor(index, mode.levels.length);
  shakeMagnitude = 0;
  resetPaddleAndBall();
  buildBricks();
  updateHud();
}

function updateHud() {
  document.getElementById("score").textContent = score;
  const def = currentLevel();
  document.getElementById("level-label").textContent = mode.title + " · " + def.label;
  document.getElementById("progress-label").textContent = (levelIndex + 1) + " / " + mode.levels.length;
}

// ---- Effects ----
function triggerShake(amount) {
  shakeMagnitude = Math.max(shakeMagnitude, amount);
}

function spawnParticles(x, y, color, count = 10) {
  for (let i = 0; i < count; i++) {
    particles.push({ x, y, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, life: 1, color });
  }
}

function spawnShards(brick, color) {
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      shards.push({
        x: brick.x + col * brick.w / 2 + brick.w / 4,
        y: brick.y + row * brick.h / 2 + brick.h / 4,
        w: brick.w / 2 - 2,
        h: brick.h / 2 - 2,
        vx: (col === 0 ? -1 : 1) * (0.8 + Math.random() * 1.5),
        vy: -3 - Math.random() * 2.5,
        rot: 0,
        vr: (Math.random() - 0.5) * 0.3,
        color,
      });
    }
  }
}

function spawnFlash(x, y, color, maxR) {
  flashes.push({ x, y, color, r: 4, maxR, life: 1 });
}

// ---- Brick hits ----
// Returns true when the hit counted as progress (damage or destruction).
function hitBrick(b) {
  if (b.kind === "iron") {
    beep(1400, 0.05, "triangle", 0.04);
    spawnParticles(b.x + b.w / 2, b.y + b.h / 2, "#dfe6ee", 4);
    return false;
  }
  if (b.kind === "lock") {
    beep(260, 0.06, "square", 0.04);
    return false;
  }
  if (b.kind === "stone" && b.hp > 1) {
    b.hp--;
    beep(330 + b.hp * 60, 0.06, "square", 0.05);
    spawnParticles(b.x + b.w / 2, b.y + b.h / 2, STONE_COLORS[b.hp], 6);
    triggerShake(1.5);
    return true;
  }
  destroyBrick(b, false);
  return true;
}

function destroyBrick(b, byExplosion) {
  b.alive = false;
  score += b.points;
  updateHud();
  const color = brickColor(b);
  spawnParticles(b.x + b.w / 2, b.y + b.h / 2, color);
  spawnShards(b, color);
  if (!byExplosion) beep(600 + b.points * 4, 0.07, "square", 0.05);
  triggerShake(2.5);

  if (Math.random() < POWERUP_DROP_CHANCE * (byExplosion ? 0.5 : 1)) {
    const pt = pickPowerupType();
    powerups.push({ x: b.x + b.w / 2 - 13, y: b.y + b.h / 2 - 9, w: 26, h: 18, vy: 2.5, type: pt.type, color: pt.color, label: pt.label });
  }

  if (b.kind === "tnt") explode(b);
  if (b.kind === "key" && !bricks.some(o => o.alive && o.kind === "key")) unlockAll();
}

function explode(b) {
  beep(90, 0.35, "sawtooth", 0.08);
  triggerShake(7);
  spawnFlash(b.x + b.w / 2, b.y + b.h / 2, "#ffb347", 110);
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const n = brickGrid.get((b.r + dr) + ":" + (b.c + dc));
      if (n && n.alive && isBreakable(n)) destroyBrick(n, true); // TNT neighbours chain on
    }
  }
}

function unlockAll() {
  beep(660, 0.12, "triangle", 0.07);
  setTimeout(() => beep(990, 0.18, "triangle", 0.07), 110);
  for (const b of bricks) {
    if (!b.alive || b.kind !== "lock") continue;
    b.kind = "normal";
    b.points = ROW_POINTS[b.r % ROW_POINTS.length];
    spawnFlash(b.x + b.w / 2, b.y + b.h / 2, "#e8b923", 40);
  }
}

// Keep the ball from travelling almost horizontally (endless wall-to-wall bouncing).
function enforceMinVertical(ball) {
  const speed = Math.hypot(ball.vx, ball.vy);
  const minVy = speed * MIN_VERTICAL;
  if (Math.abs(ball.vy) >= minVy) return;
  ball.vy = (ball.vy < 0 ? -1 : 1) * minVy;
  ball.vx = (ball.vx < 0 ? -1 : 1) * Math.sqrt(speed * speed - minVy * minVy);
}

// ---- Power-ups ----
function pickPowerupType() {
  const total = POWERUP_TYPES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of POWERUP_TYPES) {
    if (r < p.weight) return p;
    r -= p.weight;
  }
  return POWERUP_TYPES[0];
}

function applyPowerup(type) {
  if (type === "wide") {
    paddle.wideUntil = Date.now() + 10000;
  } else if (type === "slow") {
    slowUntil = Date.now() + 8000;
  } else if (type === "bonus") {
    score += 100;
    updateHud();
  } else if (type === "multi") {
    const source = balls.find(b => !b.stuck);
    if (!source) return;
    for (const delta of [0.45, -0.45]) {
      if (balls.length >= MAX_BALLS) break;
      const speed = Math.hypot(source.vx, source.vy);
      const angle = Math.atan2(source.vy, source.vx) + delta;
      balls.push({ x: source.x, y: source.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: BALL_R, stuck: false, stall: 0 });
    }
  }
}

function launchBall() {
  const stuckBall = balls.find(b => b.stuck);
  if (!stuckBall) return;
  stuckBall.stuck = false;
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
  const speed = difficulty.ballSpeed * currentSpeedMul;
  stuckBall.vx = Math.cos(angle) * speed;
  stuckBall.vy = Math.sin(angle) * speed;
}

// ---- Update (one fixed 60 Hz step) ----
function update() {
  shakeMagnitude *= 0.9;
  if (shakeMagnitude < 0.1) shakeMagnitude = 0;
  pollGamepadButtons();

  if (state !== "playing") return;
  const now = Date.now();

  paddle.w = now < paddle.wideUntil ? Math.round(difficulty.paddleW * 1.5) : difficulty.paddleW;

  // arrow keys/gamepad nudge every step; mouse/touch set the position directly in their handlers
  if (keys["ArrowLeft"]) paddle.x -= paddle.speed;
  if (keys["ArrowRight"]) paddle.x += paddle.speed;
  paddle.x += gamepadPaddleDelta() * paddle.speed;
  paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));

  // "slow" power-up: rescale velocities whenever the multiplier changes
  const desiredMul = now < slowUntil ? 0.6 : 1;
  if (desiredMul !== currentSpeedMul) {
    const ratio = desiredMul / currentSpeedMul;
    for (const b of balls) { b.vx *= ratio; b.vy *= ratio; }
    currentSpeedMul = desiredMul;
  }

  slideStep++;
  moveSlidingRows();

  for (const ball of balls) {
    if (ball.stuck) {
      ball.x = paddle.x + paddle.w / 2;
      ball.y = paddle.y - ball.r - 1;
      continue;
    }

    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx *= -1; beep(220, 0.05); }
    if (ball.x + ball.r > W) { ball.x = W - ball.r; ball.vx *= -1; beep(220, 0.05); }
    if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy *= -1; beep(220, 0.05); }

    // paddle: bounce angle depends on where the ball hits (edges → up to 60°)
    if (ball.vy > 0 &&
        ball.y + ball.r > paddle.y && ball.y + ball.r < paddle.y + paddle.h + 10 &&
        ball.x + ball.r > paddle.x && ball.x - ball.r < paddle.x + paddle.w) {
      const hitPos = Math.max(-1, Math.min(1, (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2)));
      const angle = hitPos * (Math.PI / 3);
      const speed = Math.hypot(ball.vx, ball.vy);
      ball.vx = Math.sin(angle) * speed;
      ball.vy = -Math.cos(angle) * speed;
      ball.y = paddle.y - ball.r - 1;
      ball.stall = 0;
      beep(440, 0.06, "triangle", 0.06);
    }

    for (const b of bricks) {
      if (!b.alive) continue;
      if (ball.x + ball.r > b.x && ball.x - ball.r < b.x + b.w &&
          ball.y + ball.r > b.y && ball.y - ball.r < b.y + b.h) {
        // bounce off the side with the shallower overlap, and push the ball out of
        // bricks that survive the hit (iron, locks, stone, sliding rows)
        const overlapX = Math.min(ball.x + ball.r - b.x, b.x + b.w - (ball.x - ball.r));
        const overlapY = Math.min(ball.y + ball.r - b.y, b.y + b.h - (ball.y - ball.r));
        if (overlapX < overlapY) {
          const fromLeft = ball.x < b.x + b.w / 2;
          ball.vx = (fromLeft ? -1 : 1) * Math.abs(ball.vx);
          ball.x = fromLeft ? b.x - ball.r : b.x + b.w + ball.r;
        } else {
          const fromAbove = ball.y < b.y + b.h / 2;
          ball.vy = (fromAbove ? -1 : 1) * Math.abs(ball.vy);
          ball.y = fromAbove ? b.y - ball.r : b.y + b.h + ball.r;
        }
        enforceMinVertical(ball);
        if (hitBrick(b)) ball.stall = 0;
        break;
      }
    }

    // stuck in a loop between unbreakable bricks and walls → tilt the ball slightly
    ball.stall = (ball.stall || 0) + 1;
    if (ball.stall > STALL_STEPS) {
      const speed = Math.hypot(ball.vx, ball.vy);
      const angle = Math.atan2(ball.vy, ball.vx) + (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.2);
      ball.vx = Math.cos(angle) * speed;
      ball.vy = Math.sin(angle) * speed;
      enforceMinVertical(ball);
      ball.stall = 0;
    }
  }

  // unlimited lives: losing the last ball just puts a new one on the paddle
  const before = balls.length;
  balls = balls.filter(ball => ball.y - ball.r <= H);
  if (balls.length === 0 && before > 0) {
    triggerShake(8);
    beep(160, 0.25, "sawtooth", 0.06);
    resetPaddleAndBall();
  }

  if (levelIsClear()) {
    levelCleared();
    return;
  }

  for (const p of powerups) p.y += p.vy;
  powerups = powerups.filter(p => {
    if (p.y > H) return false;
    const caught = p.x + p.w > paddle.x && p.x < paddle.x + paddle.w &&
                   p.y + p.h > paddle.y && p.y < paddle.y + paddle.h;
    if (caught) {
      applyPowerup(p.type);
      beep(760, 0.09, "sine", 0.06);
      return false;
    }
    return true;
  });

  for (const p of particles) { p.x += p.vx; p.y += p.vy; p.life -= 0.03; }
  particles = particles.filter(p => p.life > 0);

  for (const s of shards) { s.vy += SHARD_GRAVITY; s.x += s.vx; s.y += s.vy; s.rot += s.vr; }
  shards = shards.filter(s => s.y < H + 40);

  for (const f of flashes) { f.r += (f.maxR - f.r) * 0.2; f.life -= 0.05; }
  flashes = flashes.filter(f => f.life > 0);
}

// ---- Draw ----
function shadeColor(hex, amt) {
  const num = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((num >> 16) + amt);
  const g = clamp(((num >> 8) & 0xff) + amt);
  const b = clamp((num & 0xff) + amt);
  return "rgb(" + r + "," + g + "," + b + ")";
}

function drawBackground() {
  const grad = ctx.createRadialGradient(W / 2, H * 0.4, 40, W / 2, H * 0.4, 620);
  grad.addColorStop(0, "#1c2338");
  grad.addColorStop(1, "#090b14");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function brickColor(b) {
  if (b.kind === "stone") return STONE_COLORS[b.hp - 1];
  if (b.kind === "iron") return "#8f9aa6";
  if (b.kind === "tnt") return "#c0392b";
  if (b.kind === "key") return "#e8b923";
  if (b.kind === "lock") return "#5d4d8f";
  return b.color;
}

function drawBrickBody(b, color) {
  const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
  grad.addColorStop(0, shadeColor(color, 28));
  grad.addColorStop(1, shadeColor(color, -22));
  ctx.fillStyle = grad;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(b.x, b.y, b.w, 2.5);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(b.x, b.y + b.h - 2.5, b.w, 2.5);
}

function drawBrick(b) {
  drawBrickBody(b, brickColor(b));
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  ctx.save();
  if (b.kind === "stone") {
    // cracks: none at 3 hits left, one at 2, all three at 1
    const shown = b.hp === 3 ? 0 : b.hp === 2 ? 1 : 3;
    ctx.strokeStyle = "rgba(30,24,18,0.75)";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < shown; i++) {
      ctx.beginPath();
      b.cracks[i].forEach(([px, py], j) => (j ? ctx.lineTo(b.x + px, b.y + py) : ctx.moveTo(b.x + px, b.y + py)));
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  } else if (b.kind === "iron") {
    ctx.strokeStyle = "#3d4550";
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    ctx.fillStyle = "#4b5561"; // rivets
    for (const [rx, ry] of [[5, 5], [b.w - 5, 5], [5, b.h - 5], [b.w - 5, b.h - 5]]) {
      ctx.beginPath(); ctx.arc(b.x + rx, b.y + ry, 1.8, 0, Math.PI * 2); ctx.fill();
    }
  } else if (b.kind === "tnt") {
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(b.x + 6, cy - 1.5, b.w - 12, 3);
    ctx.fillStyle = "#fff4d6";
    ctx.font = "bold 12px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("TNT", cx, cy + 1);
  } else if (b.kind === "key") {
    ctx.strokeStyle = "#5a4100";
    ctx.fillStyle = "#5a4100";
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(cx - 10, cy, 4.5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillRect(cx - 5.5, cy - 1.1, 17, 2.2);
    ctx.fillRect(cx + 6, cy, 2.2, 5);
    ctx.fillRect(cx + 10, cy, 2.2, 4);
  } else if (b.kind === "lock") {
    ctx.strokeStyle = "#d9d0f5";
    ctx.fillStyle = "#d9d0f5";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy - 2, 4.5, Math.PI, 0); ctx.stroke();
    ctx.fillRect(cx - 6.5, cy - 2, 13, 9);
  }
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (shakeMagnitude > 0) {
    ctx.translate((Math.random() - 0.5) * shakeMagnitude, (Math.random() - 0.5) * shakeMagnitude);
  }

  drawBackground();
  for (const b of bricks) if (b.alive) drawBrick(b);

  for (const p of particles) {
    ctx.globalAlpha = Math.max(p.life, 0);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 4, 4);
  }
  ctx.globalAlpha = 1;

  for (const s of shards) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.fillStyle = s.color;
    ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
    ctx.restore();
  }

  for (const f of flashes) {
    ctx.globalAlpha = Math.max(f.life, 0) * 0.8;
    ctx.strokeStyle = f.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (const p of powerups) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.roundRect(p.x, p.y, p.w, p.h, 5);
    ctx.fill();
    ctx.fillStyle = "#10142a";
    ctx.font = "bold 12px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.label, p.x + p.w / 2, p.y + p.h / 2 + 1);
  }

  const paddleBase = Date.now() < paddle.wideUntil ? "#8fb4e0" : "#c7cdd6";
  const paddleGrad = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.h);
  paddleGrad.addColorStop(0, shadeColor(paddleBase, 35));
  paddleGrad.addColorStop(1, shadeColor(paddleBase, -30));
  ctx.save();
  ctx.shadowColor = paddleBase;
  ctx.shadowBlur = 10;
  ctx.fillStyle = paddleGrad;
  ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
  ctx.restore();

  for (const ball of balls) {
    ctx.save();
    ctx.shadowColor = "rgba(200,210,224,0.7)";
    ctx.shadowBlur = 9;
    const ballGrad = ctx.createRadialGradient(ball.x - ball.r * 0.4, ball.y - ball.r * 0.4, 0.5, ball.x, ball.y, ball.r);
    ballGrad.addColorStop(0, "#ffffff");
    ballGrad.addColorStop(0.6, "#c7cdd6");
    ballGrad.addColorStop(1, "#7f8790");
    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (state === "playing" && balls.some(b => b.stuck)) {
    ctx.fillStyle = "rgba(238,241,255,0.55)";
    ctx.font = "14px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("Topu atmak için tıkla ya da boşluğa bas", W / 2, paddle.y - 30);
  }

  ctx.restore();
}

// ---- Menus and flow ----
const overlay = document.getElementById("overlay");
const panels = {
  modes: document.getElementById("menu-modes"),
  levels: document.getElementById("menu-levels"),
  card: document.getElementById("card"),
};
let primaryAction = null; // what Space/Enter/gamepad-A does while the overlay is open

function showPanel(name) {
  for (const key in panels) panels[key].classList.toggle("visible", key === name);
  overlay.classList.add("visible");
  overlay.scrollTop = 0;
}
function hideOverlay() {
  overlay.classList.remove("visible");
  primaryAction = null;
}

function showModeMenu() {
  state = "menu";
  for (const id in MODES) {
    const m = MODES[id];
    document.querySelector('[data-progress="' + id + '"]').textContent =
      progress[id].length + " / " + m.levels.length + " bölüm tamamlandı";
  }
  primaryAction = null;
  showPanel("modes");
}

function firstUnfinishedIndex(m) {
  const i = m.levels.findIndex(l => !isCompleted(m, l));
  return i === -1 ? 0 : i;
}

function showLevelMenu(modeId) {
  state = "menu";
  mode = MODES[modeId];
  document.getElementById("levels-title").textContent = mode.title + " Modu";
  const list = document.getElementById("chapter-list");
  list.innerHTML = "";
  let index = 0;
  mode.chapters.forEach((chapter) => {
    const section = document.createElement("div");
    section.className = "chapter";
    const heading = document.createElement("h3");
    heading.textContent = chapter.title;
    const row = document.createElement("div");
    row.className = "chapter-levels";
    chapter.levels.forEach(() => {
      const level = mode.levels[index];
      const i = index;
      const btn = document.createElement("button");
      btn.className = "level-btn" + (isCompleted(mode, level) ? " done" : "");
      btn.textContent = level.label;
      btn.addEventListener("click", () => startRun(i));
      row.appendChild(btn);
      index++;
    });
    section.append(heading, row);
    list.appendChild(section);
  });
  const next = firstUnfinishedIndex(mode);
  const continueBtn = document.getElementById("continue-btn");
  continueBtn.textContent = "Devam Et: " + mode.levels[next].label;
  continueBtn.onclick = () => startRun(next);
  primaryAction = () => startRun(next);
  showPanel("levels");
}

// Generic card: kicker (small caps line), title, text and buttons.
// The first button is also the keyboard/gamepad default.
function showCard(kicker, title, text, actions) {
  document.getElementById("card-kicker").textContent = kicker;
  document.getElementById("card-title").textContent = title;
  document.getElementById("card-text").textContent = text;
  const box = document.getElementById("card-actions");
  box.innerHTML = "";
  actions.forEach(([label, fn], i) => {
    const btn = document.createElement("button");
    if (i > 0) btn.className = "ghost";
    btn.textContent = label;
    btn.addEventListener("click", fn);
    box.appendChild(btn);
  });
  primaryAction = actions[0][1];
  showPanel("card");
}

function play() {
  hideOverlay();
  state = "playing";
}

// Level intro: history levels get their event card, classic levels a short title card.
function introduceLevel() {
  const def = currentLevel();
  state = "menu";
  if (mode.id === "history") {
    showCard(def.chapter + " · " + def.year, def.name, def.note, [["Başla", play]]);
  } else {
    showCard(def.chapter + " · Bölüm " + (levelIndex + 1) + " / " + mode.levels.length, def.name, def.hint || "", [["Başla", play]]);
  }
}

function startRun(index) {
  score = 0;
  loadLevel(index);
  introduceLevel();
}

function levelCleared() {
  beep(880, 0.15, "triangle", 0.07);
  setTimeout(() => beep(1320, 0.2, "triangle", 0.07), 120);
  markCompleted(mode, currentLevel());
  state = "menu";
  if (levelIndex >= mode.levels.length - 1) {
    const text = mode.id === "history"
      ? "MÖ 220'den 1939'a bütün tarih bölümlerini bitirdin. Skor: " + score
      : "Bütün Klasik bölümleri bitirdin. Skor: " + score;
    showCard("Tebrikler", "Mod Tamamlandı!", text, [
      ["Bölüm Listesi", () => showLevelMenu(mode.id)],
      ["Ana Menü", showModeMenu],
    ]);
    return;
  }
  loadLevel(levelIndex + 1);
  introduceLevel();
}

function openPauseMenu() {
  if (state !== "playing") return;
  state = "paused";
  showCard("Duraklatıldı", currentLevel().label, "Skor: " + score, [
    ["Devam Et", play],
    ["Bölüm Listesi", () => showLevelMenu(mode.id)],
    ["Ana Menü", showModeMenu],
  ]);
}

document.querySelectorAll(".mode-card").forEach((btn) => {
  btn.addEventListener("click", () => showLevelMenu(btn.dataset.mode));
});
document.getElementById("back-to-modes").addEventListener("click", showModeMenu);

// ---- Input: mouse, touch, keyboard and gamepad all work together ----
function setPaddleFromClientX(clientX) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) * (W / rect.width);
  paddle.x = Math.max(0, Math.min(W - paddle.w, x - paddle.w / 2));
}
canvas.addEventListener("mousemove", (e) => {
  if (state === "playing") setPaddleFromClientX(e.clientX);
});
canvas.addEventListener("touchmove", (e) => {
  if (state === "playing" && e.touches.length > 0) setPaddleFromClientX(e.touches[0].clientX);
  e.preventDefault();
}, { passive: false });
canvas.addEventListener("click", () => { if (state === "playing") launchBall(); });
canvas.addEventListener("touchend", () => { if (state === "playing") launchBall(); });

function confirmOrLaunch() {
  if (state === "playing") launchBall();
  else if (primaryAction) primaryAction();
}

const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.key] = true;
  if (e.key === " " || e.key === "Enter") {
    // let a focused button handle Enter itself; Space always acts as the game's "fire"
    if (e.key === "Enter" && document.activeElement && document.activeElement.tagName === "BUTTON") return;
    e.preventDefault();
    if (!e.repeat) confirmOrLaunch();
  }
  if (e.key === "Escape" || e.key === "p" || e.key === "P") {
    if (state === "playing") openPauseMenu();
    else if (state === "paused") play();
  }
});
window.addEventListener("keyup", (e) => { keys[e.key] = false; });

const gamepadStatusEl = document.getElementById("gamepad-status");
let gamepadIndex = null;
window.addEventListener("gamepadconnected", (e) => {
  gamepadIndex = e.gamepad.index;
  gamepadStatusEl.textContent = "🎮 " + e.gamepad.id.slice(0, 24);
});
window.addEventListener("gamepaddisconnected", (e) => {
  if (gamepadIndex === e.gamepad.index) {
    gamepadIndex = null;
    gamepadStatusEl.textContent = "";
  }
});

let gamepadFireHeld = false, gamepadStartHeld = false;
function pollGamepadButtons() {
  if (gamepadIndex === null) return;
  const gp = navigator.getGamepads()[gamepadIndex];
  if (!gp) return;
  const fire = gp.buttons[0] && gp.buttons[0].pressed;   // A / cross
  const start = gp.buttons[9] && gp.buttons[9].pressed;  // Start / Options
  if (fire && !gamepadFireHeld) confirmOrLaunch();
  if (start && !gamepadStartHeld) {
    if (state === "playing") openPauseMenu();
    else if (state === "paused") play();
  }
  gamepadFireHeld = fire;
  gamepadStartHeld = start;
}

function gamepadPaddleDelta() {
  if (gamepadIndex === null) return 0;
  const gp = navigator.getGamepads()[gamepadIndex];
  if (!gp) return 0;
  let d = 0;
  const axis = gp.axes[0] || 0;
  if (Math.abs(axis) > 0.15) d += axis;
  if (gp.buttons[14] && gp.buttons[14].pressed) d -= 1; // D-pad left
  if (gp.buttons[15] && gp.buttons[15].pressed) d += 1; // D-pad right
  return d;
}

// ---- Main loop: fixed-step physics so speed is the same on 60 Hz and 120 Hz screens ----
let lastTime = null, accumulator = 0;
function loop(time) {
  if (lastTime === null) lastTime = time;
  accumulator = Math.min(accumulator + (time - lastTime), 100); // cap catch-up after a background tab
  lastTime = time;
  while (accumulator >= STEP_MS) {
    update();
    accumulator -= STEP_MS;
  }
  draw();
  requestAnimationFrame(loop);
}

loadLevel(0);
showModeMenu();
requestAnimationFrame(loop);
