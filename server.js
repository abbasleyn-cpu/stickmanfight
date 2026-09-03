import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

const WORLD = {
  width: 1200,
  height: 600,
  ground: 510
};

const PHYSICS = {
  runSpeed: 300,
  blockSpeed: 150,
  gravity: 1800,
  jumpVelocity: -720
};

const ROUND_TIME = 60;

const rooms = new Map();

let nextProjectileId = 1;


/* =====================================================
   STATIC FILE SERVER
===================================================== */

const FILES = {
  "/": "index.html",
  "/index.html": "index.html",
  "/style.css": "style.css",
  "/game.js": "game.js"
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

const server = http.createServer((req, res) => {
  try {
    const url = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`
    );

    const file = FILES[url.pathname];

    if (!file) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const fullPath = path.resolve(
      __dirname,
      file
    );

    fs.readFile(
      fullPath,
      (error, data) => {
        if (error) {
          console.error(error);
          res.writeHead(500);
          res.end("Server error");
          return;
        }

        res.writeHead(200, {
          "Content-Type":
            MIME[path.extname(fullPath)] ||
            "application/octet-stream"
        });

        res.end(data);
      }
    );
  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end("Server error");
  }
});


/* =====================================================
   WEBSOCKET
===================================================== */

const wss = new WebSocketServer({
  server
});


/* =====================================================
   ROOM CODES
===================================================== */

const ROOM_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomRoomCode() {
  let code;

  do {
    code = "";

    for (let i = 0; i < 6; i++) {
      code +=
        ROOM_CHARS[
          Math.floor(
            Math.random() *
            ROOM_CHARS.length
          )
        ];
    }
  } while (rooms.has(code));

  return code;
}


/* =====================================================
   INPUT
===================================================== */

function emptyInput() {
  return {
    left: false,
    right: false,
    jump: false,
    block: false
  };
}


/* =====================================================
   PLAYER
===================================================== */

function makePlayer(
  role,
  bot = false
) {
  return {
    role,

    bot,

    connected: false,

    x:
      role === "P1"
        ? 300
        : 900,

    y: WORLD.ground,

    vx: 0,
    vy: 0,

    facing:
      role === "P1"
        ? 1
        : -1,

    hp: 100,

    input: emptyInput(),

    previousJump: false,
    jumpQueued: false,

    onGround: true,

    blocking: false,

    attackTimer: 0,

    dashTimer: 0,
    dashHit: false,

    stun: 0,
    invuln: 0,

    cooldowns: {
      punch: 0,
      kick: 0,
      fire: 0,
      dash: 0,
      wind: 0
    },

    ai: {
      attackTimer: 0.7,
      abilityTimer: 1.5,
      jumpTimer: 1,
      decisionTimer: 0
    }
  };
}


/* =====================================================
   ROOM
===================================================== */

function makeRoom(
  mode,
  rounds
) {
  const room = {
    code: randomRoomCode(),

    mode,

    roundsToWin:
      rounds === 10
        ? 10
        : 5,

    clients: {
      P1: null,
      P2: null
    },

    players: {
      P1: makePlayer("P1", false),
      P2: makePlayer(
        "P2",
        mode === "cpu"
      )
    },

    score: {
      P1: 0,
      P2: 0
    },

    round: 1,

    phase: "lobby",

    started: false,

    time: ROUND_TIME,

    roundWinner: null,
    matchWinner: null,

    projectiles: [],

    events: [],

    nextRoundAt: 0
  };

  if (mode === "cpu") {
    room.players.P2.connected = true;
  }

  return room;
}


/* =====================================================
   SOCKET HELPERS
===================================================== */

function send(ws, data) {
  if (
    ws &&
    ws.readyState === WebSocket.OPEN
  ) {
    ws.send(
      JSON.stringify(data)
    );
  }
}


function sendState(room) {
  const message = makeState(room);

  send(
    room.clients.P1,
    message
  );

  send(
    room.clients.P2,
    message
  );

  room.events = [];
}


function broadcastRoom(room) {
  const message = {
    type: "room",

    code: room.code,

    mode: room.mode,

    started: room.started,

    phase: room.phase,

    connected:
      Number(
        room.players.P1.connected
      ) +
      Number(
        room.players.P2.connected
      ),

    roundsToWin:
      room.roundsToWin
  };

  send(
    room.clients.P1,
    message
  );

  send(
    room.clients.P2,
    message
  );
}


/* =====================================================
   STATE
===================================================== */

function publicPlayer(player) {
  return {
    role: player.role,

    bot: player.bot,

    connected:
      player.connected,

    x: player.x,
    y: player.y,

    vx: player.vx,
    vy: player.vy,

    facing:
      player.facing,

    hp:
      player.hp,

    blocking:
      player.blocking,

    onGround:
      player.onGround,

    attackTimer:
      player.attackTimer,

    dashTimer:
      player.dashTimer,

    stun:
      player.stun,

    cooldowns: {
      fire:
        player.cooldowns.fire,

      dash:
        player.cooldowns.dash,

      wind:
        player.cooldowns.wind
    }
  };
}


function makeState(room) {
  return {
    type: "state",

    mode: room.mode,

    started: room.started,

    phase: room.phase,

    time: Math.max(
      0,
      room.time
    ),

    round:
      room.round,

    roundsToWin:
      room.roundsToWin,

    scores: {
      P1:
        room.score.P1,

      P2:
        room.score.P2
    },

    roundWinner:
      room.roundWinner,

    winner:
      room.matchWinner,

    players: {
      P1:
        publicPlayer(
          room.players.P1
        ),

      P2:
        publicPlayer(
          room.players.P2
        )
    },

    projectiles:
      room.projectiles.map(
        (projectile) => ({
          id:
            projectile.id,

          kind:
            projectile.kind,

          x:
            projectile.x,

          y:
            projectile.y,

          vx:
            projectile.vx,

          vy:
            projectile.vy
        })
      ),

    events:
      room.events
  };
}


/* =====================================================
   RESET
===================================================== */

function resetPlayer(player) {
  player.x =
    player.role === "P1"
      ? 300
      : 900;

  player.y =
    WORLD.ground;

  player.vx = 0;
  player.vy = 0;

  player.facing =
    player.role === "P1"
      ? 1
      : -1;

  player.hp = 100;

  player.input =
    emptyInput();

  player.previousJump =
    false;

  player.jumpQueued =
    false;

  player.onGround =
    true;

  player.blocking =
    false;

  player.attackTimer =
    0;

  player.dashTimer =
    0;

  player.dashHit =
    false;

  player.stun =
    0;

  player.invuln =
    0;

  player.cooldowns.punch =
    0;

  player.cooldowns.kick =
    0;

  player.cooldowns.fire =
    0;

  player.cooldowns.dash =
    0;

  player.cooldowns.wind =
    0;

  player.ai.attackTimer =
    0.7;

  player.ai.abilityTimer =
    1.5;

  player.ai.jumpTimer =
    1;

  player.ai.decisionTimer =
    0;
}


function startMatch(room) {
  room.score.P1 = 0;
  room.score.P2 = 0;

  room.round = 1;

  room.roundWinner = null;
  room.matchWinner = null;

  room.projectiles = [];

  room.time =
    ROUND_TIME;

  resetPlayer(
    room.players.P1
  );

  resetPlayer(
    room.players.P2
  );

  room.phase =
    "fighting";

  room.started =
    true;
}


function startNextRound(room) {
  room.round++;

  room.roundWinner =
    null;

  room.matchWinner =
    null;

  room.projectiles = [];

  room.time =
    ROUND_TIME;

  resetPlayer(
    room.players.P1
  );

  resetPlayer(
    room.players.P2
  );

  room.phase =
    "fighting";

  room.started =
    true;
}


/* =====================================================
   COMBAT
===================================================== */

function getOpponent(
  room,
  player
) {
  return player.role === "P1"
    ? room.players.P2
    : room.players.P1;
}


function canFight(
  room,
  player
) {
  return (
    room.started &&
    room.phase === "fighting" &&
    player.connected &&
    player.hp > 0 &&
    player.stun <= 0
  );
}


function facingTarget(
  player,
  target
) {
  const dx =
    target.x -
    player.x;

  return (
    Math.sign(dx) ===
      player.facing ||
    Math.abs(dx) < 5
  );
}


function damagePlayer(
  room,
  attacker,
  target,
  amount,
  type
) {
  if (
    !target.connected ||
    target.hp <= 0 ||
    target.invuln > 0
  ) {
    return false;
  }

  let damage =
    amount;

  if (
    target.blocking
  ) {
    damage =
      Math.ceil(
        amount * 0.25
      );
  }

  target.hp =
    Math.max(
      0,
      target.hp - damage
    );

  target.invuln =
    target.blocking
      ? 0.06
      : 0.12;

  target.stun =
    target.blocking
      ? 0.05
      : 0.14;

  target.vx +=
    attacker.facing *
    (
      target.blocking
        ? 80
        : 180
    );

  room.events.push({
    type: "hit",

    x: target.x,

    y:
      target.y - 65,

    damage,

    attackType:
      type
  });

  if (
    target.hp <= 0
  ) {
    finishRound(
      room,
      attacker.role
    );
  }

  return true;
}


function punchOrKick(
  room,
  player,
  type
) {
  if (
    !canFight(
      room,
      player
    )
  ) {
    return;
  }

  const cooldownKey =
    type === "punch"
      ? "punch"
      : "kick";

  if (
    player.cooldowns[
      cooldownKey
    ] > 0
  ) {
    return;
  }

  const target =
    getOpponent(
      room,
      player
    );

  player.attackTimer =
    type === "punch"
      ? 0.18
      : 0.25;

  player.cooldowns[
    cooldownKey
  ] =
    type === "punch"
      ? 0.30
      : 0.45;

  const distance =
    Math.abs(
      target.x -
      player.x
    );

  const vertical =
    Math.abs(
      target.y -
      player.y
    );

  const range =
    type === "punch"
      ? 125
      : 150;

  if (
    distance <= range &&
    vertical <= 105 &&
    facingTarget(
      player,
      target
    )
  ) {
    damagePlayer(
      room,
      player,
      target,
      type === "punch"
        ? 9
        : 12,
      type
    );
  }
}


function fireFist(
  room,
  player
) {
  if (
    !canFight(
      room,
      player
    )
  ) {
    return;
  }

  if (
    player.cooldowns.fire >
    0
  ) {
    return;
  }

  player.cooldowns.fire =
    2.5;

  room.events.push({
    type: "fire",

    x:
      player.x +
      player.facing * 70,

    y:
      player.y - 65,

    direction:
      player.facing
  });

  const target =
    getOpponent(
      room,
      player
    );

  const distance =
    Math.abs(
      target.x -
      player.x
    );

  const vertical =
    Math.abs(
      target.y -
      player.y
    );

  if (
    distance <= 190 &&
    vertical <= 115 &&
    facingTarget(
      player,
      target
    )
  ) {
    damagePlayer(
      room,
      player,
      target,
      28,
      "fire"
    );
  }
}


function lightningDash(
  room,
  player
) {
  if (
    !canFight(
      room,
      player
    )
  ) {
    return;
  }

  if (
    player.cooldowns.dash >
    0
  ) {
    return;
  }

  player.cooldowns.dash =
    4;

  player.dashTimer =
    0.3;

  player.dashHit =
    false;

  player.invuln =
    Math.max(
      player.invuln,
      0.2
    );

  player.vx =
    player.facing *
    850;

  room.events.push({
    type: "dash",

    x: player.x,

    y:
      player.y - 60,

    direction:
      player.facing
  });
}


function windSlash(
  room,
  player
) {
  if (
    !canFight(
      room,
      player
    )
  ) {
    return;
  }

  if (
    player.cooldowns.wind >
    0
  ) {
    return;
  }

  player.cooldowns.wind =
    3;

  room.projectiles.push({
    id:
      nextProjectileId++,

    kind:
      "wind",

    owner:
      player.role,

    x:
      player.x +
      player.facing * 60,

    y:
      player.y - 65,

    vx:
      player.facing * 650,

    vy: 0,

    life:
      0.9,

    hit: false
  });

  room.events.push({
    type: "wind",

    x:
      player.x +
      player.facing * 60,

    y:
      player.y - 65,

    direction:
      player.facing
  });
}


function performAction(
  room,
  player,
  action
) {
  switch (action) {

    case "attack":
      punchOrKick(
        room,
        player,
        "punch"
      );
      break;

    case "kick":
      punchOrKick(
        room,
        player,
        "kick"
      );
      break;

    case "fire":
      fireFist(
        room,
        player
      );
      break;

    case "dash":
      lightningDash(
        room,
        player
      );
      break;

    case "wind":
      windSlash(
        room,
        player
      );
      break;
  }
}


/* =====================================================
   INPUT
===================================================== */

function setPlayerInput(
  player,
  incoming
) {
  const previousJump =
    player.input.jump;

  const next =
    emptyInput();

  if (
    incoming &&
    typeof incoming === "object"
  ) {
    next.left =
      Boolean(
        incoming.left
      );

    next.right =
      Boolean(
        incoming.right
      );

    next.jump =
      Boolean(
        incoming.jump
      );

    next.block =
      Boolean(
        incoming.block
      );
  }

  player.input =
    next;

  if (
    next.jump &&
    !previousJump
  ) {
    player.jumpQueued =
      true;
  }

  player.blocking =
    next.block &&
    player.onGround &&
    player.stun <= 0;
}


/* =====================================================
   CPU
===================================================== */

function updateCPU(
  room,
  cpu,
  dt
) {
  if (
    !cpu.bot ||
    !room.started ||
    room.phase !== "fighting"
  ) {
    cpu.input =
      emptyInput();

    return;
  }

  const target =
    room.players.P1;

  if (
    !target.connected ||
    target.hp <= 0
  ) {
    return;
  }

  const dx =
    target.x -
    cpu.x;

  const distance =
    Math.abs(dx);

  cpu.ai.attackTimer -= dt;
  cpu.ai.abilityTimer -= dt;
  cpu.ai.jumpTimer -= dt;
  cpu.ai.decisionTimer -= dt;


  /* Always face player */

  if (
    Math.abs(dx) > 3
  ) {
    cpu.facing =
      dx > 0
        ? 1
        : -1;
  }


  /* Movement */

  cpu.input.left =
    false;

  cpu.input.right =
    false;

  cpu.input.block =
    false;


  if (
    distance > 120
  ) {
    if (dx > 0) {
      cpu.input.right =
        true;
    } else {
      cpu.input.left =
        true;
    }
  }


  /* Sometimes retreat */

  if (
    distance < 80 &&
    Math.random() < 0.02
  ) {
    if (dx > 0) {
      cpu.input.left =
        true;
    } else {
      cpu.input.right =
        true;
    }
  }


  /* Block incoming attack */

  if (
    distance < 135 &&
    target.attackTimer > 0 &&
    Math.random() < 0.45
  ) {
    cpu.input.block =
      true;
  }


  /* Jump */

  cpu.input.jump =
    false;

  if (
    cpu.ai.jumpTimer <= 0 &&
    cpu.onGround &&
    Math.random() < 0.8
  ) {
    cpu.input.jump =
      true;

    cpu.ai.jumpTimer =
      1 +
      Math.random() * 1.5;
  }


  /* Attack */

  if (
    cpu.ai.attackTimer <= 0
  ) {
    if (
      distance < 150
    ) {
      if (
        Math.random() < 0.55
      ) {
        performAction(
          room,
          cpu,
          "attack"
        );
      } else {
        performAction(
          room,
          cpu,
          "kick"
        );
      }
    }

    cpu.ai.attackTimer =
      0.3 +
      Math.random() * 0.4;
  }


  /* Abilities */

  if (
    cpu.ai.abilityTimer <= 0
  ) {
    const random =
      Math.random();

    if (
      distance < 220 &&
      random < 0.4
    ) {
      performAction(
        room,
        cpu,
        "fire"
      );
    } else if (
      distance < 320 &&
      random < 0.7
    ) {
      performAction(
        room,
        cpu,
        "dash"
      );
    } else {
      performAction(
        room,
        cpu,
        "wind"
      );
    }

    cpu.ai.abilityTimer =
      1.2 +
      Math.random() * 2;
  }


  /*
    Proper jump edge detection.
  */

  const oldJump =
    cpu.previousJump;

  if (
    cpu.input.jump &&
    !oldJump
  ) {
    cpu.jumpQueued =
      true;
  }

  cpu.previousJump =
    cpu.input.jump;

  cpu.blocking =
    cpu.input.block &&
    cpu.onGround &&
    cpu.stun <= 0;
}


/* =====================================================
   PHYSICS
===================================================== */

function updatePlayer(
  room,
  player,
  dt
) {
  if (
    !player.connected
  ) {
    return;
  }


  player.attackTimer =
    Math.max(
      0,
      player.attackTimer -
      dt
    );

  player.stun =
    Math.max(
      0,
      player.stun -
      dt
    );

  player.invuln =
    Math.max(
      0,
      player.invuln -
      dt
    );


  for (
    const key of
    Object.keys(
      player.cooldowns
    )
  ) {
    player.cooldowns[key] =
      Math.max(
        0,
        player.cooldowns[key] -
        dt
      );
  }


  player.blocking =
    player.input.block &&
    player.onGround &&
    player.stun <= 0;


  /* Jump */

  if (
    player.jumpQueued &&
    player.onGround &&
    !player.blocking &&
    player.stun <= 0
  ) {
    player.vy =
      PHYSICS.jumpVelocity;

    player.onGround =
      false;
  }

  player.jumpQueued =
    false;


  /* Movement */

  if (
    player.dashTimer <= 0
  ) {
    let direction = 0;

    if (
      player.input.left
    ) {
      direction--;
    }

    if (
      player.input.right
    ) {
      direction++;
    }


    const speed =
      player.blocking
        ? PHYSICS.blockSpeed
        : PHYSICS.runSpeed;


    if (
      direction !== 0
    ) {
      player.vx =
        direction *
        speed;

      player.facing =
        direction;
    } else {
      player.vx *=
        Math.pow(
          0.001,
          dt
        );
    }
  }


  /* Gravity */

  player.vy +=
    PHYSICS.gravity *
    dt;


  player.x +=
    player.vx *
    dt;

  player.y +=
    player.vy *
    dt;


  /* Dash */

  if (
    player.dashTimer > 0
  ) {
    player.dashTimer =
      Math.max(
        0,
        player.dashTimer -
        dt
      );


    const target =
      getOpponent(
        room,
        player
      );


    if (
      !player.dashHit &&
      target.connected &&
      target.hp > 0
    ) {
      const distance =
        Math.abs(
          target.x -
          player.x
        );

      const vertical =
        Math.abs(
          target.y -
          player.y
        );


      if (
        distance < 65 &&
        vertical < 100
      ) {
        const hit =
          damagePlayer(
            room,
            player,
            target,
            18,
            "dash"
          );

        if (hit) {
          player.dashHit =
            true;
        }
      }
    }
  }


  /* Ground */

  if (
    player.y >=
    WORLD.ground
  ) {
    player.y =
      WORLD.ground;

    player.vy = 0;

    player.onGround =
      true;
  } else {
    player.onGround =
      false;
  }


  /* Bounds */

  if (
    player.x < 45
  ) {
    player.x = 45;
    player.vx = 0;
  }

  if (
    player.x >
      WORLD.width - 45
  ) {
    player.x =
      WORLD.width - 45;

    player.vx = 0;
  }
}


/* =====================================================
   PROJECTILES
===================================================== */

function updateProjectiles(
  room,
  dt
) {
  for (
    let i =
      room.projectiles.length - 1;
    i >= 0;
    i--
  ) {
    const projectile =
      room.projectiles[i];

    projectile.life -= dt;

    projectile.x +=
      projectile.vx *
      dt;

    projectile.y +=
      projectile.vy *
      dt;


    const owner =
      room.players[
        projectile.owner
      ];

    const target =
      getOpponent(
        room,
        owner
      );


    if (
      !projectile.hit &&
      target.connected &&
      target.hp > 0
    ) {
      const distance =
        Math.hypot(
          target.x -
            projectile.x,

          target.y -
            65 -
            projectile.y
        );


      if (
        distance < 65
      ) {
        projectile.hit =
          true;

        damagePlayer(
          room,
          owner,
          target,
          16,
          "wind"
        );
      }
    }


    if (
      projectile.life <= 0 ||
      projectile.x < -100 ||
      projectile.x >
        WORLD.width + 100
    ) {
      room.projectiles.splice(
        i,
        1
      );
    }
  }
}


/* =====================================================
   ROUND END
===================================================== */

function finishRound(
  room,
  winner
) {
  if (
    room.phase !==
      "fighting"
  ) {
    return;
  }

  room.started =
    false;

  room.phase =
    "round_end";

  room.roundWinner =
    winner;

  room.projectiles =
    [];


  if (
    winner === "P1" ||
    winner === "P2"
  ) {
    room.score[winner]++;
  }


  const roundsNeeded =
    Math.ceil(
      room.roundsToWin / 2
    );


  if (
    (
      winner === "P1" ||
      winner === "P2"
    ) &&
    room.score[winner] >=
      roundsNeeded
  ) {

    room.matchWinner =
      winner;

    room.phase =
      "match_end";

    return;
  }


  room.nextRoundAt =
    Date.now() +
    2200;
}


/* =====================================================
   GAME LOOP
===================================================== */

let lastTick =
  Date.now();


function tick() {
  const now =
    Date.now();

  let dt =
    (now - lastTick) /
    1000;

  lastTick =
    now;

  dt =
    Math.min(
      0.05,
      Math.max(
        0,
        dt
      )
    );


  for (
    const room
    of rooms.values()
  ) {

    /* CPU */

    if (
      room.mode ===
      "cpu"
    ) {
      updateCPU(
        room,
        room.players.P2,
        dt
      );
    }


    /* Fighting */

    if (
      room.started &&
      room.phase ===
      "fighting"
    ) {

      room.time -= dt;


      updatePlayer(
        room,
        room.players.P1,
        dt
      );

      updatePlayer(
        room,
        room.players.P2,
        dt
      );


      updateProjectiles(
        room,
        dt
      );


      if (
        room.time <= 0
      ) {

        room.time = 0;


        const p1 =
          room.players.P1;

        const p2 =
          room.players.P2;


        if (
          p1.hp >
          p2.hp
        ) {

          finishRound(
            room,
            "P1"
          );

        } else if (
          p2.hp >
          p1.hp
        ) {

          finishRound(
            room,
            "P2"
          );

        } else {

          finishRound(
            room,
            "draw"
          );

        }

      }

    }


    /* Next round */

    if (
      room.phase ===
        "round_end" &&
      room.matchWinner ===
        null &&
      Date.now() >=
        room.nextRoundAt
    ) {

      startNextRound(
        room
      );

    }

  }
}


setInterval(
  tick,
  1000 / 60
);


/* =====================================================
   STATE LOOP
===================================================== */

setInterval(
  () => {

    for (
      const room
      of rooms.values()
    ) {

      if (
        room.clients.P1 ||
        room.clients.P2
      ) {

        sendState(
          room
        );

      }

    }

  },
  1000 / 30
);


/* =====================================================
   CONNECTION
===================================================== */

wss.on(
  "connection",
  (ws) => {

    /*
      These are the important fields.
      Every socket receives an exact role.
    */

    ws.room = null;
    ws.role = null;


    send(
      ws,
      {
        type:
          "connected"
      }
    );


    ws.on(
      "message",
      (raw) => {

        let message;

        try {
          message =
            JSON.parse(
              raw.toString()
            );
        } catch {
          return;
        }


        /* ===========================================
           CREATE ONLINE ROOM
        =========================================== */

        if (
          message.type ===
            "create"
        ) {

          if (
            ws.room
          ) {
            return;
          }


          const rounds =
            Number(
              message.rounds
            ) === 10
              ? 10
              : 5;


          const room =
            makeRoom(
              "online",
              rounds
            );


          /*
            THIS IS THE FIX:
            Explicitly bind this socket to P1.
          */

          ws.room =
            room;

          ws.role =
            "P1";


          room.clients.P1 =
            ws;

          room.players.P1.connected =
            true;


          rooms.set(
            room.code,
            room
          );


          send(
            ws,
            {
              type:
                "welcome",

              role:
                "P1",

              code:
                room.code,

              mode:
                "online",

              rounds
            }
          );


          broadcastRoom(
            room
          );

          sendState(
            room
          );

          return;
        }


        /* ===========================================
           VS COMPUTER
        =========================================== */

        if (
          message.type ===
            "cpu"
        ) {

          if (
            ws.room
          ) {
            return;
          }


          const rounds =
            Number(
              message.rounds
            ) === 10
              ? 10
              : 5;


          const room =
            makeRoom(
              "cpu",
              rounds
            );


          /*
            Human ALWAYS = P1.
            CPU ALWAYS = P2.
          */

          ws.room =
            room;

          ws.role =
            "P1";


          room.clients.P1 =
            ws;

          room.players.P1.connected =
            true;

          room.players.P2.connected =
            true;

          room.players.P2.bot =
            true;


          rooms.set(
            room.code,
            room
          );


          startMatch(
            room
          );


          send(
            ws,
            {
              type:
                "welcome",

              role:
                "P1",

              code:
                room.code,

              mode:
                "cpu",

              rounds
            }
          );


          broadcastRoom(
            room
          );

          sendState(
            room
          );

          return;
        }


        /* ===========================================
           JOIN ONLINE ROOM
        =========================================== */

        if (
          message.type ===
            "join"
        ) {

          if (
            ws.room
          ) {
            return;
          }


          const code =
            String(
              message.code ||
              ""
            )
              .trim()
              .toUpperCase();


          const room =
            rooms.get(
              code
            );


          if (
            !room
          ) {

            send(
              ws,
              {
                type:
                  "error",

                message:
                  "Room not found."
              }
            );

            return;
          }


          if (
            room.mode !==
              "online"
          ) {

            send(
              ws,
              {
                type:
                  "error",

                message:
                  "This is not an online room."
              }
            );

            return;
          }


          if (
            room.clients.P2
          ) {

            send(
              ws,
              {
                type:
                  "error",

                message:
                  "Room is full."
              }
            );

            return;
          }


          /*
            THIS IS THE SECOND IMPORTANT FIX:
            Explicitly bind the joining socket to P2.
          */

          ws.room =
            room;

          ws.role =
            "P2";


          room.clients.P2 =
            ws;

          room.players.P2.connected =
            true;


          startMatch(
            room
          );


          send(
            ws,
            {
              type:
                "welcome",

              role:
                "P2",

              code:
                room.code,

              mode:
                "online",

              rounds:
                room.roundsToWin
            }
          );


          broadcastRoom(
            room
          );

          sendState(
            room
          );

          return;
        }


        /* ===========================================
           INPUT
        =========================================== */

        if (
          message.type ===
            "input"
        ) {

          if (
            !ws.room ||
            !ws.role
          ) {
            return;
          }


          /*
            Socket role is trusted.

            P1 socket can only control P1.
            P2 socket can only control P2.
          */

          const player =
            ws.room.players[
              ws.role
            ];


          if (
            !player ||
            player.bot
          ) {
            return;
          }


          setPlayerInput(
            player,
            message.input
          );

          return;
        }


        /* ===========================================
           ACTION
        =========================================== */

        if (
          message.type ===
            "action"
        ) {

          if (
            !ws.room ||
            !ws.role
          ) {
            return;
          }


          const player =
            ws.room.players[
              ws.role
            ];


          if (
            !player ||
            player.bot
          ) {
            return;
          }


          if (
            typeof message.action !==
              "string"
          ) {
            return;
          }


          performAction(
            ws.room,
            player,
            message.action
          );

          return;
        }


        /* ===========================================
           REMATCH
        =========================================== */

        if (
          message.type ===
            "rematch"
        ) {

          if (
            !ws.room ||
            !ws.role
          ) {
            return;
          }


          const room =
            ws.room;


          /*
            CPU can restart immediately.
          */

          if (
            room.mode ===
              "cpu"
          ) {

            startMatch(
              room
            );

            sendState(
              room
            );

            return;
          }


          /*
            For online play, both players
            can simply press rematch.
          */

          if (
            !room.rematch
          ) {
            room.rematch =
              new Set();
          }


          room.rematch.add(
            ws.role
          );


          if (
            room.rematch.has(
              "P1"
            ) &&
            room.rematch.has(
              "P2"
            )
          ) {

            room.rematch.clear();

            startMatch(
              room
            );

            broadcastRoom(
              room
            );

            sendState(
              room
            );

          }

          return;
        }

      }
    );


    /* ===========================================
       DISCONNECT
    =========================================== */

    ws.on(
      "close",
      () => {

        const room =
          ws.room;

        const role =
          ws.role;


        if (
          !room ||
          !role
        ) {
          return;
        }


        /*
          Only remove the exact socket
          that owns that role.
        */

        if (
          room.clients[
            role
          ] === ws
        ) {

          room.clients[
            role
          ] = null;

        }


        room.players[
          role
        ].connected =
          false;


        if (
          room.mode ===
            "cpu"
        ) {

          rooms.delete(
            room.code
          );

          return;

        }


        /*
          Online match stops when a player leaves.
        */

        room.started =
          false;

        room.phase =
          "lobby";

        room.projectiles =
          [];

        room.roundWinner =
          null;

        room.matchWinner =
          null;


        broadcastRoom(
          room
        );

        sendState(
          room
        );


        /*
          If nobody is left,
          delete room.
        */

        if (
          !room.clients.P1 &&
          !room.clients.P2
        ) {

          rooms.delete(
            room.code
          );

        }

      }
    );

  }
);


/* =====================================================
   START SERVER
===================================================== */

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "================================="
    );

    console.log(
      "   STICKMAN FIGHT SERVER"
    );

    console.log(
      "================================="
    );

    console.log(
      `Port: ${PORT}`
    );

    console.log(
      `Open: http://localhost:${PORT}`
    );

  }
);
