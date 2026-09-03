const canvas =
  document.getElementById(
    "gameCanvas"
  );

const ctx =
  canvas.getContext("2d");


/* =====================================================
   CONSTANTS
===================================================== */

const WORLD_W = 1200;
const WORLD_H = 600;

let socket = null;

let role = null;

let roomCode = "";

let state = null;

let selectedRounds = 5;

let lastFrame =
  performance.now();

let previousCanvasWidth = 0;
let previousCanvasHeight = 0;

const visuals = [];


/* =====================================================
   INPUT
===================================================== */

const input = {

  left: false,
  right: false,
  jump: false,
  block: false

};


/* =====================================================
   ELEMENTS
===================================================== */

const $ =
  (id) =>
    document.getElementById(id);


const createBtn =
  $("createBtn");

const cpuBtn =
  $("cpuBtn");

const showJoinBtn =
  $("showJoinBtn");

const joinBtn =
  $("joinBtn");

const joinBox =
  $("joinBox");

const roomInput =
  $("roomInput");

const roomInfo =
  $("roomInfo");

const roomCodeEl =
  $("roomCode");

const copyBtn =
  $("copyBtn");

const statusEl =
  $("status");

const connectionEl =
  $("connection");

const lobby =
  $("lobby");

const game =
  $("game");

const roundLabel =
  $("roundLabel");

const timerEl =
  $("timer");

const gameStatus =
  $("gameStatus");

const p1Score =
  $("p1Score");

const p2Score =
  $("p2Score");

const p1Hp =
  $("p1Hp");

const p2Hp =
  $("p2Hp");

const p1HpText =
  $("p1HpText");

const p2HpText =
  $("p2HpText");

const winOverlay =
  $("winOverlay");

const winnerText =
  $("winnerText");

const roundResult =
  $("roundResult");

const rematchBtn =
  $("rematchBtn");


/* =====================================================
   ROUND BUTTONS
===================================================== */

document
  .querySelectorAll(
    "[data-rounds]"
  )
  .forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {

          selectedRounds =
            Number(
              button.dataset.rounds
            ) === 10
              ? 10
              : 5;


          document
            .querySelectorAll(
              "[data-rounds]"
            )
            .forEach(
              (b) => {
                b.classList.remove(
                  "selected"
                );
              }
            );


          button.classList.add(
            "selected"
          );

        }
      );

    }
  );


/* =====================================================
   CONNECT
===================================================== */

const socketUrl =
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;


function connect() {

  socket =
    new WebSocket(
      socketUrl
    );


  socket.addEventListener(
    "open",
    () => {

      connectionEl.textContent =
        "● ONLINE";

      connectionEl.classList.add(
        "online"
      );

      statusEl.textContent =
        "Connected.";

    }
  );


  socket.addEventListener(
    "close",
    () => {

      connectionEl.textContent =
        "● OFFLINE";

      connectionEl.classList.remove(
        "online"
      );

      statusEl.textContent =
        "Connection lost. Refresh the page.";

      gameStatus.textContent =
        "OFFLINE";

    }
  );


  socket.addEventListener(
    "message",
    (event) => {

      let msg;

      try {

        msg =
          JSON.parse(
            event.data
          );

      } catch {

        return;

      }


      handleMessage(
        msg
      );

    }
  );

}


function send(
  data
) {

  if (
    !socket ||
    socket.readyState !==
      WebSocket.OPEN
  ) {
    return;
  }


  socket.send(
    JSON.stringify(
      data
    )
  );

}


/* =====================================================
   SERVER MESSAGE
===================================================== */

function handleMessage(
  msg
) {

  switch (
    msg.type
  ) {

    case "welcome":

      role =
        msg.role;

      roomCode =
        msg.code;

      roomCodeEl.textContent =
        roomCode;

      roomInfo.hidden =
        false;

      createBtn.disabled =
        true;

      cpuBtn.disabled =
        true;

      showJoinBtn.disabled =
        true;


      statusEl.textContent =
        msg.mode === "cpu"
          ? `VS COMPUTER · ${msg.rounds} ROUNDS`
          : `ROOM CREATED · ${msg.rounds} ROUNDS`;

      break;


    case "room":

      roomCode =
        msg.code ||
        roomCode;

      roomCodeEl.textContent =
        roomCode;


      if (
        msg.started
      ) {

        lobby.hidden =
          true;

        game.hidden =
          false;

      }


      if (
        msg.phase ===
        "lobby"
      ) {

        lobby.hidden =
          false;

        game.hidden =
          true;

        statusEl.textContent =
          msg.mode === "cpu"
            ? "Preparing CPU match..."
            : "Waiting for Player 2...";

      }

      break;


    case "state":

      state =
        msg;


      if (
        msg.started ||
        msg.phase ===
          "round_end" ||
        msg.phase ===
          "match_end"
      ) {

        lobby.hidden =
          true;

        game.hidden =
          false;

      }


      updateHUD();

      processEvents(
        msg.events || []
      );


      if (
        msg.phase ===
        "match_end"
      ) {

        showMatchWinner(
          msg.winner
        );

      }


      else if (
        msg.phase ===
        "round_end"
      ) {

        showRoundResult(
          msg.roundWinner
        );

      }


      else {

        winOverlay.hidden =
          true;

      }


      break;


    case "error":

      statusEl.textContent =
        msg.message ||
        "Error.";

      break;

  }

}


/* =====================================================
   LOBBY BUTTONS
===================================================== */

createBtn.addEventListener(
  "click",
  () => {

    send({
      type:
        "create",

      rounds:
        selectedRounds

    });

  }
);


cpuBtn.addEventListener(
  "click",
  () => {

    send({
      type:
        "cpu",

      rounds:
        selectedRounds

    });

  }
);


showJoinBtn.addEventListener(
  "click",
  () => {

    joinBox.hidden =
      !joinBox.hidden;


    if (
      !joinBox.hidden
    ) {

      roomInput.focus();

    }

  }
);


joinBtn.addEventListener(
  "click",
  () => {

    const code =
      roomInput.value
        .trim()
        .toUpperCase();


    if (!code) {

      statusEl.textContent =
        "Enter a room code.";

      return;

    }


    send({
      type:
        "join",

      code

    });

  }
);


roomInput.addEventListener(
  "keydown",
  (event) => {

    if (
      event.key ===
      "Enter"
    ) {

      joinBtn.click();

    }

  }
);


copyBtn.addEventListener(
  "click",
  async () => {

    if (!roomCode) {
      return;
    }


    try {

      await navigator.clipboard.writeText(
        roomCode
      );

      copyBtn.textContent =
        "COPIED!";


      setTimeout(
        () => {

          copyBtn.textContent =
            "COPY";

        },
        1000
      );

    } catch {

      statusEl.textContent =
        `ROOM CODE: ${roomCode}`;

    }

  }
);


/* =====================================================
   REMATCH
===================================================== */

rematchBtn.addEventListener(
  "click",
  () => {

    send({
      type:
        "rematch"
    });


    rematchBtn.disabled =
      true;


    winnerText.textContent =
      state?.mode === "cpu"
        ? "STARTING..."
        : "WAITING FOR OPPONENT...";

  }
);


/* =====================================================
   KEYBOARD
===================================================== */

const p1Map = {

  KeyA: "left",
  KeyD: "right",
  KeyW: "jump",
  KeyG: "block"

};


const p2Map = {

  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "jump",
  KeyK: "block"

};


function getKeyMap() {

  return role === "P2"
    ? p2Map
    : p1Map;

}


function keyboardAction(
  code
) {

  if (
    role === "P1"
  ) {

    if (
      code === "KeyF"
    ) return "attack";

    if (
      code === "KeyR"
    ) return "kick";

    if (
      code === "Digit1"
    ) return "fire";

    if (
      code === "Digit2"
    ) return "dash";

    if (
      code === "Digit3"
    ) return "wind";

  }


  if (
    role === "P2"
  ) {

    if (
      code === "KeyL"
    ) return "attack";

    if (
      code === "KeyO"
    ) return "kick";

    if (
      code === "Digit8"
    ) return "fire";

    if (
      code === "Digit9"
    ) return "dash";

    if (
      code === "Digit0"
    ) return "wind";

  }


  return null;

}


window.addEventListener(
  "keydown",
  (event) => {

    const map =
      getKeyMap();


    if (
      map[event.code]
    ) {

      input[
        map[event.code]
      ] = true;

      event.preventDefault();

    }


    const action =
      keyboardAction(
        event.code
      );


    if (
      action &&
      !event.repeat
    ) {

      send({
        type:
          "action",

        action

      });

      event.preventDefault();

    }

  }
);


window.addEventListener(
  "keyup",
  (event) => {

    const map =
      getKeyMap();


    if (
      map[event.code]
    ) {

      input[
        map[event.code]
      ] = false;

      event.preventDefault();

    }

  }
);


window.addEventListener(
  "blur",
  () => {

    input.left =
      false;

    input.right =
      false;

    input.jump =
      false;

    input.block =
      false;

  }
);


/* =====================================================
   INPUT LOOP
===================================================== */

setInterval(
  () => {

    send({

      type:
        "input",

      input: {

        left:
          input.left,

        right:
          input.right,

        jump:
          input.jump,

        block:
          input.block

      }

    });

  },
  50
);


/* =====================================================
   MOBILE
===================================================== */

document
  .querySelectorAll(
    "[data-input]"
  )
  .forEach(
    (button) => {

      const key =
        button.dataset.input;


      const press =
        (event) => {

          event.preventDefault();

          input[key] =
            true;

          button.classList.add(
            "pressed"
          );

          try {

            button.setPointerCapture(
              event.pointerId
            );

          } catch {}

        };


      const release =
        (event) => {

          event.preventDefault();

          input[key] =
            false;

          button.classList.remove(
            "pressed"
          );

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

    }
  );


document
  .querySelectorAll(
    "[data-action]"
  )
  .forEach(
    (button) => {

      button.addEventListener(
        "pointerdown",
        (event) => {

          event.preventDefault();


          send({

            type:
              "action",

            action:
              button.dataset.action

          });


          button.classList.add(
            "pressed"
          );


          setTimeout(
            () => {

              button.classList.remove(
                "pressed"
              );

            },
            120
          );

        }
      );

    }
  );


/* =====================================================
   HUD
===================================================== */

function updateHUD() {

  if (
    !state ||
    !state.players
  ) {
    return;
  }


  const p1 =
    state.players.P1;

  const p2 =
    state.players.P2;


  if (p1) {

    const hp =
      Math.max(
        0,
        Math.min(
          100,
          Number(
            p1.hp
          )
        )
      );


    p1Hp.style.width =
      `${hp}%`;


    p1HpText.textContent =
      `${Math.ceil(hp)} HP`;

  }


  if (p2) {

    const hp =
      Math.max(
        0,
        Math.min(
          100,
          Number(
            p2.hp
          )
        )
      );


    p2Hp.style.width =
      `${hp}%`;


    p2HpText.textContent =
      `${Math.ceil(hp)} HP`;

  }


  p1Score.textContent =
    state.scores?.P1 ??
    0;


  p2Score.textContent =
    state.scores?.P2 ??
    0;


  roundLabel.textContent =
    `ROUND ${state.round || 1} / ${state.roundsToWin || 5}`;


  timerEl.textContent =
    Math.ceil(
      Number(
        state.time || 0
      )
    );


  if (
    state.phase ===
    "fighting"
  ) {

    gameStatus.textContent =
      role === "P1"
        ? "YOU ARE PLAYER 1"
        : "YOU ARE PLAYER 2";

  }

}


/* =====================================================
   ROUND RESULTS
===================================================== */

function showRoundResult(
  winner
) {

  winOverlay.hidden =
    false;

  rematchBtn.disabled =
    true;


  if (
    winner === "draw"
  ) {

    winnerText.textContent =
      "DRAW";

    roundResult.textContent =
      "NEXT ROUND";

  }

  else if (
    winner === role
  ) {

    winnerText.textContent =
      "ROUND WON";

    roundResult.textContent =
      `SCORE: ${state.scores[role]}`;

  }

  else {

    winnerText.textContent =
      "ROUND LOST";

    roundResult.textContent =
      `SCORE: ${state.scores[role]}`;

  }

}


function showMatchWinner(
  winner
) {

  winOverlay.hidden =
    false;

  rematchBtn.disabled =
    false;


  if (
    winner ===
    "draw"
  ) {

    winnerText.textContent =
      "DRAW";

    roundResult.textContent =
      "MATCH OVER";

    return;

  }


  if (
    winner === role
  ) {

    winnerText.textContent =
      "YOU WIN!";

  } else {

    winnerText.textContent =
      "YOU LOSE!";

  }


  roundResult.textContent =
    `FINAL SCORE ${state.scores.P1} - ${state.scores.P2}`;

}


/* =====================================================
   EFFECTS
===================================================== */

function processEvents(
  events
) {

  for (
    const event
    of events
  ) {

    spawnEffect(
      event
    );

  }

}


function spawnEffect(
  event
) {

  if (!event) {
    return;
  }


  const effect = {

    type:
      event.type,

    x:
      Number(
        event.x || 0
      ),

    y:
      Number(
        event.y || 0
      ),

    direction:
      Number(
        event.direction || 1
      ),

    life:
      .45,

    maxLife:
      .45,

    particles: []

  };


  if (
    event.type ===
    "hit"
  ) {

    effect.life =
      .3;

    effect.maxLife =
      .3;


    for (
      let i = 0;
      i < 12;
      i++
    ) {

      const angle =
        Math.random() *
        Math.PI *
        2;


      const speed =
        50 +
        Math.random() *
        180;


      effect.particles.push({

        x: 0,

        y: 0,

        vx:
          Math.cos(
            angle
          ) * speed,

        vy:
          Math.sin(
            angle
          ) * speed

      });

    }

  }


  visuals.push(
    effect
  );

}


function updateVisuals(
  dt
) {

  for (
    let i =
      visuals.length - 1;

    i >= 0;

    i--
  ) {

    const effect =
      visuals[i];


    effect.life -=
      dt;


    if (
      effect.type ===
      "hit"
    ) {

      for (
        const p
        of effect.particles
      ) {

        p.x +=
          p.vx * dt;

        p.y +=
          p.vy * dt;

      }

    }


    if (
      effect.life <= 0
    ) {

      visuals.splice(
        i,
        1
      );

    }

  }

}


function drawVisuals() {

  for (
    const effect
    of visuals
  ) {

    const progress =
      1 -
      effect.life /
      effect.maxLife;


    const alpha =
      Math.max(
        0,
        1 - progress
      );


    ctx.save();

    ctx.globalAlpha =
      alpha;


    if (
      effect.type ===
      "fire"
    ) {

      ctx.translate(
        effect.x,
        effect.y
      );


      const radius =
        25 +
        progress *
        55;


      const gradient =
        ctx.createRadialGradient(
          0,
          0,
          4,
          0,
          0,
          radius
        );


      gradient.addColorStop(
        0,
        "#fff"
      );

      gradient.addColorStop(
        .25,
        "#ffd65a"
      );

      gradient.addColorStop(
        .6,
        "#ff6b2d"
      );

      gradient.addColorStop(
        1,
        "rgba(255,0,0,0)"
      );


      ctx.fillStyle =
        gradient;


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


    else if (
      effect.type ===
      "dash"
    ) {

      ctx.translate(
        effect.x,
        effect.y
      );


      ctx.strokeStyle =
        "#76eaff";

      ctx.lineWidth =
        8;


      for (
        let i = 0;
        i < 7;
        i++
      ) {

        ctx.beginPath();

        ctx.moveTo(
          -effect.direction *
            i *
            20,

          -25 +
            i *
            8
        );

        ctx.lineTo(
          -effect.direction *
            (100 +
              i *
              15),

          -25 +
            i *
            8
        );

        ctx.stroke();

      }

    }


    else if (
      effect.type ===
      "wind"
    ) {

      ctx.translate(
        effect.x,
        effect.y
      );


      ctx.scale(
        effect.direction,
        1
      );


      ctx.strokeStyle =
        "#c2ffff";

      ctx.lineWidth =
        8;


      ctx.beginPath();

      ctx.arc(
        0,
        0,
        35 +
          progress *
          60,
        -1,
        1
      );

      ctx.stroke();

    }


    else if (
      effect.type ===
      "hit"
    ) {

      ctx.translate(
        effect.x,
        effect.y
      );


      ctx.strokeStyle =
        "#fff";

      ctx.lineWidth =
        4;


      for (
        const p
        of effect.particles
      ) {

        ctx.beginPath();

        ctx.moveTo(
          p.x,
          p.y
        );

        ctx.lineTo(
          p.x -
            p.vx *
            .035,

          p.y -
            p.vy *
            .035
        );

        ctx.stroke();

      }


      ctx.beginPath();

      ctx.arc(
        0,
        0,
        15 +
          progress *
          45,
        0,
        Math.PI * 2
      );

      ctx.stroke();

    }


    ctx.restore();

  }

}


/* =====================================================
   ARENA
===================================================== */

function drawArena() {

  const gradient =
    ctx.createLinearGradient(
      0,
      0,
      0,
      WORLD_H
    );


  gradient.addColorStop(
    0,
    "#10162b"
  );

  gradient.addColorStop(
    .55,
    "#171d38"
  );

  gradient.addColorStop(
    1,
    "#090c18"
  );


  ctx.fillStyle =
    gradient;

  ctx.fillRect(
    0,
    0,
    WORLD_W,
    WORLD_H
  );


  /* Moon */

  ctx.beginPath();

  ctx.arc(
    1000,
    100,
    55,
    0,
    Math.PI * 2
  );

  ctx.fillStyle =
    "rgba(255,255,255,.12)";

  ctx.fill();


  /* Stars */

  for (
    let i = 0;
    i < 60;
    i++
  ) {

    const x =
      (i * 197) %
      WORLD_W;

    const y =
      (i * 83) %
      350;


    ctx.fillStyle =
      "rgba(255,255,255,.35)";

    ctx.fillRect(
      x,
      y,
      2,
      2
    );

  }


  /* Grid */

  ctx.strokeStyle =
    "rgba(255,255,255,.045)";

  ctx.lineWidth =
    1;


  for (
    let x = 0;
    x <= WORLD_W;
    x += 60
  ) {

    ctx.beginPath();

    ctx.moveTo(
      x,
      0
    );

    ctx.lineTo(
      x,
      WORLD_H
    );

    ctx.stroke();

  }


  for (
    let y = 0;
    y <= WORLD_H;
    y += 60
  ) {

    ctx.beginPath();

    ctx.moveTo(
      0,
      y
    );

    ctx.lineTo(
      WORLD_W,
      y
    );

    ctx.stroke();

  }


  /* Ground */

  const groundY =
    510;


  const ground =
    ctx.createLinearGradient(
      0,
      groundY,
      0,
      WORLD_H
    );


  ground.addColorStop(
    0,
    "#242b4b"
  );

  ground.addColorStop(
    1,
    "#0a0d19"
  );


  ctx.fillStyle =
    ground;


  ctx.fillRect(
    0,
    groundY,
    WORLD_W,
    WORLD_H -
      groundY
  );


  ctx.beginPath();

  ctx.moveTo(
    0,
    groundY
  );

  ctx.lineTo(
    WORLD_W,
    groundY
  );


  ctx.lineWidth =
    5;

  ctx.strokeStyle =
    "#7781a8";

  ctx.stroke();


  /* Center */

  ctx.beginPath();

  ctx.moveTo(
    WORLD_W / 2,
    groundY - 30
  );

  ctx.lineTo(
    WORLD_W / 2,
    groundY + 5
  );


  ctx.lineWidth =
    3;

  ctx.strokeStyle =
    "rgba(255,255,255,.25)";

  ctx.stroke();

}


/* =====================================================
   WALKING STICKMAN
===================================================== */

function drawStickman(
  player,
  now
) {

  if (!player) {
    return;
  }


  const x =
    Number(
      player.x
    );

  const y =
    Number(
      player.y
    );


  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {

    return;

  }


  const facing =
    Number(
      player.facing
    ) < 0
      ? -1
      : 1;


  const speed =
    Math.abs(
      Number(
        player.vx || 0
      )
    );


  /*
    THIS is the walking animation.

    Faster movement = faster leg swing.
  */

  let walkPhase =
    now * .01 *
    Math.min(
      1,
      speed / 90
    );


  if (
    player.onGround &&
    speed > 20
  ) {

    walkPhase =
      now *
      .018;

  }


  const swing =
    player.onGround &&
    speed > 20
      ? Math.sin(
          walkPhase
        ) * .75
      : 0;


  const bob =
    player.onGround &&
    speed > 20
      ? Math.abs(
          Math.sin(
            walkPhase
          )
        ) * 2
      : 0;


  ctx.save();


  ctx.translate(
    x,
    y - bob
  );


  ctx.scale(
    facing,
    1
  );


  /* Shadow */

  ctx.save();

  ctx.scale(
    1,
    .25
  );


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


  ctx.fillStyle =
    "rgba(0,0,0,.35)";

  ctx.fill();

  ctx.restore();


  const bodyColor =
    player.role === "P1"
      ? "#65a8ff"
      : "#ff657c";


  const glowColor =
    player.role === "P1"
      ? "#72c8ff"
      : "#ff728b";


  ctx.lineCap =
    "round";

  ctx.lineJoin =
    "round";


  /* Dash effect */

  if (
    Number(
      player.dashTimer ||
      0
    ) > 0
  ) {

    for (
      let i = 1;
      i <= 4;
      i++
    ) {

      ctx.globalAlpha =
        .12 *
        (5 - i);


      ctx.strokeStyle =
        "#77ddff";


      ctx.lineWidth =
        7;


      ctx.beginPath();

      ctx.moveTo(
        -30 -
          i *
          16,
        -55
      );

      ctx.lineTo(
        -80 -
          i *
          20,
        -55
      );

      ctx.stroke();

    }


    ctx.globalAlpha =
      1;

  }


  ctx.strokeStyle =
    bodyColor;

  ctx.fillStyle =
    bodyColor;


  ctx.shadowBlur =
    14;

  ctx.shadowColor =
    glowColor;


  /* Head */

  ctx.beginPath();

  ctx.arc(
    0,
    -92,
    21,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* Eye */

  ctx.shadowBlur =
    0;

  ctx.strokeStyle =
    "#080a12";

  ctx.lineWidth =
    4;

  ctx.beginPath();

  ctx.moveTo(
    7,
    -96
  );

  ctx.lineTo(
    14,
    -94
  );

  ctx.stroke();


  /* Body */

  ctx.strokeStyle =
    bodyColor;

  ctx.lineWidth =
    9;

  ctx.beginPath();

  ctx.moveTo(
    0,
    -70
  );

  ctx.lineTo(
    0,
    -28
  );

  ctx.stroke();


  /* ================= LEGS ================= */

  if (
    player.onGround &&
    speed > 20 &&
    !player.blocking &&
    !player.attackTimer
  ) {

    /*
      Animated running legs.
    */

    const legLength =
      31;


    ctx.lineWidth =
      8;


    ctx.beginPath();

    ctx.moveTo(
      0,
      -28
    );

    ctx.lineTo(
      Math.sin(
        walkPhase
      ) *
        legLength,

      Math.cos(
        walkPhase
      ) *
        6
    );

    ctx.stroke();


    ctx.beginPath();

    ctx.moveTo(
      0,
      -28
    );

    ctx.lineTo(
      -Math.sin(
        walkPhase
      ) *
        legLength,

      -Math.cos(
        walkPhase
      ) *
        6
    );

    ctx.stroke();


  } else {

    /* Standing legs */

    ctx.lineWidth =
      8;


    ctx.beginPath();

    ctx.moveTo(
      0,
      -28
    );

    ctx.lineTo(
      -20,
      0
    );

    ctx.lineTo(
      -30,
      0
    );

    ctx.stroke();


    ctx.beginPath();

    ctx.moveTo(
      0,
      -28
    );

    ctx.lineTo(
      20,
      0
    );

    ctx.lineTo(
      32,
      0
    );

    ctx.stroke();

  }


  /* ================= ARMS ================= */

  const attacking =
    Number(
      player.attackTimer ||
      0
    ) > 0;


  if (
    attacking
  ) {

    ctx.lineWidth =
      9;


    ctx.beginPath();

    ctx.moveTo(
      0,
      -62
    );

    ctx.lineTo(
      32,
      -52
    );

    ctx.lineTo(
      70,
      -55
    );

    ctx.stroke();


    ctx.beginPath();

    ctx.arc(
      74,
      -55,
      9,
      0,
      Math.PI * 2
    );

    ctx.fill();

  }


  else if (
    player.blocking
  ) {

    ctx.lineWidth =
      8;


    ctx.beginPath();

    ctx.moveTo(
      0,
      -62
    );

    ctx.lineTo(
      32,
      -70
    );

    ctx.lineTo(
      43,
      -42
    );

    ctx.stroke();


    ctx.beginPath();

    ctx.arc(
      43,
      -42,
      9,
      0,
      Math.PI * 2
    );

    ctx.fill();


    ctx.strokeStyle =
      "rgba(130,220,255,.9)";

    ctx.lineWidth =
      5;


    ctx.beginPath();

    ctx.arc(
      40,
      -60,
      43,
      -Math.PI / 2,
      Math.PI / 2
    );

    ctx.stroke();

  }


  else if (
    player.onGround &&
    speed > 20
  ) {

    /* Running arms */

    ctx.lineWidth =
      8;


    ctx.beginPath();

    ctx.moveTo(
      0,
      -62
    );

    ctx.lineTo(
      -25 +
        Math.sin(
          walkPhase +
          Math.PI
        ) *
        20,

      -48 +
        Math.cos(
          walkPhase
        ) *
        8
    );

    ctx.stroke();


    ctx.beginPath();

    ctx.moveTo(
      0,
      -62
    );

    ctx.lineTo(
      25 +
        Math.sin(
          walkPhase
        ) *
        20,

      -48 +
        Math.cos(
          walkPhase +
          Math.PI
        ) *
        8
    );

    ctx.stroke();

  }


  else {

    /* Standing arms */

    ctx.lineWidth =
      8;


    ctx.beginPath();

    ctx.moveTo(
      0,
      -62
    );

    ctx.lineTo(
      -30,
      -43
    );

    ctx.lineTo(
      -45,
      -20
    );

    ctx.stroke();


    ctx.beginPath();

    ctx.moveTo(
      0,
      -62
    );

    ctx.lineTo(
      30,
      -43
    );

    ctx.lineTo(
      45,
      -20
    );

    ctx.stroke();

  }


  /* Label */

  ctx.shadowBlur =
    0;

  ctx.fillStyle =
    "#fff";

  ctx.font =
    "bold 16px Arial";

  ctx.textAlign =
    "center";


  ctx.fillText(
    player.bot
      ? "CPU"
      : player.role,
    0,
    -128
  );


  /* Mini HP */

  const barWidth =
    70;


  ctx.fillStyle =
    "rgba(0,0,0,.5)";


  ctx.fillRect(
    -35,
    -115,
    barWidth,
    7
  );


  ctx.fillStyle =
    bodyColor;


  ctx.fillRect(
    -35,
    -115,
    barWidth *
      Math.max(
        0,
        player.hp
      ) /
      100,
    7
  );


  ctx.restore();

}


/* =====================================================
   PROJECTILES
===================================================== */

function drawProjectile(
  p
) {

  if (!p) {
    return;
  }


  if (
    p.kind ===
    "wind"
  ) {

    const direction =
      p.vx < 0
        ? -1
        : 1;


    ctx.save();

    ctx.translate(
      p.x,
      p.y
    );

    ctx.scale(
      direction,
      1
    );


    ctx.shadowBlur =
      25;

    ctx.shadowColor =
      "#bfffff";


    ctx.strokeStyle =
      "#cfffff";

    ctx.lineWidth =
      7;


    ctx.beginPath();

    ctx.arc(
      0,
      0,
      35,
      -.9,
      .9
    );

    ctx.stroke();


    ctx.restore();

  }

}


/* =====================================================
   WORLD TRANSFORM
===================================================== */

function resizeCanvas() {

  const rect =
    canvas.getBoundingClientRect();


  const width =
    Math.max(
      1,
      rect.width
    );


  const height =
    Math.max(
      1,
      rect.height
    );


  const dpr =
    Math.min(
      window.devicePixelRatio ||
        1,
      2
    );


  canvas.width =
    Math.floor(
      width *
      dpr
    );


  canvas.height =
    Math.floor(
      height *
      dpr
    );


  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

}


function resizeIfNeeded() {

  const width =
    canvas.clientWidth;

  const height =
    canvas.clientHeight;


  if (
    width !==
      previousCanvasWidth ||
    height !==
      previousCanvasHeight
  ) {

    previousCanvasWidth =
      width;

    previousCanvasHeight =
      height;


    resizeCanvas();

  }

}


function setupWorldTransform() {

  const width =
    canvas.clientWidth;

  const height =
    canvas.clientHeight;


  const scale =
    Math.min(
      width /
        WORLD_W,

      height /
        WORLD_H
    );


  const offsetX =
    (
      width -
      WORLD_W *
        scale
    ) /
    2;


  const offsetY =
    (
      height -
      WORLD_H *
        scale
    ) /
    2;


  ctx.setTransform(
    scale,
    0,
    0,
    scale,
    offsetX,
    offsetY
  );

}


/* =====================================================
   RENDER
===================================================== */

function render(
  now
) {

  const dt =
    Math.min(
      .05,
      (
        now -
        lastFrame
      ) /
        1000
    );


  lastFrame =
    now;


  resizeIfNeeded();


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


  /*
    Before server state exists,
    show two characters.
  */

  if (
    !state ||
    !state.players
  ) {

    drawStickman(
      {
        role: "P1",
        x: 300,
        y: 510,
        hp: 100,
        facing: 1,
        vx: 0,
        onGround: true,
        blocking: false,
        attackTimer: 0,
        dashTimer: 0,
        bot: false
      },
      now
    );


    drawStickman(
      {
        role: "P2",
        x: 900,
        y: 510,
        hp: 100,
        facing: -1,
        vx: 0,
        onGround: true,
        blocking: false,
        attackTimer: 0,
        dashTimer: 0,
        bot: false
      },
      now
    );

  } else {

    drawStickman(
      state.players.P1,
      now
    );


    drawStickman(
      state.players.P2,
      now
    );


    for (
      const projectile
      of state.projectiles ||
      []
    ) {

      drawProjectile(
        projectile
      );

    }

  }


  updateVisuals(
    dt
  );

  drawVisuals();


  requestAnimationFrame(
    render
  );

}


/* =====================================================
   START
===================================================== */

resizeCanvas();

requestAnimationFrame(
  render
);

connect();
