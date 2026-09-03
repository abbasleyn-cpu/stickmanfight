import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WebSocketServer, WebSocket } from "ws";


/* =====================================================
   BASIC SERVER
===================================================== */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

const PUBLIC_FILES = {
  "/": "index.html",
  "/index.html": "index.html",
  "/style.css": "style.css",
  "/game.js": "game.js"
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

const httpServer = http.createServer((req, res) => {
  const requestUrl = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`
  );

  const relativeFile =
    PUBLIC_FILES[requestUrl.pathname];

  if (!relativeFile) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const filePath = path.resolve(
    __dirname,
    relativeFile
  );

  const allowedRoot =
    path.resolve(__dirname);

  if (
    !filePath.startsWith(allowedRoot)
  ) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(500);
      res.end("Server error");
      return;
    }

    const ext =
      path.extname(filePath).toLowerCase();

    res.writeHead(200, {
      "Content-Type":
        MIME_TYPES[ext] ||
        "application/octet-stream"
    });

    res.end(data);
  });
});


/* =====================================================
   WEBSOCKET
===================================================== */

const wss = new WebSocketServer({
  server: httpServer
});


/* =====================================================
   GAME CONSTANTS
===================================================== */

const WORLD = {
  width: 1200,
  height: 600,
  ground: 510
};

const PHYSICS = {
  moveSpeed: 280,
  blockSpeed: 150,
  jumpVelocity: -700,
  gravity: 1800
};

const MATCH_TIME = 60;


/* =====================================================
   ROOMS
===================================================== */

const rooms = new Map();

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


function defaultInput() {
  return {
    left: false,
    right: false,
    jump: false,
    block: false
  };
}


function createPlayer(role, connected = false) {
  return {
    role,

    connected,

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

    input: defaultInput(),

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
    }
  };
}


function createRoom(code) {
  return {
    code,

    clients: new Map(),

    players: {
      P1: createPlayer("P1"),
      P2: createPlayer("P2")
    },

    started: false,

    time: MATCH_TIME,

    winner: null,

    projectiles: [],

    events: [],

    rematch: new Set()
  };
}


/* =====================================================
   SEND
===================================================== */

function send(ws, data) {
  if (
    ws &&
    ws.readyState === WebSocket.OPEN
  ) {
    ws.send(JSON.stringify(data));
  }
}


function broadcast(room, data) {
  for (const ws of room.clients.values()) {
    send(ws, data);
  }
}


/* =====================================================
   PUBLIC STATE
===================================================== */

function publicPlayer(player) {
  return {
    role: player.role,

    connected: player.connected,

    x: player.x,
    y: player.y,

    vx: player.vx,
    vy: player.vy,

    facing: player.facing,

    hp: player.hp,

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
      fire: player.cooldowns.fire,
      dash: player.cooldowns.dash,
      wind: player.cooldowns.wind
    }
  };
}


function publicState(room) {
  return {
    type: "state",

    started: room.started,

    time: Math.max(
      0,
      room.time
    ),

    winner: room.winner,

    players: {
      P1: publicPlayer(
        room.players.P1
      ),

      P2: publicPlayer(
        room.players.P2
      )
    },

    projectiles:
      room.projectiles.map((p) => ({
        id: p.id,
        kind: p.kind,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy
      })),

    events: room.events
  };
}


function broadcastState(room) {
  broadcast(
    room,
    publicState(room)
  );

  room.events = [];
}


/* =====================================================
   MATCH RESET
===================================================== */

function resetPlayer(player) {
  player.x =
    player.role === "P1"
      ? 300
      : 900;

  player.y = WORLD.ground;

  player.vx = 0;
  player.vy = 0;

  player.facing =
    player.role === "P1"
      ? 1
      : -1;

  player.hp = 100;

  player.input =
    defaultInput();

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
}


function resetMatch(room) {
  resetPlayer(room.players.P1);
  resetPlayer(room.players.P2);

  room.time = MATCH_TIME;

  room.winner = null;

  room.projectiles = [];

  room.events = [];

  room.rematch.clear();

  room.started =
    room.players.P1.connected &&
    room.players.P2.connected;
}


/* =====================================================
   ROOM MESSAGES
===================================================== */

function roomMessage(room) {
  return {
    type: "room",

    code: room.code,

    started: room.started,

    connected:
      Number(room.players.P1.connected) +
      Number(room.players.P2.connected),

    winner: room.winner
  };
}


/* =====================================================
   ACTION HELPERS
===================================================== */

function opponent(room, player) {
  return player.role === "P1"
    ? room.players.P2
    : room.players.P1;
}


function canAct(room, player) {
  return (
    room.started &&
    player.connected &&
    player.hp > 0 &&
    player.stun <= 0
  );
}


function facingOpponent(player, target) {
  const dx =
    target.x - player.x;

  return (
    Math.sign(dx) === player.facing ||
    Math.abs(dx) < 5
  );
}


/* =====================================================
   DAMAGE
===================================================== */

function damagePlayer(
  room,
  attacker,
  target,
  amount,
  type = "hit"
) {
  if (
    !target.connected ||
    target.hp <= 0 ||
    target.invuln > 0
  ) {
    return false;
  }

  let actualDamage = amount;

  if (target.blocking) {
    actualDamage =
      Math.ceil(
        amount * 0.25
      );
  }

  target.hp = Math.max(
    0,
    target.hp - actualDamage
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
        ? 90
        : 180
    );

  room.events.push({
    type: "hit",
    x: target.x,
    y: target.y - 65,
    damage: actualDamage,
    attackType: type
  });

  if (target.hp <= 0) {
    endMatch(
      room,
      attacker.role
    );
  }

  return true;
}


/* =====================================================
   MELEE
===================================================== */

function meleeAttack(
  room,
  player,
  kind
) {
  if (!canAct(room, player)) {
    return;
  }

  const cooldownName =
    kind === "punch"
      ? "punch"
      : "kick";

  if (
    player.cooldowns[cooldownName] > 0
  ) {
    return;
  }

  const target =
    opponent(room, player);

  player.attackTimer =
    kind === "punch"
      ? 0.18
      : 0.24;

  player.cooldowns[cooldownName] =
    kind === "punch"
      ? 0.30
      : 0.45;

  const distance =
    Math.abs(
      target.x - player.x
    );

  const verticalDistance =
    Math.abs(
      target.y - player.y
    );

  const range =
    kind === "punch"
      ? 125
      : 145;

  if (
    distance <= range &&
    verticalDistance <= 100 &&
    facingOpponent(player, target)
  ) {
    damagePlayer(
      room,
      player,
      target,
      kind === "punch"
        ? 9
        : 12,
      kind
    );
  }
}


/* =====================================================
   FIRE FIST
===================================================== */

function fireFist(room, player) {
  if (!canAct(room, player)) {
    return;
  }

  if (
    player.cooldowns.fire > 0
  ) {
    return;
  }

  const target =
    opponent(room, player);

  player.cooldowns.fire = 2.5;

  room.events.push({
    type: "fire",
    x: player.x +
      player.facing * 80,

    y: player.y - 65,

    direction:
      player.facing
  });

  const distance =
    Math.abs(
      target.x - player.x
    );

  const verticalDistance =
    Math.abs(
      target.y - player.y
    );

  if (
    distance <= 190 &&
    verticalDistance <= 110 &&
    facingOpponent(player, target)
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


/* =====================================================
   LIGHTNING DASH
===================================================== */

function lightningDash(room, player) {
  if (!canAct(room, player)) {
    return;
  }

  if (
    player.cooldowns.dash > 0
  ) {
    return;
  }

  player.cooldowns.dash = 4;

  player.dashTimer = 0.28;

  player.dashHit = false;

  player.invuln =
    Math.max(
      player.invuln,
      0.18
    );

  player.vx =
    player.facing * 850;

  room.events.push({
    type: "dash",
    x: player.x,
    y: player.y - 60,
    direction: player.facing
  });
}


/* =====================================================
   WIND SLASH
===================================================== */

function windSlash(room, player) {
  if (!canAct(room, player)) {
    return;
  }

  if (
    player.cooldowns.wind > 0
  ) {
    return;
  }

  player.cooldowns.wind = 3;

  const id =
    Date.now() +
    Math.random();

  room.projectiles.push({
    id,

    kind: "wind",

    owner: player.role,

    x:
      player.x +
      player.facing * 60,

    y:
      player.y - 65,

    vx:
      player.facing * 650,

    vy: 0,

    life: 0.85,

    hit: false
  });

  room.events.push({
    type: "wind",

    x:
      player.x +
      player.facing * 55,

    y:
      player.y - 65,

    direction:
      player.facing
  });
}


/* =====================================================
   ACTION DISPATCH
===================================================== */

function action(room, player, actionName) {
  switch (actionName) {

    case "attack":
      meleeAttack(
        room,
        player,
        "punch"
      );
      break;

    case "kick":
      meleeAttack(
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

function applyInput(player, incoming) {
  const oldJump =
    player.input.jump;

  const next =
    defaultInput();

  if (
    incoming &&
    typeof incoming === "object"
  ) {
    next.left =
      Boolean(incoming.left);

    next.right =
      Boolean(incoming.right);

    next.jump =
      Boolean(incoming.jump);

    next.block =
      Boolean(incoming.block);
  }

  player.input = next;

  player.blocking =
    player.input.block &&
    player.onGround &&
    player.stun <= 0;

  if (
    player.input.jump &&
    !oldJump
  ) {
    player.jumpQueued = true;
  }
}


/* =====================================================
   PHYSICS
===================================================== */

function updatePlayer(
  room,
  player,
  dt
) {
  if (!player.connected) {
    return;
  }

  player.attackTimer =
    Math.max(
      0,
      player.attackTimer - dt
    );

  player.stun =
    Math.max(
      0,
      player.stun - dt
    );

  player.invuln =
    Math.max(
      0,
      player.invuln - dt
    );

  for (const key of Object.keys(
    player.cooldowns
  )) {
    player.cooldowns[key] =
      Math.max(
        0,
        player.cooldowns[key] - dt
      );
  }

  player.blocking =
    player.input.block &&
    player.onGround &&
    player.stun <= 0;


  /* ================= JUMP ================= */

  if (
    player.jumpQueued &&
    player.onGround &&
    !player.blocking &&
    player.stun <= 0
  ) {
    player.vy =
      PHYSICS.jumpVelocity;

    player.onGround = false;
  }

  player.jumpQueued = false;


  /* ================= MOVEMENT ================= */

  if (
    player.dashTimer <= 0
  ) {
    let direction = 0;

    if (player.input.left) {
      direction -= 1;
    }

    if (player.input.right) {
      direction += 1;
    }

    const maxSpeed =
      player.blocking
        ? PHYSICS.blockSpeed
        : PHYSICS.moveSpeed;

    if (direction !== 0) {
      player.vx =
        direction * maxSpeed;

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


  /* ================= GRAVITY ================= */

  player.vy +=
    PHYSICS.gravity * dt;

  player.x +=
    player.vx * dt;

  player.y +=
    player.vy * dt;


  /* ================= DASH ================= */

  if (
    player.dashTimer > 0
  ) {
    player.dashTimer =
      Math.max(
        0,
        player.dashTimer - dt
      );

    const target =
      opponent(room, player);

    if (
      !player.dashHit &&
      target.connected &&
      target.hp > 0
    ) {
      const distance =
        Math.abs(
          target.x - player.x
        );

      const vertical =
        Math.abs(
          target.y - player.y
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
          player.dashHit = true;
        }
      }
    }
  }


  /* ================= GROUND ================= */

  if (
    player.y >= WORLD.ground
  ) {
    player.y =
      WORLD.ground;

    player.vy = 0;

    player.onGround = true;
  } else {
    player.onGround = false;
  }


  /* ================= BOUNDS ================= */

  const margin = 45;

  if (
    player.x < margin
  ) {
    player.x = margin;
    player.vx = 0;
  }

  if (
    player.x >
    WORLD.width - margin
  ) {
    player.x =
      WORLD.width - margin;

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
    let i = room.projectiles.length - 1;
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
      room.players[p.owner];

    const target =
      opponent(room, owner);

    if (
      !p.hit &&
      target.connected &&
      target.hp > 0
    ) {
      const distance =
        Math.hypot(
          target.x - p.x,
          (target.y - 65) - p.y
        );

      if (distance < 65) {
        p.hit = true;

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
      p.life <= 0 ||
      p.x < -100 ||
      p.x > WORLD.width + 100
    ) {
      room.projectiles.splice(
        i,
        1
      );
    }
  }
}


/* =====================================================
   MATCH END
===================================================== */

function endMatch(room, winner) {
  if (!room.started) {
    return;
  }

  room.started = false;

  room.winner = winner;

  room.events.push({
    type: "ko",
    winner
  });

  broadcast(
    room,
    roomMessage(room)
  );
}


/* =====================================================
   TICK
===================================================== */

let lastTick =
  Date.now();

function gameTick() {
  const now =
    Date.now();

  let dt =
    (now - lastTick) / 1000;

  lastTick = now;

  dt = Math.min(
    0.05,
    Math.max(0, dt)
  );


  for (const room of rooms.values()) {

    if (
      room.started &&
      room.players.P1.connected &&
      room.players.P2.connected
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
          endMatch(
            room,
            "P1"
          );
        } else if (
          p2.hp > p1.hp
        ) {
          endMatch(
            room,
            "P2"
          );
        } else {
          endMatch(
            room,
            "draw"
          );
        }
      }
    }
  }
}

setInterval(
  gameTick,
  1000 / 60
);


/* =====================================================
   BROADCAST LOOP
===================================================== */

setInterval(() => {
  for (const room of rooms.values()) {

    if (
      room.clients.size > 0
    ) {
      broadcastState(room);
    }

  }
}, 1000 / 30);


/* =====================================================
   WEBSOCKET CONNECTIONS
===================================================== */

wss.on("connection", (ws) => {

  ws.room = null;
  ws.role = null;


  send(ws, {
    type: "connected"
  });


  ws.on("message", (raw) => {

    let msg;

    try {
      msg =
        JSON.parse(
          raw.toString()
        );
    } catch {
      return;
    }


    /* ================= CREATE ================= */

    if (
      msg.type === "create"
    ) {

      if (ws.room) {
        return;
      }

      const code =
        randomRoomCode();

      const room =
        createRoom(code);

      room.players.P1.connected =
        true;

      room.clients.set(
        "P1",
        ws
      );

      ws.room = room;
      ws.role = "P1";

      rooms.set(
        code,
        room
      );

      send(ws, {
        type: "welcome",
        role: "P1",
        code
      });

      send(
        ws,
        roomMessage(room)
      );

      broadcastState(room);

      return;
    }


    /* ================= JOIN ================= */

    if (
      msg.type === "join"
    ) {

      if (ws.room) {
        return;
      }

      const code =
        String(
          msg.code || ""
        )
        .trim()
        .toUpperCase();

      const room =
        rooms.get(code);

      if (!room) {
        send(ws, {
          type: "error",
          message: "Room not found."
        });

        return;
      }

      let role = null;

      if (
        !room.players.P1.connected
      ) {
        role = "P1";
      } else if (
        !room.players.P2.connected
      ) {
        role = "P2";
      }

      if (!role) {
        send(ws, {
          type: "error",
          message: "Room is full."
        });

        return;
      }

      const player =
        room.players[role];

      player.connected = true;

      room.clients.set(
        role,
        ws
      );

      ws.room = room;
      ws.role = role;


      send(ws, {
        type: "welcome",
        role,
        code
      });


      if (
        room.players.P1.connected &&
        room.players.P2.connected
      ) {
        resetMatch(room);
      }


      broadcast(
        room,
        roomMessage(room)
      );

      broadcastState(room);

      return;
    }


    /* ================= INPUT ================= */

    if (
      msg.type === "input"
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

      applyInput(
        player,
        msg.input
      );

      return;
    }


    /* ================= ACTION ================= */

    if (
      msg.type === "action"
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
        typeof msg.action !==
        "string"
      ) {
        return;
      }

      action(
        ws.room,
        player,
        msg.action
      );

      return;
    }


    /* ================= REMATCH ================= */

    if (
      msg.type === "rematch"
    ) {

      if (
        !ws.room ||
        !ws.role
      ) {
        return;
      }

      const room =
        ws.room;

      room.rematch.add(
        ws.role
      );

      if (
        room.rematch.has("P1") &&
        room.rematch.has("P2") &&
        room.players.P1.connected &&
        room.players.P2.connected
      ) {
        resetMatch(room);

        broadcast(
          room,
          roomMessage(room)
        );

        broadcastState(room);
      }

      return;
    }

  });


  /* ===================================================
     DISCONNECT
  ================================================== */

  ws.on("close", () => {

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

    if (
      room.clients.get(role) === ws
    ) {
      room.clients.delete(role);
    }

    const player =
      room.players[role];

    if (player) {
      player.connected = false;
      player.input = defaultInput();
      player.blocking = false;
    }

    room.started = false;

    room.winner = null;

    room.projectiles = [];

    room.rematch.clear();


    if (
      room.clients.size === 0
    ) {
      rooms.delete(
        room.code
      );

      return;
    }


    broadcast(
      room,
      roomMessage(room)
    );

    broadcastState(room);
  });

});


/* =====================================================
   START SERVER
===================================================== */

httpServer.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Stickman Fight running on port ${PORT}`
    );

    console.log(
      `Open http://localhost:${PORT}`
    );
  }
);
