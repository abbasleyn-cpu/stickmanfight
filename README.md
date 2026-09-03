# Stickman Fight

A mobile-first online 1v1 stickman fighting game.

## Features

- Online room codes
- Player 1 / Player 2
- Real-time WebSocket multiplayer
- Mobile touch controls
- PC keyboard controls
- Punch
- Block
- Jump
- Fire Fist
- Lightning Dash
- Wind Slash
- Ability cooldowns
- Health bars
- 60 second rounds
- KO / win system
- Canvas stickman rendering
- Responsive mobile layout

## Requirements

Node.js 18+

## Run locally

Install dependencies:

npm install

Start server:

npm start

Then open:

http://localhost:3000

## PC controls

### Player 1

A = move left

D = move right

W = jump

F = attack

G = block

1 = Fire Fist

2 = Lightning Dash

3 = Wind Slash

### Player 2

Arrow Left = move left

Arrow Right = move right

Arrow Up = jump

L = attack

K = block

8 = Fire Fist

9 = Lightning Dash

0 = Wind Slash

## Multiplayer

Player 1:

1. Open the game.
2. Click CREATE ROOM.
3. Give the 6-character room code to Player 2.

Player 2:

1. Open the game.
2. Click JOIN ROOM.
3. Enter the room code.
4. Click JOIN.

The game starts automatically when both players are connected.

## Abilities

### Fire Fist

Heavy close-range attack.

Damage: 25

Cooldown: 4 seconds.

### Lightning Dash

Fast movement toward the direction the player is facing.

Damage: 18

Cooldown: 6 seconds.

### Wind Slash

Long-range attack.

Damage: 15

Cooldown: 5 seconds.

## Deployment

The server must run on a Node.js server.

The browser connects to the same server using WebSockets.

Do not use a static-only hosting service for the multiplayer server.

## Project structure

stickmanfight/

    index.html

    style.css

    game.js

    server.js

    package.json

    README.md
