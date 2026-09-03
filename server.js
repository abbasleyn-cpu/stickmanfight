import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";


/* =====================================================
   SERVER
===================================================== */

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

const PORT =
  Number(process.env.PORT || 3000);


/* =====================================================
   WORLD
===================================================== */

const WORLD = {
  width: 1200,
  height: 600,
  ground: 510
};


const GRAVITY = 1800;
const RUN_SPEED = 300;
const BLOCK_SPEED = 150;
const JUMP_SPEED = -720;
const ROUND_TIME = 60;


/* =====================================================
   ROOMS
===================================================== */

const rooms = new Map();


const ROOM_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";


let nextProjectileId = 1;


function makeCode() {

  let code;

  do {

    code = "";

    for (
      let i = 0;
      i < 6;
      i++
    ) {

      code +=
        ROOM_CHARS[
          Math.floor(
            Math.random() *
            ROOM_CHARS.length
          )
        ];

    }

  } while (
    rooms.has(code)
  );

  return code;
}


/* =====================================================
   FILE SERVER
===================================================== */

const files = {
  "/": "index.html",
  "/index.html": "index.html",
  "/style.css": "style.css",
  "/game.js": "game.js"
};


const mime = {
  ".html":
    "text/html; charset=utf-8",

  ".css":
    "text/css; charset=utf-8",

  ".js":
    "text/javascript; charset=utf-8"
};


const server =
  http.createServer(
    (req, res) => {

      try {

        const url =
          new URL(
            req.url || "/",
            `http://${req.headers.host || "localhost"}`
          );


        const file =
          files[url.pathname];


        if (!file) {

          res.writeHead(404);

          res.end(
            "Not found"
          );

          return;
        }


        const filepath =
          path.join(
            __dirname,
            file
          );


        fs.readFile(
          filepath,
          (error, data) => {

            if (error) {

              console.error(
                error
              );

              res.writeHead(
                500
              );

              res.end(
                "Server error"
              );

              return;
            }


            res.writeHead(
              200,
              {
                "Content-Type":
                  mime[
                    path.extname(
                      filepath
                    )
                  ]
              }
            );


            res.end(
              data
            );

          }
        );

      } catch (
        error
      ) {

        console.error(
          error
        );

        res.writeHead(
          500
        );

        res.end(
          "Server error"
        );

      }

    }
  );


/* =====================================================
   WEBSOCKET
===================================================== */

const wss =
  new WebSocketServer({
    server
  });


/* =====================================================
   PLAYER
===================================================== */

function emptyInput() {

  return {
    left: false,
    right: false,
    jump: false,
    block: false
  };

}


function createPlayer(
  role,
  bot = false
) {

  return {

    role,

    bot,

    connected:
      false,

    x:
      role === "P1"
        ? 300
        : 900,

    y:
      WORLD.ground,

    vx:
      0,

    vy:
      0,

    facing:
      role === "P1"
        ? 1
        : -1,

    hp:
      100,

    input:
      emptyInput(),

    previousJump:
      false,

    jumpQueued:
      false,

    onGround:
      true,

    blocking:
      false,

    attackTimer:
      0,

    dashTimer:
      0,

    dashHit:
      false,

    stun:
      0,

    invuln:
      0,

    cooldowns: {

      punch:
        0,

      kick:
        0,

      fire:
        0,

      dash:
        0,

      wind:
        0

    },

    ai: {

      attack:
        .6,

      ability:
        1.4,

      jump:
        1.0

    }

  };

}


/* =====================================================
   ROOM
===================================================== */

function createRoom(
  mode,
  rounds
) {

  const room = {

    code:
      makeCode(),

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

      P1:
        createPlayer(
          "P1",
          false
        ),

      P2:
        createPlayer(
          "P2",
          mode === "cpu"
        )

    },

    score: {

      P1:
        0,

      P2:
        0

    },

    round:
      1,

    phase:
      "lobby",

    started:
      false,

    time:
      ROUND_TIME,

    roundWinner:
      null,

    matchWinner:
      null,

    projectiles:
      [],

    events:
      [],

    nextRoundAt:
      0,

    rematch: {
      P1: false,
      P2: false
    }

  };


  if (
    mode === "cpu"
  ) {

    room.players.P2.connected =
      true;

  }


  return room;
}


/* =====================================================
   SOCKET
===================================================== */

function send(
  ws,
  data
) {

  if (
    ws &&
    ws.readyState ===
      WebSocket.OPEN
  ) {

    ws.send(
      JSON.stringify(data)
    );

  }

}


function sendState(
  room
) {

  const message =
    publicState(
      room
    );


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


/* =====================================================
   PUBLIC STATE
===================================================== */

function publicPlayer(
  player
) {

  return {

    role:
      player.role,

    bot:
      player.bot,

    connected:
      player.connected,

    x:
      player.x,

    y:
      player.y,

    vx:
      player.vx,

    vy:
      player.vy,

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


function publicState(
  room
) {

  return {

    type:
      "state",

    mode:
      room.mode,

    started:
      room.started,

    phase:
      room.phase,

    time:
      Math.max(
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
        (p) => ({

          id:
            p.id,

          kind:
            p.kind,

          x:
            p.x,

          y:
            p.y,

          vx:
            p.vx,

          vy:
            p.vy

        })
      ),

    events:
      room.events

  };

}


/* =====================================================
   RESET
===================================================== */

function resetPlayer(
  player
) {

  player.x =
    player.role === "P1"
      ? 300
      : 900;

  player.y =
    WORLD.ground;

  player.vx =
    0;

  player.vy =
    0;

  player.facing =
    player.role === "P1"
      ? 1
      : -1;

  player.hp =
    100;

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


  for (
    const key of
      Object.keys(
        player.cooldowns
      )
  ) {

    player.cooldowns[key] =
      0;

  }


  player.ai.attack =
    .6;

  player.ai.ability =
    1.4;

  player.ai.jump =
    1;

}


/* =====================================================
   MATCH START
===================================================== */

function startMatch(
  room
) {

  room.score.P1 =
    0;

  room.score.P2 =
    0;

  room.round =
    1;

  room.roundWinner =
    null;

  room.matchWinner =
    null;

  room.projectiles =
    [];

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

  room.started =
    true;

}


/* =====================================================
   NEXT ROUND
===================================================== */

function nextRound(
  room
) {

  room.round++;

  room.roundWinner =
    null;

  room.projectiles =
    [];

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

    room.score[
      winner
    ]++;

  }


  const needed =
    Math.ceil(
      room.roundsToWin /
      2
    );


  if (
    (
      winner === "P1" ||
      winner === "P2"
    ) &&
    room.score[
      winner
    ] >=
      needed
  ) {

    room.matchWinner =
      winner;

    room.phase =
      "match_end";

  } else {

    room.nextRoundAt =
      Date.now() +
      2300;

  }

}


/* =====================================================
   COMBAT
===================================================== */

function opponent(
  room,
  player
) {

  return player.role ===
    "P1"

    ? room.players.P2

    : room.players.P1;

}


function canFight(
  room,
  player
) {

  return (
    room.started &&
    room.phase ===
      "fighting" &&
    player.connected &&
    player.hp > 0 &&
    player.stun <= 0
  );

}


function faces(
  attacker,
  target
) {

  const dx =
    target.x -
    attacker.x;

  return (
    Math.sign(dx) ===
      attacker.facing ||
    Math.abs(dx) < 5
  );

}


/* =====================================================
   DAMAGE
===================================================== */

function dealDamage(
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
        damage *
        .25
      );

  }


  target.hp =
    Math.max(
      0,
      target.hp -
        damage
    );


  target.invuln =
    target.blocking
      ? .06
      : .12;


  target.stun =
    target.blocking
      ? .05
      : .15;


  target.vx +=
    attacker.facing *
    (
      target.blocking
        ? 70
        : 180
    );


  room.events.push({

    type:
      "hit",

    x:
      target.x,

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


/* =====================================================
   MELEE
===================================================== */

function melee(
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


  const key =
    type === "punch"
      ? "punch"
      : "kick";


  if (
    player.cooldowns[
      key
    ] > 0
  ) {

    return;

  }


  const target =
    opponent(
      room,
      player
    );


  player.attackTimer =
    type === "punch"
      ? .18
      : .24;


  player.cooldowns[
    key
  ] =
    type === "punch"
      ? .30
      : .45;


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
    vertical <= 110 &&
    faces(
      player,
      target
    )
  ) {

    dealDamage(
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


/* =====================================================
   FIRE FIST
===================================================== */

function fire(
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

    type:
      "fire",

    x:
      player.x +
      player.facing *
      70,

    y:
      player.y -
      65,

    direction:
      player.facing

  });


  const target =
    opponent(
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
    faces(
      player,
      target
    )
  ) {

    dealDamage(
      room,
      player,
      target,
      28,
      "fire"
    );

  }

}


/* =====================================================
   DASH
===================================================== */

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
    .3;


  player.dashHit =
    false;


  player.invuln =
    .2;


  player.vx =
    player.facing *
    850;


  room.events.push({

    type:
      "dash",

    x:
      player.x,

    y:
      player.y - 60,

    direction:
      player.facing

  });

}


/* =====================================================
   WIND
===================================================== */

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

    id:
      nextProjectileId++,

    kind:
      "wind",

    owner:
      player.role,

    x:
      player.x +
      player.facing *
      60,

    y:
      player.y -
      65,

    vx:
      player.facing *
      650,

    vy:
      0,

    life:
      .9,

    hit:
      false

  });


  room.events.push({

    type:
      "wind",

    x:
      player.x +
      player.facing *
      60,

    y:
      player.y -
      65,

    direction:
      player.facing

  });

}


/* =====================================================
   ACTION
===================================================== */

function action(
  room,
  player,
  name
) {

  if (
    name === "attack"
  ) {

    melee(
      room,
      player,
      "punch"
    );

  }

  else if (
    name === "kick"
  ) {

    melee(
      room,
      player,
      "kick"
    );

  }

  else if (
    name === "fire"
  ) {

    fire(
      room,
      player
    );

  }

  else if (
    name === "dash"
  ) {

    dash(
      room,
      player
    );

  }

  else if (
    name === "wind"
  ) {

    wind(
      room,
      player
    );

  }

}


/* =====================================================
   INPUT
===================================================== */

function updateInput(
  player,
  data
) {

  const oldJump =
    player.input.jump;


  player.input =
    emptyInput();


  if (
    data &&
    typeof data ===
      "object"
  ) {

    player.input.left =
      Boolean(
        data.left
      );

    player.input.right =
      Boolean(
        data.right
      );

    player.input.jump =
      Boolean(
        data.jump
      );

    player.input.block =
      Boolean(
        data.block
      );

  }


  if (
    player.input.jump &&
    !oldJump
  ) {

    player.jumpQueued =
      true;

  }


  player.blocking =
    player.input.block &&
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


  const dx =
    target.x -
    cpu.x;


  const distance =
    Math.abs(dx);


  /* Always face */

  if (
    Math.abs(dx) > 2
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

  cpu.input.jump =
    false;

  cpu.input.block =
    false;


  if (
    distance > 120
  ) {

    if (
      dx > 0
    ) {

      cpu.input.right =
        true;

    } else {

      cpu.input.left =
        true;

    }

  }


  /* Block */

  if (
    distance < 140 &&
    target.attackTimer > 0 &&
    Math.random() < .35
  ) {

    cpu.input.block =
      true;

  }


  /* Jump */

  cpu.ai.jump -=
    dt;


  if (
    cpu.ai.jump <= 0 &&
    cpu.onGround
  ) {

    if (
      Math.random() < .45
    ) {

      cpu.input.jump =
        true;

    }


    cpu.ai.jump =
      1 +
      Math.random() *
      1.5;

  }


  /* Attack */

  cpu.ai.attack -=
    dt;


  if (
    cpu.ai.attack <= 0
  ) {

    if (
      distance < 150
    ) {

      if (
        Math.random() < .55
      ) {

        action(
          room,
          cpu,
          "attack"
        );

      } else {

        action(
          room,
          cpu,
          "kick"
        );

      }

    }


    cpu.ai.attack =
      .3 +
      Math.random() *
      .45;

  }


  /* Ability */

  cpu.ai.ability -=
    dt;


  if (
    cpu.ai.ability <= 0
  ) {

    const choice =
      Math.random();


    if (
      distance < 210 &&
      choice < .4
    ) {

      action(
        room,
        cpu,
        "fire"
      );

    }

    else if (
      distance < 320 &&
      choice < .7
    ) {

      action(
        room,
        cpu,
        "dash"
      );

    }

    else {

      action(
        room,
        cpu,
        "wind"
      );

    }


    cpu.ai.ability =
      1.2 +
      Math.random() *
      2;

  }


  /*
    Jump edge detection.
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
   PLAYER PHYSICS
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
      JUMP_SPEED;

    player.onGround =
      false;

  }


  player.jumpQueued =
    false;


  /* Movement */

  if (
    player.dashTimer <=
      0
  ) {

    let direction =
      0;


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
        ? BLOCK_SPEED
        : RUN_SPEED;


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
          .001,
          dt
        );

    }

  }


  /* Gravity */

  player.vy +=
    GRAVITY *
    dt;


  player.x +=
    player.vx *
    dt;


  player.y +=
    player.vy *
    dt;


  /* Dash */

  if (
    player.dashTimer >
      0
  ) {

    player.dashTimer =
      Math.max(
        0,
        player.dashTimer -
        dt
      );


    const target =
      opponent(
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

        if (
          dealDamage(
            room,
            player,
            target,
            18,
            "dash"
          )
        ) {

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

    player.vy =
      0;

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

    player.x =
      45;

    player.vx =
      0;

  }


  if (
    player.x >
      WORLD.width -
      45
  ) {

    player.x =
      WORLD.width -
      45;

    player.vx =
      0;

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
      room.projectiles.length -
      1;

    i >= 0;

    i--
  ) {

    const projectile =
      room.projectiles[i];


    projectile.life -=
      dt;


    projectile.x +=
      projectile.vx *
      dt;


    const owner =
      room.players[
        projectile.owner
      ];


    const target =
      opponent(
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


        dealDamage(
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
      projectile.x <
        -100 ||
      projectile.x >
        WORLD.width +
        100
    ) {

      room.projectiles.splice(
        i,
        1
      );

    }

  }

}


/* =====================================================
   GAME LOOP
===================================================== */

let lastTick =
  Date.now();


setInterval(
  () => {

    const now =
      Date.now();


    let dt =
      (now -
        lastTick) /
      1000;


    lastTick =
      now;


    dt =
      Math.min(
        .05,
        Math.max(
          0,
          dt
        )
      );


    for (
      const room of
        rooms.values()
    ) {

      /*
        CPU gets AI.
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

        room.time -=
          dt;


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


        /*
          Time ran out.
        */

        if (
          room.time <=
            0
        ) {

          room.time =
            0;


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

          }

          else if (
            p2.hp >
            p1.hp
          ) {

            finishRound(
              room,
              "P2"
            );

          }

          else {

            finishRound(
              room,
              "draw"
            );

          }

        }

      }


      /*
        Start next round.
      */

      if (
        room.phase ===
          "round_end" &&
        room.matchWinner ===
          null &&
        Date.now() >=
          room.nextRoundAt
      ) {

        nextRound(
          room
        );

      }

    }

  },
  1000 / 60
);


/* =====================================================
   STATE BROADCAST
===================================================== */

setInterval(
  () => {

    for (
      const room of
        rooms.values()
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
      CRITICAL:
      Every socket gets its own role.
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


        /* =============================================
           CREATE ONLINE
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


          /*
            FIRST SOCKET = P1
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

              rounds:
                room.roundsToWin

            }
          );


          sendState(
            room
          );


          return;

        }


        /* =============================================
           CPU
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
            HUMAN = P1
            CPU = P2
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

              rounds:
                room.roundsToWin

            }
          );


          sendState(
            room
          );


          return;

        }


        /* =============================================
           JOIN
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
                  "That room is not an online room."
              }
            );

            return;

          }


          /*
            SECOND SOCKET = P2
          */

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


          sendState(
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
            !ws.room ||
            !ws.role
          ) {

            return;

          }


          const player =
            ws.room.players[
              ws.role
            ];


          /*
            P1 socket can ONLY control P1.
            P2 socket can ONLY control P2.
          */

          if (
            !player ||
            player.bot
          ) {

            return;

          }


          updateInput(
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


          action(
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
            !ws.room ||
            !ws.role
          ) {

            return;

          }


          const room =
            ws.room;


          /*
            CPU mode:
            restart instantly.
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


          room.rematch[
            ws.role
          ] = true;


          if (
            room.rematch.P1 &&
            room.rematch.P2
          ) {

            room.rematch.P1 =
              false;

            room.rematch.P2 =
              false;


            startMatch(
              room
            );


            sendState(
              room
            );

          }

        }

      }
    );


    /* =============================================
       DISCONNECT
    ============================================= */

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


        /*
          CPU room disappears when
          the human leaves.
        */

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
          Online game goes back
          to lobby.
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

        room.rematch.P1 =
          false;

        room.rematch.P2 =
          false;


        if (
          room.clients.P1 ||
          room.clients.P2
        ) {

          sendState(
            room
          );

        } else {

          rooms.delete(
            room.code
          );

        }

      }
    );

  }
);


/* =====================================================
   START
===================================================== */

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "================================="
    );

    console.log(
      "      STICKMAN FIGHT"
    );

    console.log(
      "================================="
    );

    console.log(
      `Server running on port ${PORT}`
    );

    console.log(
      `http://localhost:${PORT}`
    );

  }
);
