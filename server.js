import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

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

    const filename = FILES[url.pathname];

    if (!filename) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const fullPath = path.join(__dirname, filename);

    fs.readFile(fullPath, (err, data) => {
      if (err) {
        console.error(err);
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
    });
  } catch {
    res.writeHead(500);
    res.end("Server error");
  }
});

const wss = new WebSocketServer({
  server
});

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

const ROOM_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

let projectileId = 1;


function randomRoomCode() {
  let code;

  do {
    code = "";

    for (let i = 0; i < 6; i++) {
      code +=
        ROOM_CHARS[
          Math.floor(
            Math.random() * ROOM_CHARS.length
          )
        ];
    }
  } while (rooms.has(code));

  return code;
}


function emptyInput() {
  return {
    left: false,
    right: false,
    jump: false,
    block: false
  };
}


function createPlayer(role, options = {}) {
  const isCPU =
    options.bot === true;

  return {
    role,

    bot: isCPU,

    connected:
      options.connected === true,

    x:
      role === "P1"
        ? 300
        : 900,

    y:
      WORLD.ground,

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
      fire: 0,
      dash: 0,
      wind: 0,
      punch: 0,
      kick: 0
    },

    ai: {
      decisionTimer: 0,
      attackTimer: 0.7,
      abilityTimer: 1.5,
      jumpTimer: 1.0
    }
  };
}


function createRoom(mode, rounds) {
  const isCPU =
    mode === "cpu";

  return {
    code: randomRoomCode(),

    mode,

    roundsToWin:
      rounds === 10
        ? 10
        : 5,

    players: {
      P1: createPlayer("P1", {
        connected: false,
        bot: false
      }),

      P2: createPlayer("P2", {
        connected: isCPU,
        bot: isCPU
      })
    },

    clients: new Set(),

    round: 1,

    score: {
      P1: 0,
      P2: 0
    },

    phase: "lobby",

    started: false,

    time: ROUND_TIME,

    roundWinner: null,

    matchWinner: null,

    projectiles: [],

    events: [],

    nextRoundAt: 0
  };
}


function send(ws, message) {
  if (
    ws &&
    ws.readyState ===
      WebSocket.OPEN
  ) {
    ws.send(
      JSON.stringify(message)
    );
  }
}


function broadcast(room, message) {
  for (const ws of room.clients) {
    send(ws, message);
  }
}


function getOpponent(room, player) {
  return player.role === "P1"
    ? room.players.P2
    : room.players.P1;
}


function publicPlayer(player) {
  return {
    role: player.role,

    bot: player.bot,

    connected: player.connected,

    x: player.x,
    y: player.y,

    vx: player.vx,
    vy: player.vy,

    facing: player.facing,

    hp: player.hp,

    blocking: player.blocking,

    onGround: player.onGround,

    attackTimer:
      player.attackTimer,

    dashTimer:
      player.dashTimer,

    stun: player.stun,

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


function stateMessage(room) {
  return {
    type: "state",

    mode: room.mode,

    started: room.started,

    phase: room.phase,

    time: Math.max(
      0,
      room.time
    ),

    round: room.round,

    roundsToWin:
      room.roundsToWin,

    scores: {
      P1: room.score.P1,
      P2: room.score.P2
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
        (p) => ({
          id: p.id,
          kind: p.kind,
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy
        })
      ),

    events:
      room.events
  };
}


function broadcastState(room) {
  broadcast(
    room,
    stateMessage(room)
  );

  room.events = [];
}


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

  player.input = emptyInput();

  player.previousJump = false;
  player.jumpQueued = false;

  player.onGround = true;
  player.blocking = false;

  player.attackTimer = 0;

  player.dashTimer = 0;
  player.dashHit = false;

  player.stun = 0;
  player.invuln = 0;

  player.cooldowns.fire = 0;
  player.cooldowns.dash = 0;
  player.cooldowns.wind = 0;
  player.cooldowns.punch = 0;
  player.cooldowns.kick = 0;

  player.ai.decisionTimer = 0;
  player.ai.attackTimer = 0.5;
  player.ai.abilityTimer = 1.2;
  player.ai.jumpTimer = 0.8;
}


function startMatch(room) {
  room.round = 1;

  room.score.P1 = 0;
  room.score.P2 = 0;

  room.roundWinner = null;
  room.matchWinner = null;

  room.projectiles = [];

  resetPlayer(
    room.players.P1
  );

  resetPlayer(
    room.players.P2
  );

  room.time =
    ROUND_TIME;

  room.phase =
    "fighting";

  room.started = true;
}


function startNextRound(room) {
  room.round++;

  room.roundWinner = null;

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

  room.started = true;
}


function finishRound(room, winner) {
  if (
    room.phase !==
    "fighting"
  ) {
    return;
  }

  room.started = false;

  room.phase =
    "round_end";

  room.roundWinner =
    winner;

  if (
    winner === "P1" ||
    winner === "P2"
  ) {
    room.score[winner]++;
  }

  room.projectiles = [];

  const needed =
    Math.ceil(
      room.roundsToWin / 2
    );

  if (
    winner !== "draw" &&
    room.score[winner] >= needed
  ) {
    room.matchWinner =
      winner;

    room.phase =
      "match_end";
  } else {
    room.nextRoundAt =
      Date.now() + 2200;
  }
}


function facingTarget(player, target) {
  const dx =
    target.x - player.x;

  return (
    Math.sign(dx) ===
      player.facing ||
    Math.abs(dx) < 5
  );
}


function canFight(room, player) {
  return (
    room.phase === "fighting" &&
    room.started &&
    player.connected &&
    player.hp > 0 &&
    player.stun <= 0
  );
}


function damage(
  room,
  attacker,
  target,
  amount,
  attackType
) {
  if (
    !target.connected ||
    target.hp <= 0 ||
    target.invuln > 0
  ) {
    return false;
  }

  let actual =
    amount;

  if (
    target.blocking
  ) {
    actual =
      Math.ceil(
        amount * 0.25
      );
  }

  target.hp =
    Math.max(
      0,
      target.hp - actual
    );

  target.invuln =
    target.blocking
      ? 0.06
      : 0.12;

  target.stun =
    target.blocking
      ? 0.04
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

    damage: actual,

    attackType
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

  const cooldownName =
    type === "punch"
      ? "punch"
      : "kick";

  if (
    player.cooldowns[
      cooldownName
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
    cooldownName
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
    damage(
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
    damage(
      room,
      player,
      target,
      28,
      "fire"
    );
  }
}


function dash(
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
    0.30;

  player.dashHit =
    false;

  player.invuln =
    Math.max(
      player.invuln,
      0.20
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


function wind(
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
    id: projectileId++,

    kind: "wind",

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

    life: 0.9,

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
      dash(
        room,
        player
      );
      break;

    case "wind":
      wind(
        room,
        player
      );
      break;
  }
}


function setInput(
  player,
  incoming
) {
  const oldJump =
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
    !oldJump
  ) {
    player.jumpQueued =
      true;
  }

  player.blocking =
    next.block &&
    player.onGround &&
    player.stun <= 0;
}


/* =========================================================
   CPU AI
========================================================= */

function updateCPU(
  room,
  cpu,
  dt
) {
  if (
    !room.started ||
    room.phase !==
      "fighting"
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

  cpu.ai.decisionTimer -= dt;
  cpu.ai.attackTimer -= dt;
  cpu.ai.abilityTimer -= dt;
  cpu.ai.jumpTimer -= dt;


  const dx =
    target.x - cpu.x;

  const distance =
    Math.abs(dx);


  /*
    Always face the player.
  */

  if (
    Math.abs(dx) > 3
  ) {
    cpu.facing =
      dx > 0
        ? 1
        : -1;
  }


  /*
    Make the CPU movement continuous.
    This fixes the old AI which could appear
    frozen between decisions.
  */

  cpu.input.left =
    false;

  cpu.input.right =
    false;


  cpu.input.jump =
    false;


  /*
    Move toward the player until
    we're inside attack range.
  */

  if (
    distance > 115
  ) {
    if (dx > 0) {
      cpu.input.right =
        true;
    } else {
      cpu.input.left =
        true;
    }
  }


  /*
    Occasionally back away when very close.
  */

  if (
    distance < 75 &&
    Math.random() < 0.015
  ) {
    if (dx > 0) {
      cpu.input.left =
        true;
    } else {
      cpu.input.right =
        true;
    }
  }


  /*
    Block sometimes.
  */

  cpu.input.block =
    distance < 125 &&
    target.attackTimer > 0 &&
    Math.random() < 0.35;


  /*
    Jump.
  */

  if (
    cpu.ai.jumpTimer <= 0 &&
    cpu.onGround &&
    Math.random() < 0.75
  ) {
    cpu.input.jump =
      true;

    cpu.ai.jumpTimer =
      1.0 +
      Math.random() *
      1.5;
  }


  /*
    CPU attacks.
  */

  if (
    cpu.ai.attackTimer <= 0
  ) {
    if (
      distance < 145
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
      0.25 +
      Math.random() *
      0.45;
  }


  /*
    CPU abilities.
  */

  if (
    cpu.ai.abilityTimer <= 0
  ) {
    const roll =
      Math.random();

    if (
      distance < 220 &&
      roll < 0.40
    ) {
      performAction(
        room,
        cpu,
        "fire"
      );
    } else if (
      distance < 300 &&
      roll < 0.70
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
      1.0 +
      Math.random() *
      2;
  }


  /*
    Jump must use edge detection.
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


/* =========================================================
   PLAYER PHYSICS
========================================================= */

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
    const key
    of Object.keys(
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


  /*
    Movement
  */

  if (
    player.dashTimer <= 0
  ) {
    let direction = 0;

    if (player.input.left) {
      direction--;
    }

    if (player.input.right) {
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
        direction * speed;

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


  /*
    Gravity
  */

  player.vy +=
    PHYSICS.gravity *
    dt;


  player.x +=
    player.vx *
    dt;


  player.y +=
    player.vy *
    dt;


  /*
    Dash
  */

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
          damage(
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


  /*
    Ground collision
  */

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


  /*
    Arena bounds
  */

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


/* =========================================================
   PROJECTILES
========================================================= */

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
    const p =
      room.projectiles[i];

    p.life -= dt;

    p.x +=
      p.vx * dt;

    p.y +=
      p.vy * dt;


    const owner =
      room.players[
        p.owner
      ];

    const target =
      getOpponent(
        room,
        owner
      );


    if (
      !p.hit &&
      target.connected &&
      target.hp > 0
    ) {
      const distance =
        Math.hypot(
          target.x - p.x,
          target.y -
            65 -
            p.y
        );


      if (
        distance < 65
      ) {
        p.hit =
          true;

        damage(
          room,
          owner,
          target,
          16,
          "wind"
        );
      }
    }


    if (
      p.life <= 0 ||
      p.x < -100 ||
      p.x >
        WORLD.width + 100
    ) {
      room.projectiles.splice(
        i,
        1
      );
    }
  }
}


/* =========================================================
   MAIN GAME LOOP
========================================================= */

let lastTime =
  Date.now();


function gameTick() {
  const now =
    Date.now();

  let dt =
    (now - lastTime) /
    1000;

  lastTime =
    now;

  dt =
    Math.max(
      0,
      Math.min(
        0.05,
        dt
      )
    );


  for (
    const room
    of rooms.values()
  ) {

    /*
      CPU gets processed every tick.
    */

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


    /*
      Fighting.
    */

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
          p1.hp > p2.hp
        ) {
          finishRound(
            room,
            "P1"
          );
        } else if (
          p2.hp > p1.hp
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


    /*
      Next round.
    */

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
  gameTick,
  1000 / 60
);


/* =========================================================
   BROADCAST LOOP
========================================================= */

setInterval(
  () => {

    for (
      const room
      of rooms.values()
    ) {

      if (
        room.clients.size > 0
      ) {
        broadcastState(
          room
        );
      }
    }

  },
  1000 / 30
);


/* =========================================================
   WEBSOCKET
========================================================= */

wss.on(
  "connection",
  (ws) => {

    ws.room = null;


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


        /* =============================================
           VS COMPUTER
        ============================================= */

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
            createRoom(
              "cpu",
              rounds
            );


          /*
            Human is P1.
            CPU is P2.
          */

          room.players.P1.connected =
            true;

          room.players.P1.bot =
            false;


          room.players.P2.connected =
            true;

          room.players.P2.bot =
            true;


          room.clients.add(
            ws
          );


          ws.room =
            room;


          /*
            THIS is important:
            start immediately.
          */

          startMatch(
            room
          );


          /*
            Keep the CPU room in
            the room map.
          */

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
                "cpu",

              rounds
            }
          );


          broadcastState(
            room
          );


          return;
        }


        /* =============================================
           CREATE ONLINE ROOM
        ============================================= */

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
            createRoom(
              "online",
              rounds
            );


          room.players.P1.connected =
            true;


          room.code =
            randomRoomCode();


          rooms.set(
            room.code,
            room
          );


          room.clients.add(
            ws
          );


          ws.room =
            room;


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


          broadcastState(
            room
          );


          return;
        }


        /* =============================================
           JOIN ONLINE ROOM
        ============================================= */

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
            room.players.P2.connected
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


          room.players.P2.connected =
            true;


          room.clients.add(
            ws
          );


          ws.room =
            room;


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


          startMatch(
            room
          );


          broadcastState(
            room
          );


          return;
        }


        /* =============================================
           INPUT
        ============================================= */

        if (
          message.type ===
            "input"
        ) {

          if (
            !ws.room
          ) {
            return;
          }


          /*
            CPU is never controlled
            by the browser.
          */

          const role =
            ws.role ||
            "P1";


          const player =
            ws.room.players[
              role
            ];


          if (
            !player ||
            player.bot
          ) {
            return;
          }


          setInput(
            player,
            message.input
          );


          return;
        }


        /* =============================================
           ACTION
        ============================================= */

        if (
          message.type ===
            "action"
        ) {

          if (
            !ws.room
          ) {
            return;
          }


          const role =
            ws.role ||
            "P1";


          const player =
            ws.room.players[
              role
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


        /* =============================================
           REMATCH
        ============================================= */

        if (
          message.type ===
            "rematch"
        ) {

          if (
            !ws.room
          ) {
            return;
          }


          startMatch(
            ws.room
          );


          broadcastState(
            ws.room
          );


          return;
        }

      }
    );


    /* ===============================================
       DISCONNECT
    =============================================== */

    ws.on(
      "close",
      () => {

        const room =
          ws.room;


        if (
          !room
        ) {
          return;
        }


        room.clients.delete(
          ws
        );


        if (
          room.mode ===
            "cpu"
        ) {

          rooms.delete(
            room.code
          );

          return;
        }


        room.players.P1.connected =
          room.clientsHasP1;

        room.players.P2.connected =
          room.clientsHasP2;


        /*
          Simpler handling:
          stop the match if either
          online player leaves.
        */

        room.started =
          false;

        room.phase =
          "lobby";

        room.projectiles =
          [];

        if (
          room.clients.size ===
            0
        ) {
          rooms.delete(
            room.code
          );
        }

      }
    );

  }
);


/* =========================================================
   FIX ONLINE CLIENT ROLE TRACKING
========================================================= */

wss.on(
  "connection",
  (ws) => {

    /*
      This second listener is intentionally harmless.
      Role gets assigned in the message handler below.
    */

  }
);


/*
  Re-create role tracking using a small wrapper around
  the original message handling behavior.
*/

const originalConnectionHandler = null;


/* =========================================================
   BETTER ONLINE ROLE TRACKING
========================================================= */

/*
  ws.role is assigned below by inspecting which player
  owns the connected socket through the room client map.
*/

setInterval(
  () => {

    for (
      const room
      of rooms.values()
    ) {

      if (
        room.mode !==
          "online"
      ) {
        continue;
      }

      /*
        First client in an online room = P1
        Second client = P2
      */

      const clients =
        Array.from(
          room.clients
        );

      if (
        clients[0]
      ) {
        clients[0].role =
          "P1";
      }

      if (
        clients[1]
      ) {
        clients[1].role =
          "P2";
      }

    }

  },
  100
);


/* =========================================================
   START SERVER
========================================================= */

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Stickman Fight running on port ${PORT}`
    );

    console.log(
      `http://localhost:${PORT}`
    );

  }
);
