const socket = io();
const app = document.querySelector("#app");

let state = { room: null, me: null };
localStorage.removeItem("alibiName");
let form = { name: "", code: "", alibi: "" };
let notice = "";
const shownRoleReveals = new Set();
let activeRoleReveal = "";
let roleRevealTimer = null;

socket.on("state", (nextState) => {
  state = nextState;
  notice = "";
  maybeStartRoleReveal();
  render();
});

socket.on("connect_error", () => {
  notice = "Connection trouble. Refresh and try again.";
  render();
});

function emit(event, payload = {}) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (reply) => {
      if (!reply?.ok) notice = reply?.error || "Something went wrong.";
      resolve(reply);
      render();
    });
  });
}

function page(shell) {
  const phaseClass = state.room ? `phase-${state.room.phase}` : "phase-home";
  app.innerHTML = `
    <section class="screen ${phaseClass}">
      <div class="topbar">
        <div>
          <p class="eyebrow">Social deduction party game</p>
          <h1>Alibi Night</h1>
        </div>
        ${state.room ? `<div class="roomBadge">Room <strong>${state.room.code}</strong></div>` : ""}
      </div>
      ${notice ? `<p class="notice">${notice}</p>` : ""}
      ${shell}
    </section>
  `;
  bindInputs();
}

function render() {
  if (!state.room) return renderHome();
  const phase = state.room.phase;
  if (phase === "lobby") return renderLobby();
  if (activeRoleReveal) return renderRoleReveal();
  if (phase === "alibi") return renderAlibi();
  if (phase === "reveal") return renderReveal();
  if (phase === "voting") return renderVoting();
  if (phase === "roundResult") return renderRoundResult();
  if (phase === "gameOver") return renderGameOver();
}

function renderHome() {
  page(`
    <section class="hero">
      <div>
        <h2>Build a room, share the code, catch the Suspect.</h2>
        <p>Each player opens this site on their own phone or laptop. No login, no signup.</p>
      </div>
      <form class="panel" id="homeForm">
        <label>Your name
          <input name="name" maxlength="18" value="${escapeHtml(form.name)}" placeholder="Mara" required />
        </label>
        <div class="actions">
          <button class="primary" data-action="create" type="button">Create room</button>
        </div>
        <div class="joinRow">
          <label>Room code
            <input name="code" maxlength="4" value="${escapeHtml(form.code)}" placeholder="K7Q4" />
          </label>
          <button data-action="join" type="button">Join</button>
        </div>
      </form>
    </section>
  `);
  app.querySelector("[data-action='create']").addEventListener("click", async () => {
    saveHomeForm();
    await emit("createRoom", { name: form.name });
  });
  app.querySelector("[data-action='join']").addEventListener("click", async () => {
    saveHomeForm();
    await emit("joinRoom", { name: form.name, code: form.code });
  });
}

function renderLobby() {
  const { room, me } = state;
  page(`
    <section class="grid">
      <div class="panel">
        <p class="step">Lobby</p>
        <div class="codeCard">
          <span>Case file</span>
          <strong>${room.code}</strong>
        </div>
        <h2>Share the room code</h2>
        <p>Players join from their own devices by entering a name and this room code. Start when you have 3 to 6 players.</p>
        <div class="players">${playerList(room.players)}</div>
        ${me.isHost ? `<button class="primary" data-action="start" ${room.players.length < room.minPlayers ? "disabled" : ""}>Start game</button>` : `<p class="waiting">Waiting for the host to start.</p>`}
      </div>
      <aside class="rules">
        <h3>How it works</h3>
        <p>One player secretly becomes the Suspect. Everyone writes an alibi for the crime, reads the group’s stories, then votes. A majority catches the Suspect.</p>
      </aside>
    </section>
  `);
  app.querySelector("[data-action='start']")?.addEventListener("click", () => emit("startGame"));
}

function renderAlibi() {
  const { room, me } = state;
  page(`
    <section class="grid">
      <div class="panel">
        <p class="step">Round ${room.round} of ${room.maxRounds}</p>
        <h2>${escapeHtml(room.scenario)}</h2>
        <p class="role ${me.role.toLowerCase()}">You are a ${me.role}. ${me.role === "Suspect" ? "Blend in. Do not look suspicious." : "Find the story that feels false."}</p>
        ${me.hasSubmittedAlibi ? `<p class="success">Alibi submitted. Waiting for everyone else.</p>` : `
          <form id="alibiForm">
            <label>Your one-line alibi
              <input name="alibi" maxlength="120" value="${escapeHtml(form.alibi)}" placeholder="I was fixing the copier with Jordan." required />
            </label>
            <button class="primary">Submit alibi</button>
          </form>
        `}
      </div>
      <aside class="rules">
        <h3>Current status</h3>
        <p>${room.alibis.length} of ${room.players.length} alibis submitted. Alibis appear only when everyone is done.</p>
      </aside>
    </section>
  `);
  app.querySelector("#alibiForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    form.alibi = new FormData(event.currentTarget).get("alibi");
    const reply = await emit("submitAlibi", { text: form.alibi });
    if (reply?.ok) form.alibi = "";
  });
}

function renderRoleReveal() {
  const { me } = state;
  const isSuspect = me.role === "Suspect";
  page(`
    <section class="roleRevealOverlay ${isSuspect ? "suspectIntro" : "detectiveIntro"}">
      <div class="roleRevealCard">
        <div class="roleIcon" aria-hidden="true">${isSuspect ? "!" : "⌕"}</div>
        <p class="step">${isSuspect ? "Identity confirmed" : "Badge issued"}</p>
        <h2>${isSuspect ? "You are the Suspect" : "You are a Detective"}</h2>
        <p>${isSuspect ? "Stay calm. Invent an alibi. Escape the vote." : "Find the liar. Compare every alibi. Trust no loose thread."}</p>
      </div>
    </section>
  `);
}

function renderReveal() {
  const { room } = state;
  page(`
    <section class="panel wide">
      <p class="step">Alibis revealed</p>
      <h2>Read carefully. Then vote for the Suspect.</h2>
      <div class="alibis revealStack">${room.alibis.map((item, index) => `
        <article style="--i: ${index}">
          <strong>${escapeHtml(item.playerName)}</strong>
          <p>${escapeHtml(item.text)}</p>
        </article>
      `).join("")}</div>
      <button class="primary" data-action="vote">Start voting</button>
    </section>
  `);
  app.querySelector("[data-action='vote']").addEventListener("click", () => emit("openVoting"));
}

function renderVoting() {
  const { room, me } = state;
  const detectiveCount = room.players.length - 1;
  page(`
    <section class="panel wide">
      <p class="step">Vote</p>
      <h2>Who is the Suspect?</h2>
      <div class="countdown" aria-hidden="true"><span></span></div>
      <p>Detectives vote once. The Suspect waits and tries to look calm. The reveal happens when all Detectives have voted.</p>
      ${me.role === "Suspect" ? `<p class="waiting">You are the Suspect. Detectives are voting now.</p>` : me.hasVoted ? `<p class="success">Vote locked. Waiting for ${detectiveCount - room.votes.length} more.</p>` : `
        <div class="voteGrid">
          ${room.players.filter((player) => player.id !== me.playerId).map((player) => `
            <button data-vote="${player.id}">${escapeHtml(player.name)}</button>
          `).join("")}
        </div>
      `}
    </section>
  `);
  app.querySelectorAll("[data-vote]").forEach((button) => {
    button.addEventListener("click", () => emit("submitVote", { targetId: button.dataset.vote }));
  });
}

function renderRoundResult() {
  const { room, me } = state;
  const result = room.roundResults.at(-1);
  page(resultView(result, `
    ${me.isHost ? `<button class="primary" data-action="next">Next round</button>` : `<p class="waiting">Waiting for the host to continue.</p>`}
  `));
  app.querySelector("[data-action='next']")?.addEventListener("click", () => emit("nextRound"));
}

function renderGameOver() {
  const { room, me } = state;
  const result = room.roundResults.at(-1);
  page(`
    ${resultView(result, "")}
    <section class="panel wide final">
      <p class="step">Game over</p>
      <h2>${room.finalWinner} win the night.</h2>
      <div class="scoreboard">${room.roundResults.map((round) => `
        <p>Round ${round.round}: <strong>${round.winner}</strong> won. Suspect: ${escapeHtml(round.suspectName)}.</p>
      `).join("")}</div>
      ${me.isHost ? `<button class="primary" data-action="again">Play again</button>` : `<p class="waiting">The host can reset the room.</p>`}
    </section>
  `);
  app.querySelector("[data-action='again']")?.addEventListener("click", () => emit("playAgain"));
}

function resultView(result, footer) {
  return `
    <section class="panel wide revealMoment">
      <p class="step">Round result</p>
      <h2>${result.winner} win this round.</h2>
      <div class="suspectReveal">
        <span>The Suspect was</span>
        <strong>${escapeHtml(result.suspectName)}</strong>
      </div>
      <p>${result.correctVotes} of ${result.totalVotes} Detectives voted correctly.</p>
      <div class="alibis compact">${result.votes.map((vote) => `
        <article>
          <strong>${escapeHtml(vote.voterName)}</strong>
          <p>voted for ${escapeHtml(vote.targetName)}</p>
        </article>
      `).join("")}</div>
      ${footer}
    </section>
  `;
}

function playerList(players) {
  return players.map((player) => `
    <div class="player">
      <span>${escapeHtml(player.name)}</span>
      <small>${player.connected ? "online" : "away"}</small>
    </div>
  `).join("");
}

function bindInputs() {
  app.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => {
      form[input.name] = input.name === "code" ? input.value.toUpperCase() : input.value;
    });
  });
}

function saveHomeForm() {
  const data = new FormData(app.querySelector("#homeForm"));
  form.name = data.get("name");
  form.code = String(data.get("code") || "").toUpperCase();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function maybeStartRoleReveal() {
  if (!state.room || !state.me || state.room.phase !== "alibi" || !state.me.role) return;
  const revealKey = `${state.room.code}:${state.room.round}:${state.me.playerId}`;
  if (shownRoleReveals.has(revealKey) || activeRoleReveal === revealKey) return;

  activeRoleReveal = revealKey;
  clearTimeout(roleRevealTimer);
  roleRevealTimer = setTimeout(() => {
    shownRoleReveals.add(revealKey);
    activeRoleReveal = "";
    render();
  }, 2600);
}

render();
