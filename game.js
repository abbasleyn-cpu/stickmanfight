// game.js
// Stickman Fight - client
// PC + mobile controls, canvas renderer, effects and WebSocket multiplayer.

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const socketUrl =
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;

let socket = null;
let role = null;
let roomCode = "";
let state = null;
let lastFrame = performance.now();

const WORLD_W = 1200;
const WORLD_H = 600;

const input = {
  left: false,
  right: false,
  jump: false,
  block: false
};

const visuals = [];

const $ = (id) => document.getElementById(id);

const createBtn = $("createBtn");
const showJoinBtn = $("showJoinBtn");
const joinBtn = $("joinBtn");
const roomInput = $("roomInput");
const joinBox = $("joinBox");
const roomInfo = $("roomInfo");
const roomCodeEl = $("roomCode");
const copyBtn = $("copyBtn");
const statusEl = $("status");
const connectionEl = $("connection");

const lobby = $("lobby");
const game = $("game");

const roleEl = $("role");
const timerEl = $("timer");
const statusGameEl = $("gameStatus");

const p1Hp = $("p1Hp");
const p2Hp = $("p2Hp");
const p1HpText = $("p1HpText");
const p2HpText = $("p2HpText");

const winOverlay = $("winOverlay");
const winnerText = $("winnerText");
const rematchBtn = $("rematchBtn");


// --------------------------------------------------
// WEBSOCKET
// --------------------------------------------------

function connect() {
  socket = new WebSocket(socketUrl);

  socket.addEventListener("open", () => {
    connectionEl.textContent = "● ONLINE";
    connectionEl.classList.add("online");
  });

  socket.addEventListener("close", () => {
    connectionEl.textContent = "● OFFLINE";
    connectionEl.classList.remove("online");

    statusEl.textContent =
      "Connection lost. Refresh the page to reconnect.";

    statusGameEl.textContent = "Disconnected";
  });

  socket.addEventListener("error", () => {
    connectionEl.textContent = "Connection error";
  });

  socket.addEventListener("message", (event) => {
    let msg;

    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    handleMessage(msg);
  });
}

function send(data) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(data));
}

function handleMessage(msg) {
  switch (msg.type) {
    case "welcome":
      role = msg.role;
      roomCode = msg.code;

      roomCodeEl.textContent = roomCode;
      roleEl.textContent = role;

      roomInfo.hidden = false;
      createBtn.disabled = true;
      showJoinBtn.disabled = true;

      statusEl.textContent =
        role === "P1"
          ? "Room created. Waiting for Player 2..."
          : "Joined room. Waiting for match...";

      break;

    case "room":
      roomCode = msg.code || roomCode;
      roomCodeEl.textContent = roomCode;

      if (msg.started) {
        lobby.hidden = true;
        game.hidden = false;

        statusGameEl.textContent = "FIGHT!";
      } else {
        lobby.hidden = false;
        game.hidden = true;

        statusEl.textContent =
          msg.connected >= 2
            ? "Both players connected. Starting..."
            : "Waiting for Player 2...";
      }

      break;

    case "state":
      state = msg;

      if (msg.started) {
        lobby.hidden = true;
        game.hidden = false;
      }

      updateHUD();
      processEvents(msg.events || []);

      if (msg.winner) {
        showWinner(msg.winner);
      } else {
        winOverlay.hidden = true;
      }

      break;

    case "error":
      statusEl.textContent = msg.message || "Error";
      statusGameEl.textContent = msg.message || "Error";
      break;
  }
}


// --------------------------------------------------
// LOBBY
// --------------------------------------------------

createBtn.addEventListener("click", () => {
  send({ type: "create" });
});

showJoinBtn.addEventListener("click", () => {
  joinBox.hidden = !joinBox.hidden;

  if (!joinBox.hidden) {
    roomInput.focus();
  }
});

joinBtn.addEventListener("click", () => {
  const code = roomInput.value.trim().toUpperCase();

  if (!code) {
    statusEl.textContent = "Enter a room code.";
    return;
  }

  send({
    type: "join",
    code
  });
});

roomInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    joinBtn.click();
  }
});

copyBtn.addEventListener("click", async () => {
  if (!roomCode) return;

  try {
    await navigator.clipboard.writeText(roomCode);
    copyBtn.textContent = "Copied!";

    setTimeout(() => {
      copyBtn.textContent = "Copy";
    }, 1000);
  } catch {
    statusEl.textContent = `Room code: ${roomCode}`;
  }
});

rematchBtn.addEventListener("click", () => {
  send({ type: "rematch" });
  winnerText.textContent = "Waiting for opponent...";
  rematchBtn.disabled = true;
});


// --------------------------------------------------
// KEYBOARD
// --------------------------------------------------

const keyMapP1 = {
  KeyA: "left",
  KeyD: "right",
  KeyW: "jump",
  KeyG: "block"
};

const keyMapP2 = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "jump",
  KeyK: "block"
};

function getKeyMap() {
  return role === "P2" ? keyMapP2 : keyMapP1;
}

function keyboardAction(code) {
  if (role === "P1") {
    if (code === "KeyF") return "attack";
    if (code === "KeyR") return "kick";
    if (code === "Digit1") return "fire";
    if (code === "Digit2") return "dash";
    if (code === "Digit3") return "wind";
  }

  if (role === "P2") {
    if (code === "KeyL") return "attack";
    if (code === "KeyO") return "kick";
    if (code === "Digit8") return "fire";
    if (code === "Digit9") return "dash";
    if (code === "Digit0") return "wind";
  }

  return null;
}

window.addEventListener("keydown", (event) => {
  const map = getKeyMap();

  if (map[event.code]) {
    input[map[event.code]] = true;
    event.preventDefault();
  }

  const action = keyboardAction(event.code);

  if (action && !event.repeat) {
    send({
      type: "action",
      action
    });

    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  const map = getKeyMap();

  if (map[event.code]) {
    input[map[event.code]] = false;
    event.preventDefault();
  }
});

window.addEventListener("blur", () => {
  input.left = false;
  input.right = false;
  input.jump = false;
  input.block = false;

  send({
    type: "input",
    input
  });
});


// --------------------------------------------------
// SEND INPUT
// --------------------------------------------------

setInterval(() => {
  send({
    type: "input",
    input: {
      left: input.left,
      right: input.right,
      jump: input.jump,
      block: input.block
    }
  });
}, 50);


// --------------------------------------------------
// MOBILE CONTROLS
// --------------------------------------------------

document.querySelectorAll("[data-input]").forEach((button) => {
  const key = button.dataset.input;

  const press = (event) => {
    event.preventDefault();

    try {
      button.setPointerCapture(event.pointerId);
    } catch {}

    input[key] = true;
    button.classList.add("pressed");
  };

  const release = (event) => {
    event.preventDefault();

    input[key] = false;
    button.classList.remove("pressed");
  };

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();

    button.classList.add("pressed");

    send({
      type: "action",
      action: button.dataset.action
    });

    setTimeout(() => {
      button.classList.remove("pressed");
    }, 120);
  });
});


// --------------------------------------------------
// HUD
// --------------------------------------------------

function updateHUD() {
  if (!state || !state.players) return;

  const p1 = state.players.P1;
  const p2 = state.players.P2;

  if (p1) {
    const hp = Math.max(0, Math.min(100, p1.hp));
    p1Hp.style.width = `${hp}%`;
    p1HpText.textContent = `${Math.ceil(hp)} HP`;
  }

  if (p2) {
    const hp = Math.max(0, Math.min(100, p2.hp));
    p2Hp.style.width = `${hp}%`;
    p2HpText.textContent = `${Math.ceil(hp)} HP`;
  }

  timerEl.textContent =
    state.time !== undefined
      ? Math.ceil(state.time)
      : "60";

  updateCooldownButtons();

  if (state.started) {
    statusGameEl.textContent =
      role === "P1"
        ? "You are Player 1"
        : "You are Player 2";
  }
}

function updateCooldownButtons() {
  if (!state || !role) return;

  const player = state.players?.[role];

  if (!player) return;

  const cooldowns = player.cooldowns || {};

  const buttons = {
    fire: document.querySelector('[data-action="fire"]'),
    dash: document.querySelector('[data-action="dash"]'),
    wind: document.querySelector('[data-action="wind"]')
  };

  const names = {
    fire: "🔥 FIRE",
    dash: "⚡ DASH",
    wind: "🌪 WIND"
  };

  for (const key of Object.keys(buttons)) {
    const button = buttons[key];

    if (!button) continue;

    const cd = Number(cooldowns[key] || 0);

    if (cd > 0) {
      button.textContent = `${names[key]} ${cd.toFixed(1)}`;
      button.classList.add("cooldown");
    } else {
      button.textContent = names[key];
      button.classList.remove("cooldown");
    }
  }
}

function showWinner(winner) {
  winOverlay.hidden = false;
  rematchBtn.disabled = false;

  if (winner === "draw") {
    winnerText.textContent = "DRAW!";
    return;
  }

  if (winner === role) {
    winnerText.textContent = "YOU WIN!";
  } else {
    winnerText.textContent = "YOU LOSE!";
  }
}


// --------------------------------------------------
// CANVAS RESIZE
// --------------------------------------------------

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();

  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resizeCanvas);

resizeCanvas();


// --------------------------------------------------
// WORLD TRANSFORM
// --------------------------------------------------

function setupWorldTransform() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  const scale = Math.min(
    width / WORLD_W,
    height / WORLD_H
  );

  const offsetX = (width - WORLD_W * scale) / 2;
  const offsetY = (height - WORLD_H * scale) / 2;

  ctx.setTransform(
    scale,
    0,
    0,
    scale,
    offsetX,
    offsetY
  );
}


// --------------------------------------------------
// DRAW ARENA
// --------------------------------------------------

function drawArena() {
  // Background
  const gradient = ctx.createLinearGradient(
    0,
    0,
    0,
    WORLD_H
  );

  gradient.addColorStop(0, "#10162b");
  gradient.addColorStop(0.6, "#171d38");
  gradient.addColorStop(1, "#090c18");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  // Moon
  ctx.beginPath();
  ctx.arc(1000, 100, 55, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fill();

  // Stars
  for (let i = 0; i < 60; i++) {
    const x = (i * 197) % WORLD_W;
    const y = (i * 83) % 350;

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(x, y, 2, 2);
  }

  // Arena grid
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.045)";

  for (let x = 0; x <= WORLD_W; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD_H);
    ctx.stroke();
  }

  for (let y = 0; y <= WORLD_H; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_W, y);
    ctx.stroke();
  }

  // Ground glow
  const groundY = 510;

  const groundGradient = ctx.createLinearGradient(
    0,
    groundY,
    0,
    WORLD_H
  );

  groundGradient.addColorStop(0, "#242b4b");
  groundGradient.addColorStop(1, "#0a0d19");

  ctx.fillStyle = groundGradient;
  ctx.fillRect(0, groundY, WORLD_W, WORLD_H - groundY);

  // Ground line
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(WORLD_W, groundY);

  ctx.lineWidth = 5;
  ctx.strokeStyle = "#7781a8";
  ctx.stroke();

  // Center line
  ctx.beginPath();
  ctx.moveTo(WORLD_W / 2, groundY - 30);
  ctx.lineTo(WORLD_W / 2, groundY + 5);

  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.stroke();
}


// --------------------------------------------------
// STICKMAN
// --------------------------------------------------

function drawStickman(player) {
  if (!player) return;

  // Important:
  // server uses player.x/player.y as the FOOT position.
  // Keep everything relative to that point.

  const x = Number(player.x);
  const y = Number(player.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }

  const facing =
    Number(player.facing) < 0 ? -1 : 1;

  const hp = Number(player.hp ?? 100);

  ctx.save();

  ctx.translate(x, y);
  ctx.scale(facing, 1);

  // Shadow
  ctx.save();

  ctx.scale(1, 0.25);

  ctx.beginPath();
  ctx.ellipse(
    0,
    0,
    42,
    16,
    0,
    0,
    Math.PI * 2
  );

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fill();

  ctx.restore();

  // Dash afterimage
  if (player.dashTimer > 0) {
    for (let i = 1; i <= 4; i++) {
      ctx.globalAlpha = 0.12 * (5 - i);

      ctx.strokeStyle = "#77ddff";
      ctx.lineWidth = 7;

      ctx.beginPath();
      ctx.moveTo(-30 - i * 16, -55);
      ctx.lineTo(-80 - i * 20, -55);

      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  // Body styling
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const bodyColor =
    player.role === "P1"
      ? "#65a8ff"
      : "#ff657c";

  const glowColor =
    player.role === "P1"
      ? "#72c8ff"
      : "#ff728b";

  ctx.shadowBlur = 14;
  ctx.shadowColor = glowColor;

  ctx.strokeStyle = bodyColor;
  ctx.fillStyle = bodyColor;

  // HEAD
  ctx.beginPath();
  ctx.arc(
    0,
    -92,
    21,
    0,
    Math.PI * 2
  );

  ctx.fill();

  // Face
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "#080a12";
  ctx.lineWidth = 4;

  ctx.beginPath();
  ctx.moveTo(7, -96);
  ctx.lineTo(14, -94);
  ctx.stroke();

  // BODY
  ctx.strokeStyle = bodyColor;
  ctx.lineWidth = 9;

  ctx.beginPath();
  ctx.moveTo(0, -70);
  ctx.lineTo(0, -28);
  ctx.stroke();

  // Legs
  ctx.lineWidth = 8;

  ctx.beginPath();
  ctx.moveTo(0, -28);
  ctx.lineTo(-20, 0);
  ctx.lineTo(-30, 0);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -28);
  ctx.lineTo(20, 0);
  ctx.lineTo(32, 0);
  ctx.stroke();

  // Arms
  const attacking =
    Number(player.attackTimer || 0) > 0;

  if (attacking) {
    // Punching arm
    ctx.lineWidth = 9;

    ctx.beginPath();
    ctx.moveTo(0, -62);
    ctx.lineTo(30, -52);
    ctx.lineTo(68, -55);
    ctx.stroke();

    // Fist
    ctx.beginPath();
    ctx.arc(73, -55, 9, 0, Math.PI * 2);
    ctx.fill();
  } else if (player.blocking) {
    // Blocking arm
    ctx.lineWidth = 8;

    ctx.beginPath();
    ctx.moveTo(0, -62);
    ctx.lineTo(32, -70);
    ctx.lineTo(43, -42);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(43, -42, 9, 0, Math.PI * 2);
    ctx.fill();

    // Shield
    ctx.strokeStyle = "rgba(130,220,255,0.9)";
    ctx.lineWidth = 5;

    ctx.beginPath();
    ctx.arc(
      40,
      -60,
      43,
      -Math.PI / 2,
      Math.PI / 2
    );

    ctx.stroke();
  } else {
    // Normal arms
    ctx.lineWidth = 8;

    ctx.beginPath();
    ctx.moveTo(0, -62);
    ctx.lineTo(-30, -43);
    ctx.lineTo(-45, -20);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -62);
    ctx.lineTo(30, -43);
    ctx.lineTo(45, -20);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;

  // Player label
  ctx.font = "bold 16px Arial";
  ctx.textAlign = "center";

  ctx.fillStyle = "#ffffff";
  ctx.fillText(
    player.role,
    0,
    -125
  );

  // Small HP bar above character
  const barWidth = 70;
  const barHeight = 7;

  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(
    -barWidth / 2,
    -115,
    barWidth,
    barHeight
  );

  ctx.fillStyle = bodyColor;
  ctx.fillRect(
    -barWidth / 2,
    -115,
    barWidth * Math.max(0, hp) / 100,
    barHeight
  );

  ctx.restore();
}


// --------------------------------------------------
// PROJECTILES
// --------------------------------------------------

function drawProjectile(projectile) {
  if (!projectile) return;

  const x = Number(projectile.x);
  const y = Number(projectile.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }

  const direction =
    Number(projectile.vx) < 0 ? -1 : 1;

  if (projectile.kind === "wind") {
    ctx.save();

    ctx.translate(x, y);
    ctx.scale(direction, 1);

    ctx.shadowBlur = 25;
    ctx.shadowColor = "#8ff";

    ctx.strokeStyle = "#b8ffff";
    ctx.lineWidth = 7;

    ctx.beginPath();
    ctx.arc(
      0,
      0,
      35,
      -0.9,
      0.9
    );

    ctx.stroke();

    ctx.shadowBlur = 0;

    ctx.restore();

    return;
  }

  // Generic projectile
  ctx.beginPath();
  ctx.arc(
    x,
    y,
    10,
    0,
    Math.PI * 2
  );

  ctx.fillStyle = "#ffffff";
  ctx.fill();
}


// --------------------------------------------------
// EFFECTS
// --------------------------------------------------

function processEvents(events) {
  for (const event of events) {
    spawnEffect(event);
  }
}

function spawnEffect(event) {
  if (!event) return;

  const effect = {
    type: event.type,
    x: Number(event.x || 0),
    y: Number(event.y || 0),
    direction: Number(event.direction || 1),
    life: 0.45,
    maxLife: 0.45,
    particles: []
  };

  if (event.type === "hit") {
    effect.life = 0.3;
    effect.maxLife = 0.3;

    for (let i = 0; i < 12; i++) {
      const angle =
        Math.random() * Math.PI * 2;

      const speed =
        50 + Math.random() * 180;

      effect.particles.push({
        x: 0,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed
      });
    }
  }

  visuals.push(effect);
}

function updateVisuals(dt) {
  for (let i = visuals.length - 1; i >= 0; i--) {
    const effect = visuals[i];

    effect.life -= dt;

    if (effect.type === "hit") {
      for (const p of effect.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }

    if (effect.life <= 0) {
      visuals.splice(i, 1);
    }
  }
}

function drawVisuals() {
  for (const effect of visuals) {
    const progress =
      1 - effect.life / effect.maxLife;

    const alpha =
      Math.max(0, 1 - progress);

    ctx.save();

    ctx.globalAlpha = alpha;

    if (effect.type === "fire") {
      ctx.translate(
        effect.x,
        effect.y
      );

      const radius =
        25 + progress * 50;

      const gradient = ctx.createRadialGradient(
        0,
        0,
        5,
        0,
        0,
        radius
      );

      gradient.addColorStop(0, "#fff");
      gradient.addColorStop(0.25, "#ffd85c");
      gradient.addColorStop(0.65, "#ff6a2a");
      gradient.addColorStop(1, "rgba(255,40,0,0)");

      ctx.fillStyle = gradient;

      ctx.beginPath();
      ctx.arc(
        0,
        0,
        radius,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }

    else if (effect.type === "dash") {
      ctx.translate(
        effect.x,
        effect.y
      );

      ctx.strokeStyle = "#7de9ff";
      ctx.lineWidth = 8;

      for (let i = 0; i < 7; i++) {
        ctx.beginPath();

        ctx.moveTo(
          -effect.direction * i * 20,
          -25 + i * 8
        );

        ctx.lineTo(
          -effect.direction * (100 + i * 15),
          -25 + i * 8
        );

        ctx.stroke();
      }
    }

    else if (effect.type === "wind") {
      ctx.translate(
        effect.x,
        effect.y
      );

      ctx.scale(
        effect.direction,
        1
      );

      ctx.strokeStyle = "#bfffff";
      ctx.lineWidth = 8;

      ctx.beginPath();

      ctx.arc(
        0,
        0,
        35 + progress * 60,
        -1,
        1
      );

      ctx.stroke();
    }

    else if (effect.type === "hit") {
      ctx.translate(
        effect.x,
        effect.y
      );

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;

      for (const p of effect.particles) {
        ctx.beginPath();

        ctx.moveTo(
          p.x,
          p.y
        );

        ctx.lineTo(
          p.x - p.vx * 0.035,
          p.y - p.vy * 0.035
        );

        ctx.stroke();
      }

      ctx.beginPath();

      ctx.arc(
        0,
        0,
        15 + progress * 45,
        0,
        Math.PI * 2
      );

      ctx.stroke();
    }

    ctx.restore();
  }
}


// --------------------------------------------------
// LOCAL FALLBACK CHARACTERS
// --------------------------------------------------

function drawFallbackCharacters() {
  // This guarantees that the canvas isn't empty while
  // waiting for the first server state.

  const p1 = {
    role: "P1",
    x: 300,
    y: 510,
    hp: 100,
    facing: 1,
    blocking: false,
    attackTimer: 0,
    dashTimer: 0
  };

  const p2 = {
    role: "P2",
    x: 900,
    y: 510,
    hp: 100,
    facing: -1,
    blocking: false,
    attackTimer: 0,
    dashTimer: 0
  };

  drawStickman(p1);
  drawStickman(p2);
}


// --------------------------------------------------
// RENDER LOOP
// --------------------------------------------------

function render(now) {
  const dt = Math.min(
    0.05,
    (now - lastFrame) / 1000
  );

  lastFrame = now;

  resizeIfNeeded();

  // Clear using actual CSS canvas size
  ctx.setTransform(
    1,
    0,
    0,
    1,
    0,
    0
  );

  ctx.clearRect(
    0,
    0,
    canvas.clientWidth,
    canvas.clientHeight
  );

  setupWorldTransform();

  drawArena();

  // IMPORTANT:
  // Draw fallback characters first.
  // Then replace them with real server characters.

  if (
    !state ||
    !state.players ||
    !state.players.P1 ||
    !state.players.P2
  ) {
    drawFallbackCharacters();
  } else {
    const p1 = state.players.P1;
    const p2 = state.players.P2;

    drawStickman(p1);
    drawStickman(p2);

    for (const projectile of state.projectiles || []) {
      drawProjectile(projectile);
    }
  }

  updateVisuals(dt);
  drawVisuals();

  requestAnimationFrame(render);
}

let previousCanvasWidth = 0;
let previousCanvasHeight = 0;

function resizeIfNeeded() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  if (
    width !== previousCanvasWidth ||
    height !== previousCanvasHeight
  ) {
    previousCanvasWidth = width;
    previousCanvasHeight = height;

    resizeCanvas();
  }
}

requestAnimationFrame(render);


// --------------------------------------------------
// START
// --------------------------------------------------

connect();
