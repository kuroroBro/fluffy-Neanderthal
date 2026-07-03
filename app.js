(function () {
  "use strict";

  const TEAM_COLORS = ["#ff595e", "#1982c4", "#8ac926", "#ffca3a", "#6a4c93", "#f4a261"];
  const MAX_TEAMS = 6;
  const MIN_TEAMS = 2;
  const CLUB_FLASH_MS = 650;

  const state = {
    teams: [],
    nextTeamId: 1,
    roundSeconds: 60,
    turnsPerTeam: 3,
    selectedCategories: new Set(Object.keys(DECK)),
    deck: [],
    discard: [],
    turnQueue: [],
    turnIndex: 0,
    currentCard: null,
    timeLeft: 0,
    timerHandle: null,
    turnStartScore: 0
  };

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
    $(id).classList.add("active");
  }

  function renderMiniScoreboard(container, teams) {
    const sorted = teams.slice().sort((a, b) => b.score - a.score);
    container.innerHTML = "";
    sorted.forEach((team) => {
      const row = document.createElement("div");
      row.className = "mini-score-row";
      row.innerHTML = `
        <span class="team-swatch" style="background:${team.color}"></span>
        <span class="name">${escapeHtml(team.name)}</span>
        <span class="score">${team.score}</span>
      `;
      container.appendChild(row);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- setup screen ----------
  function makeTeam() {
    const id = state.nextTeamId++;
    const color = TEAM_COLORS[(id - 1) % TEAM_COLORS.length];
    return { id, name: `Team ${id}`, color, score: 0 };
  }

  function renderTeamList() {
    const list = $("teamList");
    list.innerHTML = "";
    state.teams.forEach((team) => {
      const row = document.createElement("div");
      row.className = "team-row";
      row.innerHTML = `
        <span class="team-swatch" style="background:${team.color}"></span>
        <input type="text" maxlength="24" value="${escapeHtml(team.name)}" data-id="${team.id}">
        <button class="team-remove" type="button" data-id="${team.id}" aria-label="Remove team">✕</button>
      `;
      list.appendChild(row);
    });

    list.querySelectorAll("input[type=text]").forEach((input) => {
      input.addEventListener("input", (e) => {
        const team = state.teams.find((t) => t.id === Number(e.target.dataset.id));
        if (team) team.name = e.target.value;
      });
    });
    list.querySelectorAll(".team-remove").forEach((btn) => {
      btn.style.visibility = state.teams.length <= MIN_TEAMS ? "hidden" : "visible";
      btn.addEventListener("click", (e) => {
        const id = Number(e.target.dataset.id);
        state.teams = state.teams.filter((t) => t.id !== id);
        renderTeamList();
      });
    });

    $("addTeamBtn").style.display = state.teams.length >= MAX_TEAMS ? "none" : "inline-block";
  }

  function renderCategoryList() {
    const list = $("categoryList");
    list.innerHTML = "";
    Object.keys(DECK).forEach((cat) => {
      const label = document.createElement("label");
      label.className = "category-row";
      const checked = state.selectedCategories.has(cat) ? "checked" : "";
      label.innerHTML = `
        <input type="checkbox" data-cat="${escapeHtml(cat)}" ${checked}>
        <span class="cat-name">${escapeHtml(cat)}</span>
        <span class="cat-count">${DECK[cat].length} cards</span>
      `;
      list.appendChild(label);
    });
    list.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const cat = e.target.dataset.cat;
        if (e.target.checked) state.selectedCategories.add(cat);
        else state.selectedCategories.delete(cat);
      });
    });
  }

  function setupChipRow(containerId, onPick, initialValue) {
    const container = $(containerId);
    container.querySelectorAll(".chip").forEach((chip) => {
      if (Number(chip.dataset.value) === initialValue) chip.classList.add("chip-active");
      chip.addEventListener("click", () => {
        container.querySelectorAll(".chip").forEach((c) => c.classList.remove("chip-active"));
        chip.classList.add("chip-active");
        onPick(Number(chip.dataset.value));
      });
    });
  }

  function initSetupScreen() {
    state.teams = [makeTeam(), makeTeam()];
    renderTeamList();
    renderCategoryList();
    setupChipRow("timerChoices", (v) => (state.roundSeconds = v), state.roundSeconds);
    setupChipRow("turnChoices", (v) => (state.turnsPerTeam = v), state.turnsPerTeam);

    $("addTeamBtn").addEventListener("click", () => {
      if (state.teams.length >= MAX_TEAMS) return;
      state.teams.push(makeTeam());
      renderTeamList();
    });

    $("startGameBtn").addEventListener("click", startGame);
  }

  // ---------- game flow ----------
  function buildDeck() {
    const cards = [];
    state.selectedCategories.forEach((cat) => {
      (DECK[cat] || []).forEach((word) => cards.push({ category: cat, word }));
    });
    return shuffle(cards);
  }

  function startGame() {
    state.teams.forEach((t) => {
      if (!t.name.trim()) t.name = `Team ${t.id}`;
      t.score = 0;
    });
    if (state.teams.length < MIN_TEAMS) return;
    if (state.selectedCategories.size === 0) return;

    state.deck = buildDeck();
    state.discard = [];

    state.turnQueue = [];
    for (let r = 0; r < state.turnsPerTeam; r++) {
      for (let i = 0; i < state.teams.length; i++) state.turnQueue.push(i);
    }
    state.turnIndex = 0;

    showHandoff();
  }

  function currentTurnTeam() {
    return state.teams[state.turnQueue[state.turnIndex]];
  }

  function showHandoff() {
    const team = currentTurnTeam();
    $("handoffTeamName").textContent = team.name;
    $("handoffTeamName").style.color = team.color;
    renderMiniScoreboard($("handoffScoreboard"), state.teams);
    showScreen("screen-handoff");
  }

  function drawCard() {
    if (state.deck.length === 0) {
      state.deck = shuffle(state.discard);
      state.discard = [];
    }
    if (state.deck.length === 0) return null;
    return state.deck.pop();
  }

  function renderCard() {
    if (!state.currentCard) {
      $("secretCategory").textContent = "";
      $("secretWord").textContent = "No more cards!";
      return;
    }
    $("secretCategory").textContent = state.currentCard.category;
    $("secretWord").textContent = state.currentCard.word;
  }

  function nextCard() {
    if (state.currentCard) state.discard.push(state.currentCard);
    state.currentCard = drawCard();
    renderCard();
  }

  function updatePlayHeader() {
    const team = currentTurnTeam();
    $("playTeamName").textContent = team.name;
    $("playTeamName").style.color = team.color;
    $("playScore").textContent = team.score;
    $("playTimer").textContent = state.timeLeft;
    $("playTimer").classList.toggle("urgent", state.timeLeft <= 10);
  }

  function startTurn() {
    const team = currentTurnTeam();
    state.turnStartScore = team.score;
    state.timeLeft = state.roundSeconds;
    state.currentCard = null;
    nextCard();
    updatePlayHeader();
    showScreen("screen-play");

    clearInterval(state.timerHandle);
    state.timerHandle = setInterval(() => {
      state.timeLeft--;
      updatePlayHeader();
      if (state.timeLeft <= 0) {
        clearInterval(state.timerHandle);
        endTurn();
      }
    }, 1000);
  }

  function flashClub() {
    const el = $("clubFlash");
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), CLUB_FLASH_MS);
  }

  function handleCorrect() {
    if (state.timeLeft <= 0) return;
    currentTurnTeam().score += 1;
    updatePlayHeader();
    nextCard();
  }

  function handleSkip() {
    if (state.timeLeft <= 0) return;
    nextCard();
  }

  function handleClubbed() {
    if (state.timeLeft <= 0) return;
    currentTurnTeam().score -= 1;
    updatePlayHeader();
    flashClub();
    nextCard();
  }

  function endTurn() {
    const team = currentTurnTeam();
    const delta = team.score - state.turnStartScore;
    const verb = delta >= 0 ? "grunted their way to" : "stumbled to";
    $("roundEndSummary").textContent = `${team.name} ${verb} ${delta} point${Math.abs(delta) === 1 ? "" : "s"} this turn.`;
    renderMiniScoreboard($("roundEndScoreboard"), state.teams);

    state.turnIndex++;
    showScreen("screen-roundEnd");

    if (state.turnIndex >= state.turnQueue.length) {
      $("nextTurnBtn").textContent = "See Final Scores 🏆";
    } else {
      $("nextTurnBtn").textContent = "Next Turn ➡️";
    }
  }

  function handleNextTurn() {
    if (state.turnIndex >= state.turnQueue.length) {
      showFinal();
    } else {
      showHandoff();
    }
  }

  function showFinal() {
    const sorted = state.teams.slice().sort((a, b) => b.score - a.score);
    const topScore = sorted[0].score;
    const winners = sorted.filter((t) => t.score === topScore);
    $("finalWinner").textContent =
      winners.length > 1
        ? `It's a Tie: ${winners.map((w) => w.name).join(" & ")}!`
        : `${winners[0].name} Wins!`;
    renderMiniScoreboard($("finalScoreboard"), state.teams);
    showScreen("screen-final");
  }

  function playAgain() {
    showScreen("screen-setup");
  }

  // ---------- wire up ----------
  document.addEventListener("DOMContentLoaded", () => {
    initSetupScreen();
    $("readyBtn").addEventListener("click", startTurn);
    $("correctBtn").addEventListener("click", handleCorrect);
    $("skipBtn").addEventListener("click", handleSkip);
    $("clubbedBtn").addEventListener("click", handleClubbed);
    $("nextTurnBtn").addEventListener("click", handleNextTurn);
    $("playAgainBtn").addEventListener("click", playAgain);
  });
})();
