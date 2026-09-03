const canvas = document.getElementById("arena");
const ctx = canvas.getContext("2d");

const lobby = document.getElementById("lobby");
const game = document.getElementById("game");

const createButton = document.getElementById("createRoom");
const joinButton = document.getElementById("joinRoom");
const showJoin = document.getElementById("showJoin");

const joinPanel = document.getElementById("joinPanel");
const roomInput = document.getElementById("roomInput");

const lobbyStatus = document.getElementById("lobbyStatus");
const roomInfo = document.getElementById("roomInfo");
const connection = document.getElementById("connection");

const hp1 = document.getElementById("hp1");
const hp2 = document.getElementById("hp2");

const timerElement = document.getElementById("timer");
const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const gameMessage = document.getElementById("gameMessage");

const fireCD = document.getElementById("fireCD");
const dashCD = document.getElementById("dashCD");
const windCD = document.getElementById("windCD");

let socket = null;
let myPlayer = 0;
let roomCode = "";

let worldWidth = 1000;
let worldHeight = 560;

let players = {
  1: {
    x: 220,
    y: 430,
    vx: 0,
    vy: 0,
    hp: 100,
    facing: 1,
    action: "idle",
    block: false
  },

  2: {
    x: 780,
    y: 430,
    vx: 0,
    vy: 0,
    hp: 100,
    facing: -1,
    action: "idle",
    block: false
  }
};

let keys = {};

let cooldowns = {
  fire: 0,
  dash: 0,
  wind: 0
};

let effects = [];

let gameRunning = false;
let gameTime = 60;

let lastTime = performance.now();

function connect() {
  const protocol =
    location.protocol === "https:"
      ? "wss:"
      : "ws:";

  socket = new WebSocket(
    `${protocol}//${location.host}`
  );

  connection.textContent = "CONNECTING...";

  socket.onopen = () => {
    connection.textContent = "ONLINE";
  };

  socket.onclose = () => {
    connection.textContent = "OFFLINE";
    lobbyStatus.textContent =
      "Connection lost. Refresh the page.";
  };

  socket.onerror = () => {
    connection.textContent = "ERROR";
  };

  socket.onmessage = event => {
    const msg = JSON.parse(event.data);

    if (msg.type === "roomCreated") {
      myPlayer = msg.player;
      roomCode = msg.code;

      roomInfo.textContent = roomCode;

      lobbyStatus.textContent =
        "Waiting for Player 2...";

      roomCodeDisplay.textContent =
        `ROOM ${roomCode}`;
    }

    if (msg.type === "joined") {
      myPlayer = msg.player;
      roomCode = msg.code;

      roomInfo.textContent = roomCode;

      lobbyStatus.textContent =
        "Joined room.";

      roomCodeDisplay.textContent =
        `ROOM ${roomCode}`;
    }

    if (msg.type === "error") {
      lobbyStatus.textContent = msg.message;
    }

    if (msg.type === "gameStart") {
      for (const p of msg.players) {
        players[p.id] = {
          ...players[p.id],
          ...p
        };
      }

      startGame();
    }

    if (msg.type === "playerState") {
      const p = msg.player;

      if (p.id !== myPlayer) {
        players[p.id] = {
          ...players[p.id],
          ...p
        };
      }
    }

    if (msg.type === "damage") {
      players[msg.target].hp = msg.hp;

      effects.push({
        type: "hit",
        x: players[msg.target].x,
        y: players[msg.target].y - 60,
        text: `-${msg.damage}`,
        life: .7
      });
    }

    if (msg.type === "abilityHit") {
      players[msg.target].hp = msg.hp;

      effects.push({
        type: msg.ability,
        x: players[msg.target].x,
        y: players[msg.target].y - 30,
        life: 1
      });
    }

    if (msg.type === "abilityMiss") {
      effects.push({
        type: msg.ability,
        x: players[msg.attacker].x,
        y: players[msg.attacker].y - 30,
        life: .6
      });
    }

    if (msg.type === "gameOver") {
      endGame(msg.winner);
    }

    if (msg.type === "playerLeft") {
      endGame(myPlayer);
      gameMessage.textContent =
        "OPPONENT LEFT";
    }
  };
}

function startGame() {
  lobby.hidden = true;
  game.hidden = false;

  gameRunning = true;
  gameTime = 60;

  resizeCanvas();
}

function send(data) {
  if (
    socket &&
    socket.readyState === WebSocket.OPEN
  ) {
    socket.send(JSON.stringify(data));
  }
}

function createRoom() {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    lobbyStatus.textContent =
      "Connecting to server...";
    return;
  }

  send({
    type: "create"
  });
}

function joinRoom() {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    lobbyStatus.textContent =
      "Connecting to server...";
    return;
  }

  const code =
    roomInput.value.trim().toUpperCase();

  if (code.length !== 6) {
    lobbyStatus.textContent =
      "Enter a 6-character room code.";
    return;
  }

  send({
    type: "join",
    code
  });
}

createButton.addEventListener(
  "click",
  createRoom
);

showJoin.addEventListener(
  "click",
  () => {
    joinPanel.hidden = false;
    roomInput.focus();
  }
);

joinButton.addEventListener(
  "click",
  joinRoom
);

roomInput.addEventListener(
  "keydown",
  e => {
    if (e.key === "Enter") {
      joinRoom();
    }
  }
);

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();

  canvas.width =
    Math.max(1, Math.floor(rect.width * devicePixelRatio));

  canvas.height =
    Math.max(1, Math.floor(rect.height * devicePixelRatio));

  ctx.setTransform(
    devicePixelRatio,
    0,
    0,
    devicePixelRatio,
    0,
    0
  );
}

window.addEventListener(
  "resize",
  resizeCanvas
);

window.addEventListener(
  "keydown",
  e => {
    keys[e.code] = true;

    if (
      ["ArrowLeft", "ArrowRight", "ArrowUp", "Space"]
        .includes(e.code)
    ) {
      e.preventDefault();
    }

    handleKeyboardAbility(e.code);
  }
);

window.addEventListener(
  "keyup",
  e => {
    keys[e.code] = false;
  }
);

function isPlayer1() {
  return myPlayer === 1;
}

function controls() {
  if (isPlayer1()) {
    return {
      left: "KeyA",
      right: "KeyD",
      jump: "KeyW",
      attack: "KeyF",
      block: "KeyG",
      fire: "Digit1",
      dash: "Digit2",
      wind: "Digit3"
    };
  }

  return {
    left: "ArrowLeft",
    right: "ArrowRight",
    jump: "ArrowUp",
    attack: "KeyL",
    block: "KeyK",
    fire: "Digit8",
    dash: "Digit9",
    wind: "Digit0"
  };
}

function handleKeyboardAbility(code) {
  const c = controls();

  if (code === c.attack) {
    attack();
  }

  if (code === c.fire) {
    useAbility("fire");
  }

  if (code === c.dash) {
    useAbility("dash");
  }

  if (code === c.wind) {
    useAbility("wind");
  }
}

function attack() {
  if (!gameRunning) return;

  const p = players[myPlayer];

  p.action = "attack";

  send({
    type: "attack"
  });

  setTimeout(() => {
    if (p) p.action = "idle";
  }, 220);
}

function useAbility(name) {
  if (!gameRunning) return;

  if (cooldowns[name] > 0) return;

  cooldowns[name] =
    name === "fire"
      ? 4
      : name === "dash"
      ? 6
      : 5;

  const p = players[myPlayer];

  p.action = name;

  if (name === "dash") {
    p.x += p.facing * 140;

    p.x = Math.max(
      80,
      Math.min(worldWidth - 80, p.x)
    );
  }

  send({
    type: "ability",
    ability: name
  });

  setTimeout(() => {
    if (p) p.action = "idle";
  }, 500);
}

function update(dt) {
  if (!gameRunning) return;

  const p = players[myPlayer];

  const c = controls();

  if (keys[c.left]) {
    p.vx = -260;
    p.facing = -1;
  } else if (keys[c.right]) {
    p.vx = 260;
    p.facing = 1;
  } else {
    p.vx *= .78;
  }

  if (
    keys[c.jump] &&
    p.y >= 429
  ) {
    p.vy = -470;
  }

  p.vy += 1100 * dt;

  p.x += p.vx * dt;
  p.y += p.vy * dt;

  if (p.y > 430) {
    p.y = 430;
    p.vy = 0;
  }

  p.x = Math.max(
    60,
    Math.min(worldWidth - 60, p.x)
  );

  p.block = !!keys[c.block];

  if (p.block) {
    p.vx *= .7;
  }

  send({
    type: "input",
    x: p.x,
    y: p.y,
    vx: p.vx,
    vy: p.vy,
    facing: p.facing,
    action: p.action,
    block: p.block
  });

  for (const key in cooldowns) {
    cooldowns[key] =
      Math.max(0, cooldowns[key] - dt);
  }

  gameTime -= dt;

  if (gameTime <= 0) {
    gameTime = 0;

    const winner =
      players[1].hp >= players[2].hp
        ? 1
        : 2;

    endGame(winner);
  }

  timerElement.textContent =
    Math.ceil(gameTime);

  updateCooldownUI();

  for (const effect of effects) {
    effect.life -= dt;
    effect.y -= 20 * dt;
  }

  effects =
    effects.filter(e => e.life > 0);
}

function updateCooldownUI() {
  fireCD.textContent =
    cooldowns.fire > 0
      ? `🔥 ${cooldowns.fire.toFixed(1)}`
      : "🔥 READY";

  dashCD.textContent =
    cooldowns.dash > 0
      ? `⚡ ${cooldowns.dash.toFixed(1)}`
      : "⚡ READY";

  windCD.textContent =
    cooldowns.wind > 0
      ? `🌪 ${cooldowns.wind.toFixed(1)}`
      : "🌪 READY";
}

function worldToScreenX(x) {
  return x / worldWidth *
    canvas.clientWidth;
}

function worldToScreenY(y) {
  return y / worldHeight *
    canvas.clientHeight;
}

function drawBackground() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  const gradient =
    ctx.createLinearGradient(0, 0, 0, h);

  gradient.addColorStop(0, "#131b2c");
  gradient.addColorStop(1, "#06080d");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle =
    "rgba(255,255,255,.04)";

  for (let x = 0; x < w; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  const ground =
    worldToScreenY(455);

  ctx.fillStyle = "#111722";
  ctx.fillRect(
    0,
    ground,
    w,
    h - ground
  );

  ctx.strokeStyle =
    "rgba(255,255,255,.12)";

  ctx.beginPath();
  ctx.moveTo(0, ground);
  ctx.lineTo(w, ground);
  ctx.stroke();
}

function drawStickman(p, id) {
  const x = worldToScreenX(p.x);
  const y = worldToScreenY(p.y);

  const scale =
    Math.min(canvas.clientWidth / 1000, 1.5);

  ctx.save();

  ctx.translate(x, y);

  ctx.scale(scale, scale);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const bodyColor =
    id === 1
      ? "#ffffff"
      : "#d7dbe5";

  ctx.strokeStyle = bodyColor;
  ctx.lineWidth = 7;

  // shadow

  ctx.save();

  ctx.scale(1, .25);

  ctx.fillStyle =
    "rgba(0,0,0,.5)";

  ctx.beginPath();

  ctx.ellipse(
    0,
    22,
    45,
    15,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.restore();

  // fire aura

  if (p.action === "fire") {
    drawFireAura();
  }

  // wind

  if (p.action === "wind") {
    drawWindAura();
  }

  // dash

  if (p.action === "dash") {
    drawDashAura(p.facing);
  }

  // head

  ctx.beginPath();

  ctx.arc(
    0,
    -78,
    23,
    0,
    Math.PI * 2
  );

  ctx.stroke();

  // body

  ctx.beginPath();

  ctx.moveTo(0, -55);
  ctx.lineTo(0, 20);

  ctx.stroke();

  // legs

  ctx.beginPath();

  ctx.moveTo(0, 20);
  ctx.lineTo(-28, 70);

  ctx.moveTo(0, 20);
  ctx.lineTo(28, 70);

  ctx.stroke();

  // arms

  let armAngle = 25;

  if (p.action === "attack") {
    armAngle = p.facing * -10;
  }

  ctx.beginPath();

  ctx.moveTo(0, -42);
  ctx.lineTo(
    -38,
    -5
  );

  ctx.moveTo(0, -42);
  ctx.lineTo(
    p.action === "attack"
      ? 70 * p.facing
      : 38,
    p.action === "attack"
      ? -30
      : -5
  );

  ctx.stroke();

  // block shield

  if (p.block) {
    ctx.strokeStyle =
      "rgba(120,190,255,.9)";

    ctx.lineWidth = 5;

    ctx.beginPath();

    ctx.arc(
      0,
      -35,
      65,
      -1.2,
      1.2
    );

    ctx.stroke();
  }

  ctx.restore();
}

function drawFireAura() {
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle =
      `rgba(255,${80 + Math.random()*100},20,.7)`;

    ctx.beginPath();

    ctx.arc(
      35 + Math.random() * 30,
      -30 + Math.random() * 40,
      5 + Math.random() * 9,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }
}

function drawWindAura() {
  ctx.strokeStyle =
    "rgba(130,220,255,.8)";

  ctx.lineWidth = 5;

  for (let i = 0; i < 4; i++) {
    ctx.beginPath();

    ctx.arc(
      0,
      -35,
      45 + i * 13,
      -1,
      1
    );

    ctx.stroke();
  }
}

function drawDashAura(direction) {
  ctx.strokeStyle =
    "rgba(130,190,255,.7)";

  ctx.lineWidth = 6;

  for (let i = 0; i < 5; i++) {
    ctx.beginPath();

    ctx.moveTo(
      -direction * (30 + i * 20),
      -20
    );

    ctx.lineTo(
      -direction * (80 + i * 30),
      -20
    );

    ctx.stroke();
  }
}

function drawEffects() {
  for (const e of effects) {
    const x = worldToScreenX(e.x);
    const y = worldToScreenY(e.y);

    ctx.save();

    ctx.globalAlpha =
      Math.max(0, e.life);

    if (e.type === "hit") {
      ctx.fillStyle = "white";
      ctx.font = "bold 28px Arial";
      ctx.textAlign = "center";
      ctx.fillText(
        e.text,
        x,
        y
      );
    }

    if (e.type === "fire") {
      ctx.font = "50px Arial";
      ctx.textAlign = "center";
      ctx.fillText("🔥", x, y);
    }

    if (e.type === "dash") {
      ctx.font = "50px Arial";
      ctx.textAlign = "center";
      ctx.fillText("⚡", x, y);
    }

    if (e.type === "wind") {
      ctx.font = "50px Arial";
      ctx.textAlign = "center";
      ctx.fillText("🌪️", x, y);
    }

    ctx.restore();
  }
}

function draw() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  ctx.clearRect(0, 0, w, h);

  drawBackground();

  drawStickman(
    players[1],
    1
  );

  drawStickman(
    players[2],
    2
  );

  drawEffects();

  hp1.style.width =
    `${players[1].hp}%`;

  hp2.style.width =
    `${players[2].hp}%`;
}

function loop(now) {
  const dt =
    Math.min(.033, (now - lastTime) / 1000);

  lastTime = now;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

function endGame(winner) {
  if (!gameRunning) return;

  gameRunning = false;

  gameMessage.hidden = false;

  gameMessage.textContent =
    winner === myPlayer
      ? "🏆 YOU WIN!"
      : "💀 YOU LOSE";

  setTimeout(() => {
    gameMessage.hidden = true;
  }, 5000);
}

/*
 MOBILE CONTROLS
*/

document
  .querySelectorAll("[data-key]")
  .forEach(button => {

    const key =
      button.dataset.key;

    const down = e => {
      e.preventDefault();

      if (key === "left") {
        keys[controls().left] = true;
      }

      if (key === "right") {
        keys[controls().right] = true;
      }

      if (key === "jump") {
        keys[controls().jump] = true;
      }
    };

    const up = e => {
      e.preventDefault();

      if (key === "left") {
        keys[controls().left] = false;
      }

      if (key === "right") {
        keys[controls().right] = false;
      }

      if (key === "jump") {
        keys[controls().jump] = false;
      }
    };

    button.addEventListener(
      "touchstart",
      down,
      { passive: false }
    );

    button.addEventListener(
      "touchend",
      up,
      { passive: false }
    );

    button.addEventListener(
      "mousedown",
      down
    );

    button.addEventListener(
      "mouseup",
      up
    );
  });

document
  .querySelectorAll("[data-action]")
  .forEach(button => {

    button.addEventListener(
      "touchstart",
      e => {
        e.preventDefault();

        const action =
          button.dataset.action;

        if (action === "attack") {
          attack();
        }

        if (action === "block") {
          keys[controls().block] = true;
        }
      },
      { passive: false }
    );

    button.addEventListener(
      "touchend",
      e => {
        e.preventDefault();

        if (
          button.dataset.action === "block"
        ) {
          keys[controls().block] = false;
        }
      },
      { passive: false }
    );

    button.addEventListener(
      "mousedown",
      () => {
        const action =
          button.dataset.action;

        if (action === "attack") {
          attack();
        }

        if (action === "block") {
          keys[controls().block] = true;
        }
      }
    );

    button.addEventListener(
      "mouseup",
      () => {
        if (
          button.dataset.action === "block"
        ) {
          keys[controls().block] = false;
        }
      }
    );
  });

document
  .querySelectorAll("[data-ability]")
  .forEach(button => {

    const handler = e => {
      e.preventDefault();

      useAbility(
        button.dataset.ability
      );
    };

    button.addEventListener(
      "touchstart",
      handler,
      { passive: false }
    );

    button.addEventListener(
      "mousedown",
      handler
    );
  });

connect();
