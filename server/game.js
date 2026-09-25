import { randomScenario } from "./scenarios.js";

const MAX_ROUNDS = 3;
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 6;

export function createRoom(code, hostId, hostName) {
  return {
    code,
    hostId,
    phase: "lobby",
    round: 0,
    scenario: "",
    suspectId: "",
    players: new Map([[hostId, createPlayer(hostId, hostName)]]),
    alibis: new Map(),
    questions: new Map(),
    votes: new Map(),
    roundResults: [],
    finalWinner: ""
  };
}

export function createPlayer(id, name) {
  return {
    id,
    name: cleanName(name),
    connected: true,
    role: "",
    score: { detective: 0, suspect: 0 }
  };
}

export function cleanName(name) {
  const cleaned = String(name || "").trim().replace(/\s+/g, " ");
  return cleaned.slice(0, 18);
}

export function canJoin(room) {
  return room.phase === "lobby" && room.players.size < MAX_PLAYERS;
}

export function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    round: room.round,
    maxRounds: MAX_ROUNDS,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    scenario: room.scenario,
    players: [...room.players.values()].map(({ id, name, connected, score }) => ({
      id,
      name,
      connected,
      score
    })),
    alibis: [...room.alibis.entries()].map(([playerId, text]) => ({
      playerId,
      playerName: room.players.get(playerId)?.name || "Unknown",
      text
    })),
    questions: [...room.questions.values()].map((entry) => ({
      askerId: entry.askerId,
      askerName: room.players.get(entry.askerId)?.name || "Unknown",
      targetId: entry.targetId,
      targetName: room.players.get(entry.targetId)?.name || "Unknown",
      questionText: entry.questionText,
      answerText: entry.answerText || ""
    })),
    votes: [...room.votes.keys()],
    roundResults: room.roundResults,
    finalWinner: room.finalWinner
  };
}

export function privateState(room, playerId) {
  const player = room.players.get(playerId);
  const askedAlready = [...room.questions.values()].some((entry) => entry.askerId === playerId);
  const pendingAnswer = [...room.questions.values()].find(
    (entry) => entry.targetId === playerId && !entry.answerText
  );
  return {
    playerId,
    role: player?.role || "",
    isHost: room.hostId === playerId,
    hasSubmittedAlibi: room.alibis.has(playerId),
    hasAskedQuestion: askedAlready,
    pendingQuestionFromMe: pendingAnswer ? { askerName: room.players.get(pendingAnswer.askerId)?.name || "Unknown", questionText: pendingAnswer.questionText } : null,
    hasVoted: room.votes.has(playerId),
    votedFor: room.votes.get(playerId) || ""
  };
}

export function startGame(room) {
  if (room.phase !== "lobby") throw new Error("This room has already started.");
  if (room.players.size < MIN_PLAYERS) throw new Error(`You need at least ${MIN_PLAYERS} players.`);
  beginRound(room);
}

export function beginRound(room) {
  room.round += 1;
  room.phase = "alibi";
  room.scenario = randomScenario();
  room.alibis.clear();
  room.questions.clear();
  room.votes.clear();
  room.finalWinner = "";

  const ids = [...room.players.keys()];
  room.suspectId = ids[Math.floor(Math.random() * ids.length)];
  for (const player of room.players.values()) {
    player.role = player.id === room.suspectId ? "Suspect" : "Detective";
  }
}

export function submitAlibi(room, playerId, text) {
  if (room.phase !== "alibi") throw new Error("Alibis are not open right now.");
  if (!room.players.has(playerId)) throw new Error("You are not in this room.");
  const alibi = String(text || "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (alibi.length < 3) throw new Error("Write a slightly more convincing alibi.");
  room.alibis.set(playerId, alibi);
  if (room.alibis.size === room.players.size) {
    room.phase = "reveal";
  }
}

export function openCrossExamine(room) {
  if (room.phase !== "reveal") throw new Error("Alibis have not been revealed yet.");
  room.phase = "crossExamine";
}

export function submitQuestion(room, askerId, targetId, text) {
  if (room.phase !== "crossExamine") throw new Error("Cross-examination is not open right now.");
  if (!room.players.has(askerId) || !room.players.has(targetId)) throw new Error("Invalid question.");
  if (askerId === targetId) throw new Error("You cannot question yourself.");
  if ([...room.questions.values()].some((entry) => entry.askerId === askerId)) {
    throw new Error("You have already asked your question this round.");
  }
  const questionText = String(text || "").trim().replace(/\s+/g, " ").slice(0, 100);
  if (questionText.length < 3) throw new Error("Ask a slightly clearer question.");
  room.questions.set(askerId, { askerId, targetId, questionText, answerText: "" });
}

export function submitAnswer(room, playerId, text) {
  if (room.phase !== "crossExamine") throw new Error("Cross-examination is not open right now.");
  const entry = [...room.questions.values()].find(
    (item) => item.targetId === playerId && !item.answerText
  );
  if (!entry) throw new Error("No question is waiting for your answer.");
  const answerText = String(text || "").trim().replace(/\s+/g, " ").slice(0, 100);
  if (answerText.length < 1) throw new Error("Write a short answer.");
  entry.answerText = answerText;
}

export function openVoting(room) {
  if (room.phase !== "crossExamine") throw new Error("Cross-examination has not finished yet.");
  room.phase = "voting";
}

export function submitVote(room, voterId, targetId) {
  if (room.phase !== "voting") throw new Error("Voting is not open right now.");
  if (!room.players.has(voterId) || !room.players.has(targetId)) throw new Error("Invalid vote.");
  if (voterId === room.suspectId) throw new Error("The Suspect waits while Detectives vote.");
  if (voterId === targetId) throw new Error("You cannot vote for yourself.");
  room.votes.set(voterId, targetId);
  if (room.votes.size === room.players.size - 1) {
    finishRound(room);
  }
}

export function finishRound(room) {
  const suspect = room.players.get(room.suspectId);
  const correctVotes = [...room.votes.values()].filter((targetId) => targetId === room.suspectId).length;
  const detectiveCount = room.players.size - 1;
  const detectivesWin = correctVotes > detectiveCount / 2;
  const winner = detectivesWin ? "Detectives" : "Suspect";

  if (detectivesWin) {
    for (const player of room.players.values()) {
      if (player.id !== room.suspectId) player.score.detective += 1;
    }
  } else if (suspect) {
    suspect.score.suspect += 1;
  }

  room.roundResults.push({
    round: room.round,
    suspectId: room.suspectId,
    suspectName: suspect?.name || "Unknown",
    correctVotes,
    totalVotes: detectiveCount,
    winner,
    votes: [...room.votes.entries()].map(([voterId, targetId]) => ({
      voterId,
      voterName: room.players.get(voterId)?.name || "Unknown",
      targetId,
      targetName: room.players.get(targetId)?.name || "Unknown"
    }))
  });

  room.phase = room.round >= MAX_ROUNDS ? "gameOver" : "roundResult";
  if (room.phase === "gameOver") {
    const detectiveWins = room.roundResults.filter((result) => result.winner === "Detectives").length;
    const suspectWins = room.roundResults.length - detectiveWins;
    room.finalWinner = detectiveWins > suspectWins ? "Detectives" : "Suspects";
  }
}

export function nextRound(room) {
  if (room.phase !== "roundResult") throw new Error("The next round is not available yet.");
  beginRound(room);
}

export function resetRoom(room) {
  room.phase = "lobby";
  room.round = 0;
  room.scenario = "";
  room.suspectId = "";
  room.alibis.clear();
  room.questions.clear();
  room.votes.clear();
  room.roundResults = [];
  room.finalWinner = "";
  for (const player of room.players.values()) {
    player.role = "";
    player.score = { detective: 0, suspect: 0 };
  }
}
