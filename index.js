import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import {
  canJoin,
  cleanName,
  createPlayer,
  createRoom,
  nextRound,
  openVoting,
  privateState,
  publicRoom,
  resetRoom,
  startGame,
  submitAlibi,
  submitVote
} from "./game.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const rooms = new Map();

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name }, reply) => {
    try {
      const code = makeRoomCode();
      const room = createRoom(code, socket.id, name);
      rooms.set(code, room);
      socket.join(code);
      socket.data.roomCode = code;
      reply?.({ ok: true, code, playerId: socket.id });
      broadcast(room);
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("joinRoom", ({ code, name }, reply) => {
    try {
      const normalizedCode = String(code || "").trim().toUpperCase();
      const room = rooms.get(normalizedCode);
      if (!room) throw new Error("That room code was not found.");
      if (!canJoin(room)) throw new Error("That room is already playing or full.");

      room.players.set(socket.id, createPlayer(socket.id, cleanName(name)));
      socket.join(normalizedCode);
      socket.data.roomCode = normalizedCode;
      reply?.({ ok: true, code: normalizedCode, playerId: socket.id });
      broadcast(room);
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("startGame", replyFor(socket, (room) => {
    if (room.hostId !== socket.id) throw new Error("Only the host can start the game.");
    startGame(room);
  }));

  socket.on("submitAlibi", ({ text }, reply) => {
    runWithRoom(socket, reply, (room) => submitAlibi(room, socket.id, text));
  });

  socket.on("openVoting", replyFor(socket, (room) => openVoting(room)));

  socket.on("submitVote", ({ targetId }, reply) => {
    runWithRoom(socket, reply, (room) => submitVote(room, socket.id, targetId));
  });

  socket.on("nextRound", replyFor(socket, (room) => {
    if (room.hostId !== socket.id) throw new Error("Only the host can start the next round.");
    nextRound(room);
  }));

  socket.on("playAgain", replyFor(socket, (room) => {
    if (room.hostId !== socket.id) throw new Error("Only the host can reset the room.");
    resetRoom(room);
  }));

  socket.on("disconnect", () => {
    const room = getSocketRoom(socket);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (player) player.connected = false;
    if (room.phase === "lobby") room.players.delete(socket.id);
    if (room.hostId === socket.id && room.players.size > 0) {
      room.hostId = [...room.players.keys()][0];
    }
    if (room.players.size === 0) rooms.delete(room.code);
    else broadcast(room);
  });
});

function replyFor(socket, action) {
  return (_payload, reply) => runWithRoom(socket, reply, action);
}

function runWithRoom(socket, reply, action) {
  try {
    const room = getSocketRoom(socket);
    if (!room) throw new Error("Join or create a room first.");
    action(room);
    reply?.({ ok: true });
    broadcast(room);
  } catch (error) {
    reply?.({ ok: false, error: error.message });
  }
}

function getSocketRoom(socket) {
  return rooms.get(socket.data.roomCode);
}

function broadcast(room) {
  for (const playerId of room.players.keys()) {
    io.to(playerId).emit("state", {
      room: publicRoom(room),
      me: privateState(room, playerId)
    });
  }
}

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (rooms.has(code));
  return code;
}

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Alibi Night is running on http://localhost:${port}`);
});
