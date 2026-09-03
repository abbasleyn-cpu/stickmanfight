import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const rooms = new Map();

const server = http.createServer((req, res) => {
  let file = req.url === "/" ? "/index.html" : req.url;

  const safe = path.normalize(file).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(__dirname, safe);

  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json"
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "text/plain"
    });

    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code;

  do {
    code = "";

    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));

  return code;
}

function send(ws, data) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(room, data) {
  for (const player of room.players) {
    send(player.ws, data);
  }
}

function createPlayer(id) {
  return {
    id,
    ws: null,
    x: id === 1 ? 220 : 780,
    y: 400,
    vx: 0,
    vy: 0,
    hp: 100,
    facing: id === 1 ? 1 : -1,
    action: "idle",
    block: false
  };
}

wss.on("connection", ws => {
  let room = null;
  let player = null;

  ws.on("message", raw => {
    let msg;

    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === "create") {
      if (room) return;

      const code = makeCode();

      room = {
        code,
        players: [],
        state: {
          started: false,
          time: 60
        }
      };

      player = createPlayer(1);
      player.ws = ws;

      room.players.push(player);
      rooms.set(code, room);

      send(ws, {
        type: "roomCreated",
        code,
        player: 1
      });

      return;
    }

    if (msg.type === "join") {
      if (room) return;

      const code = String(msg.code || "").toUpperCase();
      const target = rooms.get(code);

      if (!target) {
        send(ws, {
          type: "error",
          message: "Room not found."
        });
        return;
      }

      if (target.players.length >= 2) {
        send(ws, {
          type: "error",
          message: "Room is full."
        });
        return;
      }

      room = target;

      player = createPlayer(2);
      player.ws = ws;

      room.players.push(player);
      room.state.started = true;

      send(ws, {
        type: "joined",
        code,
        player: 2
      });

      broadcast(room, {
        type: "gameStart",
        players: room.players.map(p => ({
          id: p.id,
          x: p.x,
          y: p.y,
          hp: p.hp
        }))
      });

      return;
    }

    if (!room || !player) return;

    if (msg.type === "input") {
      player.x = Number(msg.x) || player.x;
      player.y = Number(msg.y) || player.y;
      player.vx = Number(msg.vx) || 0;
      player.vy = Number(msg.vy) || 0;
      player.facing = msg.facing === -1 ? -1 : 1;
      player.action = msg.action || "idle";
      player.block = !!msg.block;

      broadcast(room, {
        type: "playerState",
        player: {
          id: player.id,
          x: player.x,
          y: player.y,
          vx: player.vx,
          vy: player.vy,
          facing: player.facing,
          action: player.action,
          block: player.block,
          hp: player.hp
        }
      });
    }

    if (msg.type === "attack") {
      const opponent = room.players.find(p => p.id !== player.id);

      if (!opponent) return;

      const distance = Math.abs(player.x - opponent.x);

      if (distance < 150) {
        const damage = opponent.block ? 3 : 10;

        opponent.hp = Math.max(0, opponent.hp - damage);

        broadcast(room, {
          type: "damage",
          attacker: player.id,
          target: opponent.id,
          damage,
          hp: opponent.hp
        });

        if (opponent.hp <= 0) {
          broadcast(room, {
            type: "gameOver",
            winner: player.id
          });
        }
      }
    }

    if (msg.type === "ability") {
      const opponent = room.players.find(p => p.id !== player.id);

      if (!opponent) return;

      const distance = Math.abs(player.x - opponent.x);

      let damage = 0;
      let range = 150;

      if (msg.ability === "fire") {
        damage = 25;
        range = 190;
      }

      if (msg.ability === "dash") {
        damage = 18;
        range = 230;
      }

      if (msg.ability === "wind") {
        damage = 15;
        range = 500;
      }

      if (distance <= range) {
        const finalDamage = opponent.block
          ? Math.floor(damage * 0.25)
          : damage;

        opponent.hp = Math.max(
          0,
          opponent.hp - finalDamage
        );

        broadcast(room, {
          type: "abilityHit",
          ability: msg.ability,
          attacker: player.id,
          target: opponent.id,
          damage: finalDamage,
          hp: opponent.hp
        });

        if (opponent.hp <= 0) {
          broadcast(room, {
            type: "gameOver",
            winner: player.id
          });
        }
      } else {
        broadcast(room, {
          type: "abilityMiss",
          ability: msg.ability,
          attacker: player.id
        });
      }
    }
  });

  ws.on("close", () => {
    if (!room) return;

    room.players = room.players.filter(p => p.ws !== ws);

    if (room.players.length === 0) {
      rooms.delete(room.code);
      return;
    }

    broadcast(room, {
      type: "playerLeft"
    });
  });
});

server.listen(PORT, () => {
  console.log(`Stickman Fight running on port ${PORT}`);
});
