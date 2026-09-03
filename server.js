import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

const WORLD = {
  width: 1200,
  height: 600,
  ground: 500
};

const MAX_PLAYERS = 2;
const ROUND_TIME = 90;

const rooms = new Map();

let nextEffectId = 1;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === "/") {
      pathname = "/index.html";
    }

    const filePath = path.resolve(
      __dirname,
      "." + pathname
    );

    if (
      filePath !== __dirname &&
      !filePath.startsWith(__dirname + path.sep)
    ) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      res.writeHead(200, {
        "Content-Type":
          MIME[path.extname(filePath)] ||
          "application/octet-stream"
      });

      res.end(data);
    });
  } catch {
    res.writeHead(400);
    res.end("Bad request");
  }
});

const wss = new WebSocketServer({
  server
});

function send(ws, message) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(message));
  }
}

function broadcast(room, message) {
  for (const player of room.players.values()) {
    send(player.ws, message);
  }
}

function createCode() {
  const characters =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code;

  do {
    code = "";

    for (let i = 0; i < 6; i++) {
      code += characters[
        Math.floor(Math.random() * characters.length)
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

function createPlayer(id) {
  const isOne = id === 1;

  return {
    id,

    ws: null,

    connected: false,

    x: isOne ? 250 : 950,
    y: WORLD.ground,

    vx: 0,
    vy: 0,

    facing: isOne ? 1 : -1,

    hp: 100,

    maxHp: 100,

    input: emptyInput(),

    wasJumping: false,

    grounded: true,

    state: "idle",

    attackTimer: 0,
    attackCooldown: 0,

    hitStun: 0,

    dashTimer: 0,
    dashHit: false,

    invulnerable: 0,

    abilityCooldowns: {
      fire: 0,
      dash: 0,
      wind: 0
    }
  };
}

function createRoom() {
  const code = createCode();

  const room = {
    code,

    players: new Map([
      [1, createPlayer(1)],
      [2, createPlayer(2)]
    ]),

    started: false,
    finished: false,

    time: ROUND_TIME,

    projectiles: [],

    effects: [],

    rematch: new Set(),

    lastTick: Date.now()
  };

  rooms.set(code, room);

  return room;
}

function resetPlayer(player) {
  const isOne = player.id === 1;

  player.x = isOne ? 250 : 950;
  player.y = WORLD.ground;

  player.vx = 0;
  player.vy = 0;

  player.facing = isOne ? 1 : -1;

  player.hp = 100;

  player.input = emptyInput();

  player.wasJumping = false;
  player.grounded = true;

  player.state = "idle";

  player.attackTimer = 0;
  player.attackCooldown = 0;

  player.hitStun = 0;

  player.dashTimer = 0;
  player.dashHit = false;

  player.invulnerable = 0;

  player.abilityCooldowns = {
    fire: 0,
    dash: 0,
    wind: 0
  };
}

function startRound(room) {
  for (const player of room.players.values()) {
    resetPlayer(player);
  }

  room.projectiles = [];
  room.effects = [];

  room.time = ROUND_TIME;

  room.started = true;
  room.finished = false;

  room.rematch.clear();

  broadcastRoom(room);
}

function broadcastRoom(room) {
  broadcast(room, {
    type: "roomState",
    code: room.code,
    players: [...room.players.values()]
      .filter(p => p.connected)
      .map(p => p.id),
    started: room.started,
    finished: room.finished,
    time: room.time
  });
}

function getOpponent(room, player) {
  for (const other of room.players.values()) {
    if (
      other.id !== player.id &&
      other.connected
    ) {
      return other;
    }
  }

  return null;
}

function addEffect(room, effect) {
  room.effects.push({
    id: nextEffectId++,
    ...effect
  });
}

function canAct(player) {
  return (
    player.connected &&
    player.hp > 0 &&
    player.hitStun <= 0
  );
}

function dealDamage(
  room,
  attacker,
  target,
  damage,
  knockback,
  stun
) {
  if (!target.connected) return;

  if (target.invulnerable > 0) {
    return;
  }

  let finalDamage = damage;

  if (target.input.block) {
    finalDamage = Math.max(
      1,
      Math.floor(damage * 0.25)
    );
  }

  target.hp = Math.max(
    0,
    target.hp - finalDamage
  );

  target.hitStun = stun;

  target.vx +=
    attacker.facing *
    knockback;

  addEffect(room, {
    type: "hit",
    x: target.x,
    y: target.y - 80,
    damage: finalDamage
  });

  if (target.hp <= 0) {
    finishRound(room, attacker.id);
  }
}

function meleeAttack(
  room,
  player,
  damage,
  range,
  knockback,
  stun,
  type
) {
  if (!canAct(player)) return;

  if (player.attackCooldown > 0) {
    return;
  }

  const opponent = getOpponent(room, player);

  if (!opponent) return;

  player.attackCooldown = 0.38;
  player.attackTimer = 0.2;
  player.state = type;

  const dx = opponent.x - player.x;

  const facingTarget =
    Math.sign(dx) === player.facing;

  if (
    Math.abs(dx) <= range &&
    Math.abs(opponent.y - player.y) < 110 &&
    facingTarget
  ) {
    dealDamage(
      room,
      player,
      opponent,
      damage,
      knockback,
      stun
    );
  }

  addEffect(room, {
    type,
    x: player.x + player.facing * 60,
    y: player.y - 80
  });
}

function fireFist(room, player) {
  if (!canAct(player)) return;

  if (player.abilityCooldowns.fire > 0) {
    return;
  }

  player.abilityCooldowns.fire = 4;

  player.state = "fire";

  const opponent = getOpponent(room, player);

  addEffect(room, {
    type: "fire",
    x: player.x + player.facing * 75,
    y: player.y - 80
  });

  if (!opponent) return;

  const dx = opponent.x - player.x;

  if (
    Math.abs(dx) <= 210 &&
    Math.sign(dx) === player.facing &&
    Math.abs(opponent.y - player.y) < 120
  ) {
    dealDamage(
      room,
      player,
      opponent,
      28,
      330,
      0.25
    );
  }
}

function lightningDash(room, player) {
  if (!canAct(player)) return;

  if (player.abilityCooldowns.dash > 0) {
    return;
  }

  player.abilityCooldowns.dash = 6;

  player.dashTimer = 0.18;
  player.dashHit = false;
  player.invulnerable = 0.22;

  player.state = "dash";

  addEffect(room, {
    type: "dash",
    x: player.x,
    y: player.y - 50
  });
}

function windSlash(room, player) {
  if (!canAct(player)) return;

  if (player.abilityCooldowns.wind > 0) {
    return;
  }

  player.abilityCooldowns.wind = 5;

  player.state = "wind";

  room.projectiles.push({
    owner: player.id,

    x: player.x + player.facing * 60,
    y: player.y - 70,

    vx: player.facing * 650,

    life: 1.2,

    damage: 18,

    hit: false
  });

  addEffect(room, {
    type: "wind",
    x: player.x + player.facing * 60,
    y: player.y - 70
  });
}

function handleAction(room, player, action) {
  if (!room.started || room.finished) {
    return;
  }

  if (action === "attack") {
    meleeAttack(
      room,
      player,
      12,
      145,
      180,
      0.14,
      "attack"
    );
  }

  if (action === "kick") {
    meleeAttack(
      room,
      player,
      16,
      155,
      240,
      0.2,
      "kick"
    );
  }

  if (action === "fire") {
    fireFist(room, player);
  }

  if (action === "dash") {
    lightningDash(room, player);
  }

  if (action === "wind") {
    windSlash(room, player);
  }
}

function updatePlayer(room, player, dt) {
  if (!player.connected) return;

  player.attackCooldown =
    Math.max(
      0,
      player.attackCooldown - dt
    );

  player.attackTimer =
    Math.max(
      0,
      player.attackTimer - dt
    );

  player.hitStun =
    Math.max(
      0,
      player.hitStun - dt
    );

  player.invulnerable =
    Math.max(
      0,
      player.invulnerable - dt
    );

  for (const key of Object.keys(
    player.abilityCooldowns
  )) {
    player.abilityCooldowns[key] =
      Math.max(
        0,
        player.abilityCooldowns[key] - dt
      );
  }

  if (player.hp <= 0) {
    return;
  }

  if (player.hitStun > 0) {
    player.vx *= 0.9;
  } else if (player.dashTimer > 0) {
    player.dashTimer =
      Math.max(
        0,
        player.dashTimer - dt
      );

    player.vx =
      player.facing * 850;

    player.x += player.vx * dt;

    if (!player.dashHit) {
      const opponent =
        getOpponent(room, player);

      if (
        opponent &&
        Math.abs(opponent.x - player.x) < 90 &&
        Math.abs(opponent.y - player.y) < 120
      ) {
        player.dashHit = true;

        dealDamage(
          room,
          player,
          opponent,
          20,
          450,
          0.3
        );
      }
    }
  } else {
    const direction =
      (player.input.right ? 1 : 0) -
      (player.input.left ? 1 : 0);

    const speed =
      player.input.block
        ? 145
        : 300;

    if (direction !== 0) {
      player.vx =
        direction * speed;

      player.facing = direction;
    } else {
      player.vx *= 0.78;
    }

    player.x += player.vx * dt;

    if (
      player.input.jump &&
      !player.wasJumping &&
      player.grounded &&
      !player.input.block
    ) {
      player.vy = -700;
      player.grounded = false;
    }

    player.wasJumping =
      player.input.jump;
  }

  player.vy += 1900 * dt;

  player.y +=
    player.vy * dt;

  if (player.y >= WORLD.ground) {
    player.y = WORLD.ground;
    player.vy = 0;
    player.grounded = true;
  }

  player.x = Math.max(
    70,
    Math.min(
      WORLD.width - 70,
      player.x
    )
  );

  if (player.attackTimer <= 0) {
    if (player.dashTimer <= 0) {
      if (player.input.block) {
        player.state = "block";
      } else {
        player.state = "idle";
      }
    }
  }
}

function updateProjectiles(room, dt) {
  const remaining = [];

  for (const projectile of room.projectiles) {
    projectile.x +=
      projectile.vx * dt;

    projectile.life -= dt;

    if (
      projectile.life <= 0 ||
      projectile.x < -100 ||
      projectile.x > WORLD.width + 100
    ) {
      continue;
    }

    const target =
      [...room.players.values()].find(
        p =>
          p.connected &&
          p.id !== projectile.owner
      );

    if (
      target &&
      !projectile.hit &&
      Math.abs(target.x - projectile.x) < 55 &&
      Math.abs(
        target.y - projectile.y
      ) < 90
    ) {
      projectile.hit = true;

      const attacker =
        room.players.get(
          projectile.owner
        );

      if (attacker) {
        dealDamage(
          room,
          attacker,
          target,
          projectile.damage,
          300,
          0.2
        );
      }

      addEffect(room, {
        type: "windHit",
        x: projectile.x,
        y: projectile.y
      });

      continue;
    }

    remaining.push(projectile);
  }

  room.projectiles = remaining;
}

function updatePlayersCollision(room) {
  const p1 = room.players.get(1);
  const p2 = room.players.get(2);

  if (
    !p1?.connected ||
    !p2?.connected
  ) {
    return;
  }

  const distance =
    p2.x - p1.x;

  const minimum = 65;

  if (Math.abs(distance) < minimum) {
    const push =
      (minimum - Math.abs(distance)) / 2;

    if (distance >= 0) {
      p1.x -= push;
      p2.x += push;
    } else {
      p1.x += push;
      p2.x -= push;
    }
  }
}

function serializePlayer(player) {
  return {
    id: player.id,

    connected: player.connected,

    x: player.x,
    y: player.y,

    vx: player.vx,
    vy: player.vy,

    facing: player.facing,

    hp: player.hp,
    maxHp: player.maxHp,

    grounded: player.grounded,

    state: player.state,

    block: player.input.block,

    attackTimer: player.attackTimer,

    hitStun: player.hitStun,

    dashTimer: player.dashTimer,

    invulnerable:
      player.invulnerable,

    cooldowns: {
      ...player.abilityCooldowns
    }
  };
}

function serializeRoom(room) {
  return {
    type: "state",

    time: room.time,

    started: room.started,

    finished: room.finished,

    players: [
      serializePlayer(
        room.players.get(1)
      ),
      serializePlayer(
        room.players.get(2)
      )
    ],

    projectiles:
      room.projectiles.map(p => ({
        x: p.x,
        y: p.y,
        vx: p.vx,
        owner: p.owner,
        life: p.life
      })),

    effects: room.effects
  };
}

function finishRound(room, winner) {
  if (room.finished) return;

  room.finished = true;
  room.started = false;

  broadcast(room, {
    type: "roundOver",
    winner
  });

  broadcastRoom(room);
}

function updateRoom(room, dt) {
  if (!room.started || room.finished) {
    return;
  }

  room.time -= dt;

  for (const player of room.players.values()) {
    updatePlayer(
      room,
      player,
      dt
    );
  }

  updatePlayersCollision(room);

  updateProjectiles(
    room,
    dt
  );

  if (room.time <= 0) {
    room.time = 0;

    const p1 = room.players.get(1);
    const p2 = room.players.get(2);

    let winner = 0;

    if (p1.hp > p2.hp) {
      winner = 1;
    } else if (p2.hp > p1.hp) {
      winner = 2;
    }

    finishRound(
      room,
      winner
    );
  }
}

function gameLoop() {
  const now = Date.now();

  for (const room of rooms.values()) {
    const dt = Math.min(
      0.05,
      (now - room.lastTick) / 1000
    );

    room.lastTick = now;

    updateRoom(
      room,
      dt
    );

    broadcast(
      room,
      serializeRoom(room)
    );

    room.effects = [];
  }
}

setInterval(
  gameLoop,
  1000 / 30
);

wss.on("connection", ws => {
  ws.roomCode = null;
  ws.playerId = null;

  send(ws, {
    type: "connected"
  });

  ws.on("message", raw => {
    let message;

    try {
      message =
        JSON.parse(raw.toString());
    } catch {
      return;
    }

    /*
      CREATE
    */

    if (
      message.type === "create"
    ) {
      if (ws.roomCode) {
        return;
      }

      const room =
        createRoom();

      const player =
        room.players.get(1);

      player.ws = ws;
      player.connected = true;

      ws.roomCode =
        room.code;

      ws.playerId = 1;

      send(ws, {
        type: "roomCreated",
        code: room.code,
        player: 1
      });

      broadcastRoom(room);

      return;
    }

    /*
      JOIN
    */

    if (
      message.type === "join"
    ) {
      if (ws.roomCode) {
        return;
      }

      const code =
        String(
          message.code || ""
        )
        .trim()
        .toUpperCase();

      const room =
        rooms.get(code);

      if (!room) {
        send(ws, {
          type: "error",
          message:
            "Room does not exist."
        });

        return;
      }

      let selectedPlayer = null;

      for (const player of room.players.values()) {
        if (!player.connected) {
          selectedPlayer =
            player;
          break;
        }
      }

      if (!selectedPlayer) {
        send(ws, {
          type: "error",
          message:
            "Room is full."
        });

        return;
      }

      selectedPlayer.ws = ws;
      selectedPlayer.connected = true;

      ws.roomCode =
        room.code;

      ws.playerId =
        selectedPlayer.id;

      send(ws, {
        type: "joined",
        code: room.code,
        player:
          selectedPlayer.id
      });

      const bothConnected =
        [...room.players.values()]
          .every(
            p => p.connected
          );

      if (bothConnected) {
        startRound(room);
      } else {
        broadcastRoom(room);
      }

      return;
    }

    /*
      INPUT
    */

    if (
      message.type === "input"
    ) {
      if (
        !ws.roomCode ||
        !ws.playerId
      ) {
        return;
      }

      const room =
        rooms.get(
          ws.roomCode
        );

      if (!room) return;

      const player =
        room.players.get(
          ws.playerId
        );

      if (!player) return;

      const input =
        message.input || {};

      player.input = {
        left: !!input.left,
        right: !!input.right,
        jump: !!input.jump,
        block: !!input.block
      };

      return;
    }

    /*
      ACTION
    */

    if (
      message.type === "action"
    ) {
      if (
        !ws.roomCode ||
        !ws.playerId
      ) {
        return;
      }

      const room =
        rooms.get(
          ws.roomCode
        );

      if (!room) return;

      const player =
        room.players.get(
          ws.playerId
        );

      if (!player) return;

      handleAction(
        room,
        player,
        message.action
      );

      return;
    }

    /*
      REMATCH
    */

    if (
      message.type === "rematch"
    ) {
      const room =
        rooms.get(
          ws.roomCode
        );

      if (!room) return;

      room.rematch.add(
        ws.playerId
      );

      broadcast(room, {
        type: "rematchWaiting",
        player: ws.playerId,
        count: room.rematch.size
      });

      if (
        room.rematch.size ===
        MAX_PLAYERS
      ) {
        startRound(room);
      }

      return;
    }
  });

  ws.on("close", () => {
    if (!ws.roomCode) return;

    const room =
      rooms.get(
        ws.roomCode
      );

    if (!room) return;

    const player =
      room.players.get(
        ws.playerId
      );

    if (player) {
      player.connected = false;
      player.ws = null;
      player.input =
        emptyInput();
    }

    room.started = false;
    room.finished = false;

    broadcast(room, {
      type: "playerLeft"
    });

    broadcastRoom(room);

    const connected =
      [...room.players.values()]
        .some(
          p => p.connected
        );

    if (!connected) {
      rooms.delete(
        room.code
      );
    }
  });
});

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Stickman Fight running on port ${PORT}`
    );
  }
);
