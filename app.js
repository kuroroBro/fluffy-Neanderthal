(function () {
  "use strict";

  const TEAM_COLORS = ["#ff595e", "#1982c4", "#8ac926", "#ffca3a", "#6a4c93", "#f4a261"];
  const MAX_TEAMS = 6;
  const MIN_TEAMS = 2;
  const CLUB_FLASH_MS = 750;

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

  const STORAGE_PREFIX = "pfn.";

  function clearAppStorage() {
    [window.localStorage, window.sessionStorage].forEach((store) => {
      try {
        Object.keys(store)
          .filter((k) => k.startsWith(STORAGE_PREFIX))
          .forEach((k) => store.removeItem(k));
      } catch (e) {
        // storage unavailable (private browsing, etc.) — nothing to clear
      }
    });
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

  function resetSetup() {
    clearAppStorage();
    state.nextTeamId = 1;
    state.teams = [makeTeam(), makeTeam()];
    state.roundSeconds = 60;
    state.turnsPerTeam = 3;
    state.selectedCategories = new Set(Object.keys(DECK));

    renderTeamList();
    renderCategoryList();
    document.querySelectorAll("#timerChoices .chip").forEach((c) => {
      c.classList.toggle("chip-active", Number(c.dataset.value) === state.roundSeconds);
    });
    document.querySelectorAll("#turnChoices .chip").forEach((c) => {
      c.classList.toggle("chip-active", Number(c.dataset.value) === state.turnsPerTeam);
    });
  }

  // ---------- game flow ----------
  function buildDeck() {
    const cards = [];
    state.selectedCategories.forEach((cat) => {
      (DECK[cat] || []).forEach((card) => cards.push({ category: cat, top: card.top, phrase: card.phrase }));
    });
    return shuffle(cards);
  }

  function ensureUniqueTeamNames() {
    const seen = new Map();
    state.teams.forEach((t) => {
      const key = t.name.trim().toLowerCase();
      const count = (seen.get(key) || 0) + 1;
      seen.set(key, count);
      if (count > 1) t.name = `${t.name.trim()} (${count})`;
    });
  }

  function startGame() {
    state.teams.forEach((t) => {
      if (!t.name.trim()) t.name = `Team ${t.id}`;
      t.score = 0;
    });
    ensureUniqueTeamNames();
    renderTeamList();
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
    const nameEl = $("handoffTeamName");
    if (nameEl) {
      nameEl.textContent = team.name;
      nameEl.style.color = team.color;
    }
    renderMiniScoreboard($("handoffScoreboard"), state.teams);
    showScreen("screen-handoff");
  }

  function drawCard(avoidCard) {
    if (state.deck.length === 0) {
      state.deck = shuffle(state.discard);
      state.discard = [];
      // Avoid handing back the exact card that was just shown when the
      // deck recycles from the discard pile.
      const lastIdx = state.deck.length - 1;
      if (avoidCard && lastIdx > 0 && state.deck[lastIdx] === avoidCard) {
        const swapIdx = Math.floor(Math.random() * lastIdx);
        [state.deck[lastIdx], state.deck[swapIdx]] = [state.deck[swapIdx], state.deck[lastIdx]];
      }
    }
    if (state.deck.length === 0) return null;
    return state.deck.pop();
  }

  function renderCard() {
    const categoryEl = $("secretCategory");
    const topEl = $("secretTop");
    const phraseEl = $("secretPhrase");
    if (!state.currentCard) {
      if (categoryEl) categoryEl.textContent = "";
      if (topEl) topEl.textContent = "No more cards!";
      if (phraseEl) phraseEl.textContent = "";
      return;
    }
    if (categoryEl) categoryEl.textContent = state.currentCard.category;
    if (topEl) topEl.textContent = state.currentCard.top;
    if (phraseEl) phraseEl.textContent = state.currentCard.phrase;
  }

  function nextCard() {
    const previousCard = state.currentCard;
    if (state.currentCard) state.discard.push(state.currentCard);
    state.currentCard = drawCard(previousCard);
    renderCard();
  }

  function updatePlayHeader() {
    const team = currentTurnTeam();
    const nameEl = $("playTeamName");
    if (nameEl) {
      nameEl.textContent = team.name;
      nameEl.style.color = team.color;
    }
    const scoreEl = $("playScore");
    if (scoreEl) scoreEl.textContent = team.score;
    const timerEl = $("playTimer");
    if (timerEl) {
      timerEl.textContent = state.timeLeft;
      timerEl.classList.toggle("urgent", state.timeLeft <= 10);
    }
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
    const card = $("secretCard");
    el.classList.add("show");
    if (card) card.classList.add("card-hit");
    setTimeout(() => {
      el.classList.remove("show");
      if (card) card.classList.remove("card-hit");
    }, CLUB_FLASH_MS);
  }

  function handleTopWord() {
    if (state.timeLeft <= 0) return;
    currentTurnTeam().score += 1;
    updatePlayHeader();
    nextCard();
  }

  function handleFullPhrase() {
    if (state.timeLeft <= 0) return;
    currentTurnTeam().score += 3;
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
    const winnerEl = $("finalWinner");
    if (winnerEl) {
      winnerEl.textContent =
        winners.length > 1
          ? `It's a Tie: ${winners.map((w) => w.name).join(" & ")}!`
          : `${winners[0].name} Wins!`;
    }
    renderMiniScoreboard($("finalScoreboard"), state.teams);
    showScreen("screen-final");
  }

  function playAgain() {
    showScreen("screen-setup");
  }

  // ---------- wire up ----------
  function on(id, handler) {
    const el = $(id);
    if (!el) {
      console.error(`Missing #${id} — page may be a stale cached mix of files. Hard-refresh.`);
      return;
    }
    el.addEventListener("click", handler);
  }

  document.addEventListener("DOMContentLoaded", () => {
    initSetupScreen();
    on("readyBtn", startTurn);
    on("topBtn", handleTopWord);
    on("phraseBtn", handleFullPhrase);
    on("skipBtn", handleSkip);
    on("clubbedBtn", handleClubbed);
    on("nextTurnBtn", handleNextTurn);
    on("playAgainBtn", playAgain);
    on("resetBtn", resetSetup);
  });
})();
