const canvas =
  document.getElementById("arena");

const ctx =
  canvas.getContext("2d");

const lobby =
  document.getElementById("lobby");

const game =
  document.getElementById("game");

const connectionStatus =
  document.getElementById(
    "connectionStatus"
  );

const createRoomButton =
  document.getElementById(
    "createRoom"
  );

const showJoinButton =
  document.getElementById(
    "showJoin"
  );

const joinPanel =
  document.getElementById(
    "joinPanel"
  );

const joinRoomButton =
  document.getElementById(
    "joinRoom"
  );

const roomInput =
  document.getElementById(
    "roomInput"
  );

const roomInfo =
  document.getElementById(
    "roomInfo"
  );

const lobbyStatus =
  document.getElementById(
    "lobbyStatus"
  );

const roomCodeDisplay =
  document.getElementById(
    "roomCodeDisplay"
  );

const hp1 =
  document.getElementById("hp1");

const hp2 =
  document.getElementById("hp2");

const timer =
  document.getElementById("timer");

const fireCD =
  document.getElementById(
    "fireCD"
  );

const dashCD =
  document.getElementById(
    "dashCD"
  );

const windCD =
  document.getElementById(
    "windCD"
  );

const gameOverlay =
  document.getElementById(
    "gameOverlay"
  );

const winnerText =
  document.getElementById(
    "winnerText"
  );

const roundText =
  document.getElementById(
    "roundText"
  );

const rematchButton =
  document.getElementById(
    "rematchButton"
  );

const backButton =
  document.getElementById(
    "backButton"
  );

const controlText =
  document.getElementById(
    "controlText"
  );


/* WORLD */

const WORLD_WIDTH = 1200;
const WORLD_HEIGHT = 600;

const GROUND = 500;


/* NETWORK */

let socket = null;

let myPlayer = 0;

let roomCode = "";

let connected = false;


/* GAME */

let running = false;

let currentTime = 90;

let players = {
  1: makePlayer(1),
  2: makePlayer(2)
};

let projectiles = [];

let effects = [];

let localEffects = [];

let lastServerUpdate = performance.now();

let lastInputSent = 0;


/* INPUT */

const keys = {};

const input = {
  left: false,
  right: false,
  jump: false,
  block: false
};


/* COOLDOWNS */

const cooldowns = {
  fire: 0,
  dash: 0,
  wind: 0
};


/* ANIMATION */

let animationTime = 0;


/* PLAYER TEMPLATE */

function makePlayer(id) {
  return {
    id,

    connected: false,

    x:
      id === 1
        ? 250
        : 950,

    y: GROUND,

    vx: 0,
    vy: 0,

    facing:
      id === 1
        ? 1
        : -1,

    hp: 100,
    maxHp: 100,

    grounded: true,

    state: "idle",

    block: false,

    attackTimer: 0,

    hitStun: 0,

    dashTimer: 0,

    invulnerable: 0,

    cooldowns: {
      fire: 0,
      dash: 0,
      wind: 0
    }
  };
}


/* CONNECT */

function connect() {
  const protocol =
    location.protocol === "https:"
      ? "wss:"
      : "ws:";

  const address =
    `${protocol}//${location.host}`;

  socket =
    new WebSocket(address);

  socket.onopen = () => {
    connected = true;

    connectionStatus.textContent =
      "ONLINE";
  };

  socket.onclose = () => {
    connected = false;

    connectionStatus.textContent =
      "OFFLINE";

    lobbyStatus.textContent =
      "Connection lost. Refresh the page.";
  };

  socket.onerror = () => {
    connectionStatus.textContent =
      "ERROR";
  };

  socket.onmessage = event => {
    try {
      handleMessage(
        JSON.parse(event.data)
      );
    } catch {
      console.error(
        "Invalid server message"
      );
    }
  };
}

function send(message) {
  if (
    socket &&
    socket.readyState ===
      WebSocket.OPEN
  ) {
    socket.send(
      JSON.stringify(message)
    );
  }
}


/* SERVER MESSAGES */

function handleMessage(message) {

  if (
    message.type ===
    "connected"
  ) {
    return;
  }


  if (
    message.type ===
    "roomCreated"
  ) {
    myPlayer =
      message.player;

    roomCode =
      message.code;

    roomInfo.textContent =
      roomCode;

    roomCodeDisplay.textContent =
      `ROOM ${roomCode}`;

    lobbyStatus.textContent =
      "Waiting for Player 2...";
  }


  if (
    message.type ===
    "joined"
  ) {
    myPlayer =
      message.player;

    roomCode =
      message.code;

    roomInfo.textContent =
      roomCode;

    roomCodeDisplay.textContent =
      `ROOM ${roomCode}`;

    lobbyStatus.textContent =
      "Joined room. Waiting for game...";
  }


  if (
    message.type ===
    "roomState"
  ) {
    if (
      message.started
    ) {
      startGame();
    } else if (
      !message.finished
    ) {
      lobbyStatus.textContent =
        message.players.length === 1
          ? "Waiting for Player 2..."
          : "Ready!";
    }
  }


  if (
    message.type ===
    "state"
  ) {
    applyState(message);
  }


  if (
    message.type ===
    "roundOver"
  ) {
    showRoundOver(
      message.winner
    );
  }


  if (
    message.type ===
    "playerLeft"
  ) {
    running = false;

    gameOverlay.hidden =
      false;

    winnerText.textContent =
      "OPPONENT LEFT";

    roundText.textContent =
      "The other player disconnected.";
  }


  if (
    message.type ===
    "rematchWaiting"
  ) {
    roundText.textContent =
      `Player ${message.player} is ready.`;
  }


  if (
    message.type ===
    "error"
  ) {
    lobbyStatus.textContent =
      message.message;
  }
}


/* APPLY STATE */

function applyState(state) {

  currentTime =
    state.time;

  timer.textContent =
    Math.ceil(
      currentTime
    );

  for (
    const serverPlayer
    of state.players
  ) {
    if (
      !serverPlayer
    ) continue;

    players[
      serverPlayer.id
    ] = {
      ...players[
        serverPlayer.id
      ],
      ...serverPlayer
    };
  }

  projectiles =
    state.projectiles || [];

  const serverEffects =
    state.effects || [];

  for (
    const effect
    of serverEffects
  ) {
    createEffect(
      effect
    );
  }

  updateHud();

  if (
    state.started &&
    !running
  ) {
    startGame();
  }
}


/* START */

function startGame() {

  lobby.hidden = true;

  game.hidden = false;

  gameOverlay.hidden =
    true;

  running = true;

  resizeCanvas();

  updateControlText();
}


/* HUD */

function updateHud() {

  hp1.style.width =
    `${Math.max(
      0,
      players[1].hp
    )}%`;

  hp2.style.width =
    `${Math.max(
      0,
      players[2].hp
    )}%`;

  cooldowns.fire =
    players[
      myPlayer
    ]?.cooldowns?.fire || 0;

  cooldowns.dash =
    players[
      myPlayer
    ]?.cooldowns?.dash || 0;

  cooldowns.wind =
    players[
      myPlayer
    ]?.cooldowns?.wind || 0;

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


/* CONTROLS */

function getControls() {

  if (myPlayer === 1) {
    return {
      left: "KeyA",
      right: "KeyD",
      jump: "KeyW",

      attack: "KeyF",
      kick: "KeyR",
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
    kick: "KeyO",
    block: "KeyK",

    fire: "Digit8",
    dash: "Digit9",
    wind: "Digit0"
  };
}

function updateControlText() {

  if (myPlayer === 1) {
    controlText.textContent =
      "P1: A/D move • W jump • F punch • R kick • G block • 1/2/3 powers";
  } else {
    controlText.textContent =
      "P2: ←/→ move • ↑ jump • L punch • O kick • K block • 8/9/0 powers";
  }
}


/* KEYBOARD */

window.addEventListener(
  "keydown",
  event => {

    if (
      !running ||
      !myPlayer
    ) {
      return;
    }

    const c =
      getControls();

    keys[event.code] = true;

    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "Space"
      ].includes(
        event.code
      )
    ) {
      event.preventDefault();
    }

    if (
      event.repeat
    ) {
      return;
    }

    if (
      event.code ===
      c.attack
    ) {
      sendAction(
        "attack"
      );
    }

    if (
      event.code ===
      c.kick
    ) {
      sendAction(
        "kick"
      );
    }

    if (
      event.code ===
      c.fire
    ) {
      useAbility(
        "fire"
      );
    }

    if (
      event.code ===
      c.dash
    ) {
      useAbility(
        "dash"
      );
    }

    if (
      event.code ===
      c.wind
    ) {
      useAbility(
        "wind"
      );
    }
  }
);

window.addEventListener(
  "keyup",
  event => {
    keys[event.code] =
      false;
  }
);


/* ACTION */

function sendAction(action) {

  if (!running) return;

  send({
    type: "action",
    action
  });

  const p =
    players[myPlayer];

  if (p) {
    p.state =
      action;
  }
}


/* ABILITIES */

function useAbility(name) {

  if (!running) return;

  if (
    cooldowns[name] > 0
  ) {
    return;
  }

  sendAction(name);

  createEffect({
    type: name,
    x:
      players[myPlayer].x +
      players[myPlayer].facing * 60,
    y:
      players[myPlayer].y - 70
  });
}


/* INPUT SYNC */

function updateInput() {

  if (!running) return;

  const c =
    getControls();

  input.left =
    !!keys[c.left];

  input.right =
    !!keys[c.right];

  input.jump =
    !!keys[c.jump];

  input.block =
    !!keys[c.block];

  const now =
    performance.now();

  if (
    now - lastInputSent <
    35
  ) {
    return;
  }

  lastInputSent =
    now;

  send({
    type: "input",
    input
  });
}


/* MOBILE CONTROLS */

function setupMobileControls() {

  document
    .querySelectorAll(
      "[data-control]"
    )
    .forEach(button => {

      const control =
        button.dataset.control;

      const press =
        event => {
          event.preventDefault();

          if (
            control ===
            "left"
          ) {
            input.left =
              true;
          }

          if (
            control ===
            "right"
          ) {
            input.right =
              true;
          }

          if (
            control ===
            "jump"
          ) {
            input.jump =
              true;
          }

          if (
            control ===
            "block"
          ) {
            input.block =
              true;
          }

          send({
            type: "input",
            input
          });
        };

      const release =
        event => {
          event.preventDefault();

          if (
            control ===
            "left"
          ) {
            input.left =
              false;
          }

          if (
            control ===
            "right"
          ) {
            input.right =
              false;
          }

          if (
            control ===
            "jump"
          ) {
            input.jump =
              false;
          }

          if (
            control ===
            "block"
          ) {
            input.block =
              false;
          }

          send({
            type: "input",
            input
          });
        };

      button.addEventListener(
        "pointerdown",
        press
      );

      button.addEventListener(
        "pointerup",
        release
      );

      button.addEventListener(
        "pointercancel",
        release
      );

      button.addEventListener(
        "pointerleave",
        release
      );
    });


  document
    .querySelectorAll(
      "[data-action]"
    )
    .forEach(button => {

      button.addEventListener(
        "pointerdown",
        event => {
          event.preventDefault();

          sendAction(
            button.dataset.action
          );
        }
      );
    });


  document
    .querySelectorAll(
      "[data-ability]"
    )
    .forEach(button => {

      button.addEventListener(
        "pointerdown",
        event => {
          event.preventDefault();

          useAbility(
            button.dataset.ability
          );
        }
      );
    });
}

setupMobileControls();


/* EFFECTS */

function createEffect(effect) {

  effects.push({
    ...effect,

    life:
      effect.life ||
      .7,

    maxLife:
      effect.life ||
      .7,

    particles:
      []
  });

  if (
    effect.type ===
    "hit"
  ) {

    for (let i = 0; i < 8; i++) {

      effects[
        effects.length - 1
      ].particles.push({
        x: effect.x,
        y: effect.y,

        vx:
          (Math.random() - .5) *
          260,

        vy:
          (Math.random() - .7) *
          300
      });
    }
  }
}


/* CANVAS */

function resizeCanvas() {

  const rect =
    canvas.getBoundingClientRect();

  const dpr =
    Math.min(
      2,
      window.devicePixelRatio || 1
    );

  canvas.width =
    Math.max(
      1,
      Math.floor(
        rect.width * dpr
      )
    );

  canvas.height =
    Math.max(
      1,
      Math.floor(
        rect.height * dpr
      )
    );
}

window.addEventListener(
  "resize",
  resizeCanvas
);


/* SCREEN TRANSFORM */

function beginWorld() {

  const width =
    canvas.clientWidth;

  const height =
    canvas.clientHeight;

  const scale =
    Math.min(
      width / WORLD_WIDTH,
      height / WORLD_HEIGHT
    );

  const offsetX =
    (width -
      WORLD_WIDTH * scale) /
    2;

  const offsetY =
    (height -
      WORLD_HEIGHT * scale) /
    2;

  const dpr =
    Math.min(
      2,
      window.devicePixelRatio || 1
    );

  ctx.setTransform(
    dpr * scale,
    0,
    0,
    dpr * scale,
    offsetX * dpr,
    offsetY * dpr
  );
}


/* DRAW BACKGROUND */

function drawArena() {

  const gradient =
    ctx.createLinearGradient(
      0,
      0,
      0,
      WORLD_HEIGHT
    );

  gradient.addColorStop(
    0,
    "#10192b"
  );

  gradient.addColorStop(
    1,
    "#05070c"
  );

  ctx.fillStyle =
    gradient;

  ctx.fillRect(
    0,
    0,
    WORLD_WIDTH,
    WORLD_HEIGHT
  );


  /* moon */

  ctx.fillStyle =
    "rgba(255,255,255,.08)";

  ctx.beginPath();

  ctx.arc(
    950,
    125,
    75,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* stars */

  for (
    let i = 0;
    i < 50;
    i++
  ) {

    const x =
      (i * 237) %
      WORLD_WIDTH;

    const y =
      40 +
      ((i * 97) %
        220);

    ctx.fillStyle =
      "rgba(255,255,255,.25)";

    ctx.fillRect(
      x,
      y,
      2,
      2
    );
  }


  /* arena floor */

  ctx.fillStyle =
    "#0d131f";

  ctx.fillRect(
    0,
    455,
    WORLD_WIDTH,
    145
  );


  ctx.strokeStyle =
    "rgba(130,170,255,.22)";

  ctx.lineWidth =
    3;

  ctx.beginPath();

  ctx.moveTo(
    0,
    455
  );

  ctx.lineTo(
    WORLD_WIDTH,
    455
  );

  ctx.stroke();


  /* floor grid */

  ctx.strokeStyle =
    "rgba(255,255,255,.035)";

  ctx.lineWidth =
    1;

  for (
    let x = 0;
    x <= WORLD_WIDTH;
    x += 50
  ) {

    ctx.beginPath();

    ctx.moveTo(
      x,
      455
    );

    ctx.lineTo(
      x,
      WORLD_HEIGHT
    );

    ctx.stroke();
  }

  for (
    let y = 455;
    y <= WORLD_HEIGHT;
    y += 35
  ) {

    ctx.beginPath();

    ctx.moveTo(
      0,
      y
    );

    ctx.lineTo(
      WORLD_WIDTH,
      y
    );

    ctx.stroke();
  }
}


/* PROJECTILES */

function drawProjectiles() {

  for (
    const projectile
    of projectiles
  ) {

    ctx.save();

    ctx.translate(
      projectile.x,
      projectile.y
    );

    const direction =
      projectile.vx >= 0
        ? 1
        : -1;

    ctx.scale(
      direction,
      1
    );


    /* wind slash */

    ctx.strokeStyle =
      "rgba(130,225,255,.9)";

    ctx.lineWidth =
      8;

    ctx.beginPath();

    ctx.arc(
      0,
      0,
      42,
      -.9,
      .9
    );

    ctx.stroke();

    ctx.strokeStyle =
      "rgba(255,255,255,.7)";

    ctx.lineWidth =
      3;

    ctx.beginPath();

    ctx.arc(
      0,
      0,
      28,
      -.8,
      .8
    );

    ctx.stroke();

    ctx.restore();
  }
}


/* STICKMAN */

function drawPlayer(
  player,
  id
) {

  if (
    !player.connected
  ) {
    return;
  }

  ctx.save();

  ctx.translate(
    player.x,
    player.y
  );

  ctx.scale(
    player.facing,
    1
  );


  const bob =
    player.grounded
      ? Math.sin(
          animationTime * 8 +
          id
        ) * 1.5
      : 0;

  ctx.translate(
    0,
    bob
  );


  /* shadow */

  ctx.save();

  ctx.scale(
    1,
    .25
  );

  ctx.fillStyle =
    "rgba(0,0,0,.55)";

  ctx.beginPath();

  ctx.ellipse(
    0,
    15,
    45,
    15,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.restore();


  /* ability aura */

  if (
    player.state ===
    "fire"
  ) {
    drawFireAura();
  }

  if (
    player.state ===
    "dash"
  ) {
    drawDashAura();
  }

  if (
    player.state ===
    "wind"
  ) {
    drawWindAura();
  }


  ctx.lineCap =
    "round";

  ctx.lineJoin =
    "round";

  ctx.strokeStyle =
    id === 1
      ? "#ffffff"
      : "#d8e0ff";

  ctx.lineWidth =
    8;


  /* head */

  ctx.beginPath();

  ctx.arc(
    0,
    -110,
    25,
    0,
    Math.PI * 2
  );

  ctx.stroke();


  /* body */

  ctx.beginPath();

  ctx.moveTo(
    0,
    -84
  );

  ctx.lineTo(
    0,
    -20
  );

  ctx.stroke();


  /* legs */

  ctx.beginPath();

  ctx.moveTo(
    0,
    -20
  );

  ctx.lineTo(
    -30,
    0
  );

  ctx.lineTo(
    -42,
    43
  );

  ctx.moveTo(
    0,
    -20
  );

  ctx.lineTo(
    30,
    0
  );

  ctx.lineTo(
    42,
    43
  );

  ctx.stroke();


  /* arms */

  ctx.beginPath();

  ctx.moveTo(
    0,
    -72
  );

  if (
    player.state ===
    "attack"
  ) {

    ctx.lineTo(
      82,
      -85
    );

  } else if (
    player.state ===
    "kick"
  ) {

    ctx.lineTo(
      38,
      -35
    );

  } else {

    ctx.lineTo(
      43,
      -38
    );
  }

  ctx.moveTo(
    0,
    -72
  );

  if (
    player.block
  ) {

    ctx.lineTo(
      45,
      -100
    );

  } else {

    ctx.lineTo(
      -43,
      -38
    );
  }

  ctx.stroke();


  /* block shield */

  if (
    player.block
  ) {

    ctx.strokeStyle =
      "rgba(100,190,255,.95)";

    ctx.lineWidth =
      5;

    ctx.beginPath();

    ctx.arc(
      15,
      -75,
      62,
      -.9,
      .9
    );

    ctx.stroke();
  }


  /* invulnerability */

  if (
    player.invulnerable > 0
  ) {

    ctx.strokeStyle =
      "rgba(255,255,255,.8)";

    ctx.lineWidth =
      3;

    ctx.beginPath();

    ctx.arc(
      0,
      -55,
      82,
      0,
      Math.PI * 2
    );

    ctx.stroke();
  }


  ctx.restore();


  /* name */

  ctx.save();

  ctx.textAlign =
    "center";

  ctx.font =
    "bold 13px Arial";

  ctx.fillStyle =
    "rgba(255,255,255,.7)";

  ctx.fillText(
    `P${id}`,
    player.x,
    player.y - 155
  );

  ctx.restore();
}


/* FIRE AURA */

function drawFireAura() {

  for (
    let i = 0;
    i < 12;
    i++
  ) {

    const angle =
      Math.random() *
      Math.PI * 2;

    const radius =
      35 +
      Math.random() * 40;

    ctx.fillStyle =
      `rgba(255,${80 + Math.random() * 100},20,.65)`;

    ctx.beginPath();

    ctx.arc(
      Math.cos(angle) *
        radius,
      -65 +
        Math.sin(angle) *
          radius,
      4 +
        Math.random() * 7,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }
}


/* DASH AURA */

function drawDashAura() {

  ctx.strokeStyle =
    "rgba(100,190,255,.8)";

  ctx.lineWidth =
    5;

  for (
    let i = 0;
    i < 5;
    i++
  ) {

    ctx.beginPath();

    ctx.moveTo(
      -20 -
        i * 20,
      -55
    );

    ctx.lineTo(
      -80 -
        i * 25,
      -55
    );

    ctx.stroke();
  }
}


/* WIND AURA */

function drawWindAura() {

  ctx.strokeStyle =
    "rgba(130,220,255,.8)";

  ctx.lineWidth =
    4;

  for (
    let i = 0;
    i < 4;
    i++
  ) {

    ctx.beginPath();

    ctx.arc(
      20,
      -70,
      35 + i * 15,
      -.8,
      .8
    );

    ctx.stroke();
  }
}


/* EFFECT DRAWING */

function drawEffects(
  dt
) {

  for (
    const effect
    of effects
  ) {

    effect.life -= dt;

    const alpha =
      Math.max(
        0,
        effect.life /
          effect.maxLife
      );

    ctx.save();

    ctx.globalAlpha =
      alpha;


    if (
      effect.type ===
      "hit"
    ) {

      ctx.fillStyle =
        "#ffffff";

      ctx.font =
        "bold 26px Arial";

      ctx.textAlign =
        "center";

      ctx.fillText(
        `-${effect.damage}`,
        effect.x,
        effect.y -
          (1 - alpha) * 30
      );


      for (
        const particle
        of effect.particles
      ) {

        particle.x +=
          particle.vx *
          dt;

        particle.y +=
          particle.vy *
          dt;

        particle.vy +=
          600 * dt;

        ctx.fillStyle =
          "white";

        ctx.fillRect(
          particle.x,
          particle.y,
          5,
          5
        );
      }

    }


    if (
      effect.type ===
      "fire"
    ) {

      ctx.font =
        "60px Arial";

      ctx.textAlign =
        "center";

      ctx.fillText(
        "🔥",
        effect.x,
        effect.y
      );
    }


    if (
      effect.type ===
      "dash"
    ) {

      ctx.font =
        "55px Arial";

      ctx.textAlign =
        "center";

      ctx.fillText(
        "⚡",
        effect.x,
        effect.y
      );
    }


    if (
      effect.type ===
      "wind"
    ) {

      ctx.font =
        "55px Arial";

      ctx.textAlign =
        "center";

      ctx.fillText(
        "🌪",
        effect.x,
        effect.y
      );
    }


    if (
      effect.type ===
      "windHit"
    ) {

      ctx.strokeStyle =
        "rgba(150,230,255,.9)";

      ctx.lineWidth =
        7;

      ctx.beginPath();

      ctx.arc(
        effect.x,
        effect.y,
        55 *
          (1 - alpha),
        0,
        Math.PI * 2
      );

      ctx.stroke();
    }

    ctx.restore();
  }

  effects =
    effects.filter(
      effect =>
        effect.life > 0
    );
}


/* EFFECT CREATION FROM SERVER */

function processEffects() {

  for (
    const effect
    of localEffects
  ) {
    createEffect(
      effect
    );
  }

  localEffects = [];
}


/* UPDATE */

function update(dt) {

  if (
    running
  ) {

    updateInput();

    animationTime +=
      dt;
  }

  processEffects();

  drawEffects(
    dt
  );
}


/* DRAW */

function draw() {

  const dpr =
    Math.min(
      2,
      window.devicePixelRatio || 1
    );

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

  ctx.clearRect(
    0,
    0,
    canvas.clientWidth,
    canvas.clientHeight
  );

  beginWorld();

  drawArena();

  drawProjectiles();

  drawPlayer(
    players[1],
    1
  );

  drawPlayer(
    players[2],
    2
  );
}


/* MAIN LOOP */

let previous =
  performance.now();

function loop(now) {

  const dt =
    Math.min(
      .033,
      (now - previous) /
        1000
    );

  previous =
    now;

  update(dt);

  draw();

  requestAnimationFrame(
    loop
  );
}

requestAnimationFrame(
  loop
);


/* ROUND OVER */

function showRoundOver(
  winner
) {

  running = false;

  gameOverlay.hidden =
    false;

  if (
    winner === 0
  ) {

    winnerText.textContent =
      "DRAW";

  } else if (
    winner === myPlayer
  ) {

    winnerText.textContent =
      "🏆 YOU WIN";

  } else {

    winnerText.textContent =
      "💀 YOU LOSE";
  }

  roundText.textContent =
    "Both players can press REMATCH.";
}


/* REMATCH */

rematchButton.addEventListener(
  "click",
  () => {

    send({
      type:
        "rematch"
    });

    rematchButton.disabled =
      true;

    roundText.textContent =
      "Waiting for the other player...";
  }
);


/* LEAVE */

backButton.addEventListener(
  "click",
  () => {

    location.reload();

  }
);


/* CREATE ROOM */

createRoomButton.addEventListener(
  "click",
  () => {

    if (!connected) {

      lobbyStatus.textContent =
        "Connecting to server...";

      return;
    }

    send({
      type:
        "create"
    });
  }
);


/* SHOW JOIN */

showJoinButton.addEventListener(
  "click",
  () => {

    joinPanel.hidden =
      false;

    roomInput.focus();
  }
);


/* JOIN */

joinRoomButton.addEventListener(
  "click",
  joinRoom
);

roomInput.addEventListener(
  "keydown",
  event => {

    if (
      event.key ===
      "Enter"
    ) {
      joinRoom();
    }
  }
);

function joinRoom() {

  const code =
    roomInput.value
      .trim()
      .toUpperCase();

  if (
    code.length !== 6
  ) {

    lobbyStatus.textContent =
      "Room codes contain 6 characters.";

    return;
  }

  send({
    type:
      "join",

    code
  });
}


/* INITIAL */

resizeCanvas();

connect();
