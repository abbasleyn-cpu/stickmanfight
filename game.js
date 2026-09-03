const canvas =
  document.getElementById(
    "gameCanvas"
  );

const ctx =
  canvas.getContext(
    "2d"
  );


/* =====================================================
   STATE
===================================================== */

let socket = null;

let role = null;

let state = null;

let roomCode = "";

let selectedRounds = 5;

let lastFrame =
  performance.now();

let canvasWidth = 0;
let canvasHeight = 0;

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
    document.getElementById(
      id
    );


const lobby =
  $("lobby");

const game =
  $("game");

const connection =
  $("connection");

const status =
  $("status");

const roomInfo =
  $("roomInfo");

const roomCodeElement =
  $("roomCode");

const roomInput =
  $("roomInput");

const joinBox =
  $("joinBox");

const createBtn =
  $("createBtn");

const cpuBtn =
  $("cpuBtn");

const showJoinBtn =
  $("showJoinBtn");

const joinBtn =
  $("joinBtn");

const copyBtn =
  $("copyBtn");

const roundLabel =
  $("roundLabel");

const timer =
  $("timer");

const gameStatus =
  $("gameStatus");

const p1Hp =
  $("p1Hp");

const p2Hp =
  $("p2Hp");

const p1HpText =
  $("p1HpText");

const p2HpText =
  $("p2HpText");

const p1Score =
  $("p1Score");

const p2Score =
  $("p2Score");

const overlay =
  $("overlay");

const winnerText =
  $("winnerText");

const roundResult =
  $("roundResult");

const rematchBtn =
  $("rematchBtn");


/* =====================================================
   ROUNDS
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
              (btn) => {

                btn.classList.remove(
                  "active"
                );

              }
            );


          button.classList.add(
            "active"
          );

        }
      );

    }
  );


/* =====================================================
   CONNECT
===================================================== */

function connect() {

  const protocol =
    location.protocol ===
      "https:"
      ? "wss"
      : "ws";


  socket =
    new WebSocket(
      `${protocol}://${location.host}`
    );


  socket.addEventListener(
    "open",
    () => {

      connection.textContent =
        "● ONLINE";

      connection.classList.add(
        "online"
      );


      status.textContent =
        "Choose a game mode.";

    }
  );


  socket.addEventListener(
    "close",
    () => {

      connection.textContent =
        "● OFFLINE";

      connection.classList.remove(
        "online"
      );


      status.textContent =
        "Server disconnected.";

    }
  );


  socket.addEventListener(
    "error",
    () => {

      connection.textContent =
        "● ERROR";

    }
  );


  socket.addEventListener(
    "message",
    (event) => {

      let message;

      try {

        message =
          JSON.parse(
            event.data
          );

      } catch {

        return;

      }


      handleMessage(
        message
      );

    }
  );

}


function send(
  message
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
      message
    )
  );

}


/* =====================================================
   MESSAGES
===================================================== */

function handleMessage(
  message
) {

  switch (
    message.type
  ) {

    case "welcome":

      role =
        message.role;

      roomCode =
        message.code;

      roomCodeElement.textContent =
        roomCode;


      roomInfo.hidden =
        false;


      createBtn.disabled =
        true;

      cpuBtn.disabled =
        true;

      showJoinBtn.disabled =
        true;


      status.textContent =
        message.mode ===
          "cpu"

          ? "VS COMPUTER STARTING..."

          : message.role ===
            "P1"

            ? "Room created. Waiting for Player 2..."

            : "Joined as Player 2.";

      break;


    case "state":

      state =
        message;


      if (
        message.started ||
        message.phase ===
          "round_end" ||
        message.phase ===
          "match_end"
      ) {

        lobby.hidden =
          true;

        game.hidden =
          false;

      }


      updateHUD();


      for (
        const event of
          message.events || []
      ) {

        addEffect(
          event
        );

      }


      if (
        message.phase ===
          "round_end"
      ) {

        showRoundEnd();

      }


      else if (
        message.phase ===
          "match_end"
      ) {

        showMatchEnd();

      }


      else {

        overlay.hidden =
          true;

      }

      break;


    case "error":

      status.textContent =
        message.message;

      break;

  }

}


/* =====================================================
   LOBBY
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
  joinRoom
);


roomInput.addEventListener(
  "keydown",
  (event) => {

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
    code.length !==
      6
  ) {

    status.textContent =
      "Enter a 6 character room code.";

    return;

  }


  send({

    type:
      "join",

    code

  });

}


copyBtn.addEventListener(
  "click",
  async () => {

    try {

      await navigator.clipboard.writeText(
        roomCode
      );

      copyBtn.textContent =
        "COPIED";

      setTimeout(
        () => {

          copyBtn.textContent =
            "COPY";

        },
        1000
      );

    } catch {

      status.textContent =
        roomCode;

    }

  }
);


rematchBtn.addEventListener(
  "click",
  () => {

    rematchBtn.disabled =
      true;

    send({

      type:
        "rematch"

    });

  }
);


/* =====================================================
   KEYBOARD
===================================================== */

function actionForKey(
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


function inputKey(
  code
) {

  if (
    role === "P1"
  ) {

    if (
      code === "KeyA"
    ) return "left";

    if (
      code === "KeyD"
    ) return "right";

    if (
      code === "KeyW"
    ) return "jump";

    if (
      code === "KeyG"
    ) return "block";

  }


  if (
    role === "P2"
  ) {

    if (
      code === "ArrowLeft"
    ) return "left";

    if (
      code === "ArrowRight"
    ) return "right";

    if (
      code === "ArrowUp"
    ) return "jump";

    if (
      code === "KeyK"
    ) return "block";

  }


  return null;

}


window.addEventListener(
  "keydown",
  (event) => {

    const key =
      inputKey(
        event.code
      );


    if (key) {

      input[key] =
        true;

      event.preventDefault();

    }


    const action =
      actionForKey(
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

    const key =
      inputKey(
        event.code
      );


    if (key) {

      input[key] =
        false;

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
   TOUCH
===================================================== */

document
  .querySelectorAll(
    "[data-input]"
  )
  .forEach(
    (button) => {

      const key =
        button.dataset.input;


      function press(event) {

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

      }


      function release(event) {

        event.preventDefault();

        input[key] =
          false;

        button.classList.remove(
          "pressed"
        );

      }


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

          button.classList.add(
            "pressed"
          );


          send({

            type:
              "action",

            action:
              button.dataset.action

          });


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
    !state
  ) {

    return;

  }


  const p1 =
    state.players.P1;

  const p2 =
    state.players.P2;


  p1Hp.style.width =
    `${Math.max(
      0,
      p1.hp
    )}%`;


  p2Hp.style.width =
    `${Math.max(
      0,
      p2.hp
    )}%`;


  p1HpText.textContent =
    `${Math.ceil(
      p1.hp
    )} HP`;


  p2HpText.textContent =
    `${Math.ceil(
      p2.hp
    )} HP`;


  p1Score.textContent =
    state.scores.P1;


  p2Score.textContent =
    state.scores.P2;


  roundLabel.textContent =
    `ROUND ${state.round} / ${state.roundsToWin}`;


  timer.textContent =
    Math.ceil(
      state.time
    );


  gameStatus.textContent =
    state.mode === "cpu"
      ? "VS COMPUTER"
      : role === "P1"
        ? "PLAYER 1"
        : "PLAYER 2";

}


/* =====================================================
   ROUND OVERLAY
===================================================== */

function showRoundEnd() {

  overlay.hidden =
    false;

  rematchBtn.hidden =
    true;


  if (
    state.roundWinner ===
      "draw"
  ) {

    winnerText.textContent =
      "DRAW";

    roundResult.textContent =
      "NEXT ROUND";

  }

  else if (
    state.roundWinner ===
      role
  ) {

    winnerText.textContent =
      "ROUND WON";

    roundResult.textContent =
      `SCORE ${state.scores.P1} - ${state.scores.P2}`;

  }

  else {

    winnerText.textContent =
      "ROUND LOST";

    roundResult.textContent =
      `SCORE ${state.scores.P1} - ${state.scores.P2}`;

  }

}


function showMatchEnd() {

  overlay.hidden =
    false;

  rematchBtn.hidden =
    false;

  rematchBtn.disabled =
    false;


  if (
    state.winner ===
      role
  ) {

    winnerText.textContent =
      "YOU WIN!";

  }

  else {

    winnerText.textContent =
      "YOU LOSE!";

  }


  roundResult.textContent =
    `FINAL SCORE ${state.scores.P1} - ${state.scores.P2}`;

}


/* =====================================================
   CANVAS RESIZE
===================================================== */

function resizeCanvas() {

  const rect =
    canvas.getBoundingClientRect();


  const dpr =
    Math.min(
      window.devicePixelRatio ||
        1,
      2
    );


  canvas.width =
    Math.max(
      1,
      Math.floor(
        rect.width *
        dpr
      )
    );


  canvas.height =
    Math.max(
      1,
      Math.floor(
        rect.height *
        dpr
      )
    );


  canvasWidth =
    rect.width;

  canvasHeight =
    rect.height;

}


window.addEventListener(
  "resize",
  resizeCanvas
);


resizeCanvas();


/* =====================================================
   TRANSFORM
===================================================== */

function worldTransform() {

  const scale =
    Math.max(
      canvasWidth /
        1200,

      canvasHeight /
        600
    );


  const x =
    (
      canvasWidth -
      1200 *
      scale
    ) / 2;


  const y =
    (
      canvasHeight -
      600 *
      scale
    ) / 2;


  ctx.setTransform(
    scale,
    0,
    0,
    scale,
    x,
    y
  );

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
      600
    );


  gradient.addColorStop(
    0,
    "#10172d"
  );

  gradient.addColorStop(
    .55,
    "#171d38"
  );

  gradient.addColorStop(
    1,
    "#080b16"
  );


  ctx.fillStyle =
    gradient;

  ctx.fillRect(
    0,
    0,
    1200,
    600
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
    i < 65;
    i++
  ) {

    const x =
      (i * 193) %
      1200;

    const y =
      (i * 79) %
      340;


    ctx.fillStyle =
      "rgba(255,255,255,.3)";

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
    x <= 1200;
    x += 60
  ) {

    ctx.beginPath();

    ctx.moveTo(
      x,
      0
    );

    ctx.lineTo(
      x,
      600
    );

    ctx.stroke();

  }


  for (
    let y = 0;
    y <= 600;
    y += 60
  ) {

    ctx.beginPath();

    ctx.moveTo(
      0,
      y
    );

    ctx.lineTo(
      1200,
      y
    );

    ctx.stroke();

  }


  /* Ground */

  ctx.fillStyle =
    "#242b4b";

  ctx.fillRect(
    0,
    510,
    1200,
    90
  );


  ctx.beginPath();

  ctx.moveTo(
    0,
    510
  );

  ctx.lineTo(
    1200,
    510
  );


  ctx.lineWidth =
    5;

  ctx.strokeStyle =
    "#7781a8";

  ctx.stroke();


  /* Center */

  ctx.beginPath();

  ctx.moveTo(
    600,
    475
  );

  ctx.lineTo(
    600,
    515
  );


  ctx.lineWidth =
    3;

  ctx.strokeStyle =
    "rgba(255,255,255,.25)";

  ctx.stroke();

}


/* =====================================================
   STICKMAN
===================================================== */

function drawStickman(
  player,
  now
) {

  if (
    !player
  ) {

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
    player.facing < 0
      ? -1
      : 1;


  const speed =
    Math.abs(
      Number(
        player.vx || 0
      )
    );


  const moving =
    player.onGround &&
    speed > 20;


  const t =
    now / 1000;


  const phase =
    t *
    (
      7 +
      Math.min(
        1,
        speed / 260
      ) *
      10
    );


  const leg =
    moving
      ? Math.sin(
          phase
        ) *
        25
      : 0;


  const leg2 =
    moving
      ? Math.sin(
          phase +
          Math.PI
        ) *
        25
      : 0;


  const arm =
    moving
      ? Math.sin(
          phase +
          Math.PI
        ) *
        17
      : 0;


  const arm2 =
    moving
      ? Math.sin(
          phase
        ) *
        17
      : 0;


  const bob =
    moving
      ? Math.abs(
          Math.sin(
            phase
          )
        ) *
        3
      : Math.sin(
          t *
          2.5
        ) *
        1.5;


  const color =
    player.role ===
      "P1"
      ? "#65a8ff"
      : "#ff657c";


  const dark =
    player.role ===
      "P1"
      ? "#234a86"
      : "#8d2c43";


  ctx.save();


  ctx.translate(
    x,
    y -
      bob
  );


  ctx.scale(
    facing,
    1
  );


  /* Shadow */

  ctx.save();

  ctx.scale(
    1,
    .22
  );

  ctx.beginPath();

  ctx.ellipse(
    0,
    0,
    43,
    16,
    0,
    0,
    Math.PI * 2
  );

  ctx.fillStyle =
    "rgba(0,0,0,.35)";

  ctx.fill();

  ctx.restore();


  /* Dash */

  if (
    player.dashTimer >
      0
  ) {

    for (
      let i = 1;
      i <= 5;
      i++
    ) {

      ctx.globalAlpha =
        .08 *
        (6 - i);

      ctx.strokeStyle =
        "#7deaff";

      ctx.lineWidth =
        7;


      ctx.beginPath();

      ctx.moveTo(
        -30 -
          i * 20,
        -55
      );

      ctx.lineTo(
        -85 -
          i * 25,
        -55
      );

      ctx.stroke();

    }

    ctx.globalAlpha =
      1;

  }


  ctx.strokeStyle =
    color;

  ctx.fillStyle =
    color;

  ctx.lineCap =
    "round";

  ctx.lineJoin =
    "round";

  ctx.shadowBlur =
    14;

  ctx.shadowColor =
    color;


  /* HEAD */

  const headY =
    -92 +
    (player.stun > 0
      ? 4
      : 0);


  ctx.beginPath();

  ctx.arc(
    0,
    headY,
    21,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* Hair */

  ctx.shadowBlur =
    0;

  ctx.strokeStyle =
    dark;

  ctx.lineWidth =
    5;

  ctx.beginPath();

  ctx.arc(
    0,
    headY - 4,
    17,
    Math.PI,
    Math.PI * 1.8
  );

  ctx.stroke();


  /* Eye */

  ctx.strokeStyle =
    "#060812";

  ctx.lineWidth =
    3;

  ctx.beginPath();

  ctx.moveTo(
    8,
    headY - 3
  );

  ctx.lineTo(
    15,
    headY - 2
  );

  ctx.stroke();


  /* BODY */

  ctx.strokeStyle =
    color;

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


  /* LEGS */

  ctx.lineWidth =
    8;


  if (
    !player.onGround
  ) {

    /* Jump pose */

    ctx.beginPath();

    ctx.moveTo(
      0,
      -28
    );

    ctx.lineTo(
      -23,
      -3
    );

    ctx.lineTo(
      -38,
      3
    );

    ctx.stroke();


    ctx.beginPath();

    ctx.moveTo(
      0,
      -28
    );

    ctx.lineTo(
      24,
      -7
    );

    ctx.lineTo(
      40,
      1
    );

    ctx.stroke();

  }

  else if (
    moving
  ) {

    ctx.beginPath();

    ctx.moveTo(
      0,
      -28
    );

    ctx.lineTo(
      leg,
      -3
    );

    ctx.lineTo(
      leg + 12,
      0
    );

    ctx.stroke();


    ctx.beginPath();

    ctx.moveTo(
      0,
      -28
    );

    ctx.lineTo(
      leg2,
      -3
    );

    ctx.lineTo(
      leg2 - 12,
      0
    );

    ctx.stroke();

  }

  else {

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
      -31,
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


  /* ARMS */

  if (
    player.stun >
      0
  ) {

    /* Hit pose */

    ctx.lineWidth =
      8;

    ctx.beginPath();

    ctx.moveTo(
      0,
      -62
    );

    ctx.lineTo(
      -35,
      -48
    );

    ctx.lineTo(
      -50,
      -60
    );

    ctx.stroke();


    ctx.beginPath();

    ctx.moveTo(
      0,
      -62
    );

    ctx.lineTo(
      32,
      -45
    );

    ctx.lineTo(
      49,
      -58
    );

    ctx.stroke();

  }

  else if (
    player.blocking
  ) {

    /* Block */

    ctx.lineWidth =
      8;

    ctx.beginPath();

    ctx.moveTo(
      0,
      -62
    );

    ctx.lineTo(
      30,
      -70
    );

    ctx.lineTo(
      43,
      -42
    );

    ctx.stroke();


    ctx.strokeStyle =
      "#b8f8ff";

    ctx.lineWidth =
      5;

    ctx.shadowBlur =
      20;

    ctx.shadowColor =
      "#66eaff";

    ctx.beginPath();

    ctx.arc(
      43,
      -60,
      47,
      -Math.PI / 2,
      Math.PI / 2
    );

    ctx.stroke();

    ctx.shadowBlur =
      0;

  }

  else if (
    player.attackTimer >
      0
  ) {

    /* Punch */

    ctx.strokeStyle =
      color;

    ctx.lineWidth =
      9;

    ctx.beginPath();

    ctx.moveTo(
      0,
      -62
    );

    ctx.lineTo(
      30,
      -52
    );

    ctx.lineTo(
      71,
      -53
    );

    ctx.stroke();


    ctx.beginPath();

    ctx.arc(
      77,
      -53,
      10,
      0,
      Math.PI * 2
    );

    ctx.fill();


    /* Back arm */

    ctx.lineWidth =
      8;

    ctx.beginPath();

    ctx.moveTo(
      0,
      -62
    );

    ctx.lineTo(
      -28,
      -48
    );

    ctx.lineTo(
      -38,
      -66
    );

    ctx.stroke();

  }

  else if (
    moving
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
      -28 +
        arm,
      -45
    );

    ctx.lineTo(
      -43 +
        arm,
      -20
    );

    ctx.stroke();


    ctx.beginPath();

    ctx.moveTo(
      0,
      -62
    );

    ctx.lineTo(
      28 +
        arm2,
      -45
    );

    ctx.lineTo(
      43 +
        arm2,
      -19
    );

    ctx.stroke();

  }

  else {

    /* Idle */

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
      -44,
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
      44,
      -20
    );

    ctx.stroke();

  }


  /* Label */

  ctx.shadowBlur =
    0;

  ctx.font =
    "bold 16px Arial";

  ctx.textAlign =
    "center";

  ctx.fillStyle =
    "white";


  ctx.fillText(
    player.bot
      ? "CPU"
      : player.role,
    0,
    -130
  );


  /* HP */

  ctx.fillStyle =
    "rgba(0,0,0,.55)";

  ctx.fillRect(
    -35,
    -118,
    70,
    7
  );


  ctx.fillStyle =
    color;

  ctx.fillRect(
    -35,
    -118,
    70 *
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
  projectile
) {

  if (
    projectile.kind !==
      "wind"
  ) {

    return;

  }


  const direction =
    projectile.vx <
      0
      ? -1
      : 1;


  ctx.save();


  ctx.translate(
    projectile.x,
    projectile.y
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


/* =====================================================
   EFFECTS
===================================================== */

function addEffect(
  event
) {

  visuals.push({

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
      .4,

    maxLife:
      .4

  });

}


function updateEffects(
  dt
) {

  for (
    let i =
      visuals.length - 1;

    i >= 0;

    i--
  ) {

    visuals[i].life -=
      dt;


    if (
      visuals[i].life <=
        0
    ) {

      visuals.splice(
        i,
        1
      );

    }

  }

}


function drawEffects() {

  for (
    const effect of
      visuals
  ) {

    const progress =
      1 -
      effect.life /
      effect.maxLife;


    ctx.save();


    ctx.globalAlpha =
      Math.max(
        0,
        1 - progress
      );


    if (
      effect.type ===
        "fire"
    ) {

      ctx.translate(
        effect.x,
        effect.y
      );


      const radius =
        30 +
        progress *
        55;


      const gradient =
        ctx.createRadialGradient(
          0,
          0,
          2,
          0,
          0,
          radius
        );


      gradient.addColorStop(
        0,
        "white"
      );

      gradient.addColorStop(
        .25,
        "#ffd75a"
      );

      gradient.addColorStop(
        .6,
        "#ff6b30"
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
        "#7deaff";

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
            18,
          -25 +
            i * 7
        );

        ctx.lineTo(
          -effect.direction *
            (90 +
              i * 15),
          -25 +
            i * 7
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
        "#cfffff";

      ctx.lineWidth =
        8;


      ctx.beginPath();

      ctx.arc(
        0,
        0,
        35 +
          progress *
          50,
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
        "white";

      ctx.lineWidth =
        4;


      for (
        let i = 0;
        i < 8;
        i++
      ) {

        const angle =
          i /
          8 *
          Math.PI *
          2;


        const distance =
          10 +
          progress *
          35;


        ctx.beginPath();

        ctx.moveTo(
          Math.cos(
            angle
          ) *
            5,

          Math.sin(
            angle
          ) *
            5
        );


        ctx.lineTo(
          Math.cos(
            angle
          ) *
            distance,

          Math.sin(
            angle
          ) *
            distance
        );

        ctx.stroke();

      }

    }


    ctx.restore();

  }

}


/* =====================================================
   RENDER LOOP
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
    canvasWidth,
    canvasHeight
  );


  worldTransform();


  drawArena();


  if (
    state &&
    state.players
  ) {

    drawStickman(
      state.players.P1,
      now
    );


    drawStickman(
      state.players.P2,
      now
    );


    for (
      const projectile of
        state.projectiles ||
        []
    ) {

      drawProjectile(
        projectile
      );

    }

  } else {

    drawStickman(
      {
        role:
          "P1",

        x:
          300,

        y:
          510,

        hp:
          100,

        facing:
          1,

        vx:
          0,

        onGround:
          true,

        blocking:
          false,

        attackTimer:
          0,

        dashTimer:
          0,

        bot:
          false

      },
      now
    );


    drawStickman(
      {
        role:
          "P2",

        x:
          900,

        y:
          510,

        hp:
          100,

        facing:
          -1,

        vx:
          0,

        onGround:
          true,

        blocking:
          false,

        attackTimer:
          0,

        dashTimer:
          0,

        bot:
          false

      },
      now
    );

  }


  updateEffects(
    dt
  );


  drawEffects();


  requestAnimationFrame(
    render
  );

}


function resizeIfNeeded() {

  const rect =
    canvas.getBoundingClientRect();


  if (
    rect.width !==
      canvasWidth ||
    rect.height !==
      canvasHeight
  ) {

    resizeCanvas();

  }

}


requestAnimationFrame(
  render
);


/* =====================================================
   START
===================================================== */

connect();
