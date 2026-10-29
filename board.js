import { createPoolStore } from "./pool-store.js";
import { PLAYERS, createLeaderboardStore } from "./leaderboard-store.js";
import { createLeaderboardEditor } from "./leaderboard-editor.js";
import { fieldLabel, fieldTarget, isBingoField, sameField, restoreCellProgress } from "./field-model.js";

const BOARD_KEY = "smash-bingo-board-v1";
const store = createPoolStore();
const leaderboard = createLeaderboardStore();
createLeaderboardEditor(leaderboard);
const PLAYER_KEY = "smash-bingo-player-v1";

const elements = {
  headerCount: document.querySelector("#headerCount"),
  playerButtons: [...document.querySelectorAll(".player-option")],
  roundInfo: document.querySelector("#roundInfo"),
  finishButton: document.querySelector("#finishRoundButton"),
  leaderboardList: document.querySelector("#leaderboardList"),
  leaderboardStatus: document.querySelector("#leaderboardStatus"),
  sizeButtons: [...document.querySelectorAll(".size-option")],
  generateButton: document.querySelector("#generateButton"),
  board: document.querySelector("#bingoBoard"),
  boardEmpty: document.querySelector("#boardEmpty"),
  boardStatus: document.querySelector("#boardStatus"),
  bonusCard: document.querySelector("#bonusCard"),
  bonusButton: document.querySelector("#bonusFieldButton"),
  bonusText: document.querySelector("#bonusFieldText"),
  bonusResult: document.querySelector("#bonusFieldResult"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmTitle: document.querySelector("#confirmDialogTitle"),
  confirmMessage: document.querySelector("#confirmDialogMessage"),
  confirmAccept: document.querySelector("#confirmDialogAccept"),
  sounds: {
    single: document.querySelector("#singleBingoSound"),
    double: document.querySelector("#doubleBingoSound"),
    triple: document.querySelector("#tripleBingoSound"),
    four: document.querySelector("#fourBingoSound"),
    five: document.querySelector("#fiveBingoSound"),
    six: document.querySelector("#sixBingoSound"),
    seven: document.querySelector("#sevenBingoSound"),
    full: document.querySelector("#fullBoardSound"),
  },
  toast: document.querySelector("#toast"),
};

let fields = [];
let bonusFields = [];
let boardSize = 4;
let currentBoard = [];
let markedCells = new Set();
let cellProgress = [];
let currentBonus = "";
let bonusMarked = false;
let winningLineCount = 0;
let boardWasFull = false;
let activeSound = null;
let soundStopTimer;
let soundPlaybackId = 0;
let toastTimer;
let selectedPlayer = "";
try {
  const savedPlayer = localStorage.getItem(PLAYER_KEY);
  if (PLAYERS.includes(savedPlayer)) selectedPlayer = savedPlayer;
} catch { /* Player selection still works without a preference cache. */ }
let roundPlayer = "";
let roundId = "";
let roundState = "active";
let finishingRound = false;
let roundError = "";

leaderboard.subscribe(({ scores, status }) => {
  elements.leaderboardStatus.textContent = status;
  elements.leaderboardList.replaceChildren();
  for (const score of scores) {
    const item = document.createElement("li");
    item.className = "leaderboard-row";
    const rank = document.createElement("span");
    rank.className = "leaderboard-rank";
    rank.textContent = score.rank + ".";
    const name = document.createElement("strong");
    name.textContent = score.player;
    const total = document.createElement("span");
    total.className = "leaderboard-total";
    total.textContent = score.bingos + " Bingos";
    item.append(rank, name, total);
    elements.leaderboardList.append(item);
  }
});

store.subscribe((state) => {
  fields = state.fields;
  bonusFields = state.bonusFields;
  elements.headerCount.textContent = fields.length;

  if (currentBoard.length && !currentBonus && bonusFields.length && roundState === "active" && !finishingRound) {
    currentBonus = pickRandom(bonusFields);
    bonusMarked = false;
    renderBonus();
    saveBoard();
  }
});

function saveBoard() {
  localStorage.setItem(
    BOARD_KEY,
    JSON.stringify({
      size: boardSize,
      fields: currentBoard,
      marked: [...markedCells],
      progress: [...cellProgress],
      bonusField: currentBonus,
      bonusMarked,
      roundId,
      roundPlayer,
      roundState,
    }),
  );
}

function restoreBoard() {
  try {
    const saved = JSON.parse(localStorage.getItem(BOARD_KEY));
    if (
      saved &&
      [4, 5].includes(saved.size) &&
      Array.isArray(saved.fields) &&
      saved.fields.every(isBingoField) &&
      saved.fields.length === saved.size * saved.size
    ) {
      roundId = typeof saved.roundId === "string" && /^[a-zA-Z0-9_-]{20,80}$/.test(saved.roundId)
        ? saved.roundId : crypto.randomUUID();
      roundPlayer = PLAYERS.includes(saved.roundPlayer) ? saved.roundPlayer : "";
      if (roundPlayer) selectedPlayer = roundPlayer;
      roundState = roundPlayer && ["pending", "completed"].includes(saved.roundState) ? saved.roundState : "active";
      boardSize = saved.size;
      currentBoard = saved.fields;
      cellProgress = restoreCellProgress(currentBoard, saved.progress, saved.marked);
      markedCells = new Set(currentBoard.map((field, index) =>
        cellProgress[index] >= fieldTarget(field) ? index : -1).filter((index) => index >= 0));
      currentBonus = typeof saved.bonusField === "string" ? saved.bonusField : "";
      bonusMarked = Boolean(currentBonus && saved.bonusMarked);
      if (!currentBonus && bonusFields.length && roundState === "active") currentBonus = pickRandom(bonusFields);
      updateSizeButtons();
      renderBoard();
      renderBonus();
      saveBoard();
    }
  } catch {
    localStorage.removeItem(BOARD_KEY);
  }
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)] || "";
}

function generateBoard() {
  if (finishingRound || roundState === "pending") return;
  if (!selectedPlayer) {
    showToast("Wähle zuerst Daniel, Fabian oder Tim aus.");
    elements.playerButtons[0]?.focus();
    return;
  }
  const needed = boardSize * boardSize;
  elements.boardStatus.classList.remove("is-success");

  if (fields.length < needed) {
    const missing = needed - fields.length;
    elements.boardStatus.innerHTML = `Noch ${missing} ${missing === 1 ? "Feld" : "Felder"} nötig. <a href="pool.html">Pool ergänzen</a>`;
    return;
  }

  roundId = crypto.randomUUID();
  roundPlayer = selectedPlayer;
  roundState = "active";
  roundError = "";
  currentBoard = shuffle(fields).slice(0, needed);
  markedCells = new Set();
  cellProgress = currentBoard.map(() => 0);
  currentBonus = pickRandom(bonusFields);
  bonusMarked = false;
  winningLineCount = 0;
  boardWasFull = false;
  stopBingoSound();
  renderBoard();
  renderBonus();
  saveBoard();
  showToast(
    currentBonus
      ? `${boardSize} × ${boardSize} Board samt Bonus frisch gemischt`
      : `${boardSize} × ${boardSize} Board gemischt · Bonus-Pool ist leer`,
  );
}

async function requestConfirmation({ title, message, confirmLabel }) {
  if (typeof elements.confirmDialog.showModal !== "function") {
    return window.confirm(message);
  }

  elements.confirmTitle.textContent = title;
  elements.confirmMessage.textContent = message;
  elements.confirmAccept.textContent = confirmLabel;
  elements.confirmDialog.returnValue = "cancel";

  return new Promise((resolve) => {
    elements.confirmDialog.addEventListener(
      "close",
      () => resolve(elements.confirmDialog.returnValue === "confirm"),
      { once: true },
    );
    elements.confirmDialog.showModal();
  });
}

async function confirmAndGenerateBoard() {
  if (finishingRound || roundState === "pending") return;
  if (
    currentBoard.length && roundState === "active" &&
    !(await requestConfirmation({
      title: "Neues Board mischen?",
      message: "Das aktuelle Board, das Bonus-Feld und alle Markierungen werden unwiderruflich ersetzt.",
      confirmLabel: "Board neu mischen",
    }))
  ) {
    return;
  }
  generateBoard();
}

function renderBoard() {
  elements.board.replaceChildren();
  elements.board.hidden = false;
  elements.boardEmpty.hidden = true;
  elements.board.dataset.size = boardSize;
  elements.board.classList.toggle("has-counted-fields", currentBoard.some((field) => fieldTarget(field) > 1));
  const boardTracks = `repeat(${boardSize}, minmax(0, 1fr))`;
  elements.board.style.gridTemplateColumns = boardTracks;
  elements.board.style.gridTemplateRows = boardTracks;

  currentBoard.forEach((field, index) => {
    const target = fieldTarget(field);
    const counted = target > 1;
    const text = fieldLabel(field);
    const cell = document.createElement("div");
    cell.className = counted ? "bingo-cell is-counted" : "bingo-cell";
    cell.dataset.index = index;

    const toggle = document.createElement(counted ? "div" : "button");
    if (!counted) toggle.type = "button";
    toggle.className = "bingo-cell-toggle";
    toggle.dataset.index = index;
    if (!counted) toggle.setAttribute("aria-pressed", markedCells.has(index) ? "true" : "false");
    toggle.setAttribute("aria-label", counted ? text : `${text} ${markedCells.has(index) ? "als offen markieren" : "abhaken"}`);

    const label = document.createElement("span");
    label.className = "bingo-cell-label";
    label.textContent = text;
    toggle.append(label);

    if (counted) {
      const counter = document.createElement("div");
      counter.className = "cell-counter";
      const minus = document.createElement("button");
      minus.type = "button";
      minus.className = "cell-count-button";
      minus.dataset.index = index;
      minus.dataset.delta = "-1";
      minus.textContent = "−";
      minus.setAttribute("aria-label", `„${text}“: Anzahl um eins verringern`);
      const progress = document.createElement("span");
      progress.className = "cell-progress";
      progress.textContent = `${cellProgress[index]} / ${target}`;
      progress.setAttribute("role", "status");
      progress.setAttribute("aria-label", `${cellProgress[index]} von ${target} erfüllt`);
      const plus = document.createElement("button");
      plus.type = "button";
      plus.className = "cell-count-button";
      plus.dataset.index = index;
      plus.dataset.delta = "1";
      plus.textContent = "+";
      plus.setAttribute("aria-label", `„${text}“: Anzahl um eins erhöhen`);
      counter.append(minus, progress, plus);
      toggle.append(counter);
    }

    const reroll = document.createElement("button");
    reroll.type = "button";
    reroll.className = "reroll-cell";
    reroll.dataset.index = index;
    reroll.textContent = "↻";
    reroll.title = "Feld neu zufällig besetzen";
    reroll.setAttribute("aria-label", `„${text}“ neu zufällig besetzen`);

    if (markedCells.has(index)) cell.classList.add("is-marked");
    cell.append(toggle, reroll);
    elements.board.append(cell);
  });

  updateWinningLines();
  renderRoundControls();
}

function toggleCell(index) {
  if (!currentBoard[index] || fieldTarget(currentBoard[index]) !== 1) return;
  changeCellProgress(index, markedCells.has(index) ? -1 : 1);
}

function changeCellProgress(index, delta) {
  if (!canEditRound() || !Number.isInteger(index) || !currentBoard[index] || ![-1, 1].includes(delta)) return;
  const target = fieldTarget(currentBoard[index]);
  const next = Math.max(0, Math.min(target, (cellProgress[index] || 0) + delta));
  if (next === cellProgress[index]) return;
  cellProgress[index] = next;
  if (next >= target) markedCells.add(index);
  else markedCells.delete(index);

  const cell = elements.board.querySelector(`.bingo-cell[data-index="${index}"]`);
  cell?.classList.toggle("is-marked", markedCells.has(index));
  const toggle = cell?.querySelector(".bingo-cell-toggle");
  if (target === 1) {
    toggle?.setAttribute("aria-pressed", markedCells.has(index) ? "true" : "false");
    toggle?.setAttribute("aria-label", `${fieldLabel(currentBoard[index])} ${markedCells.has(index) ? "als offen markieren" : "abhaken"}`);
  }
  const progress = cell?.querySelector(".cell-progress");
  if (progress) {
    progress.textContent = `${next} / ${target}`;
    progress.setAttribute("aria-label", `${next} von ${target} erfüllt`);
  }
  updateWinningLines(true);
  saveBoard();
}

function rerollCell(index) {
  if (!canEditRound()) return;
  const availableFields = fields.filter((field) => !currentBoard.some((existing) => sameField(existing, field)));
  if (!availableFields.length) {
    showToast("Kein unbenutztes Feld verfügbar · ergänze den Pool");
    return;
  }

  const oldField = currentBoard[index];
  const newField = pickRandom(availableFields);
  currentBoard[index] = newField;
  markedCells.delete(index);
  cellProgress[index] = 0;
  renderBoard();
  saveBoard();
  showToast(`„${fieldLabel(oldField)}“ durch „${fieldLabel(newField)}“ ersetzt`);
}

async function confirmAndRerollCell(index) {
  if (!canEditRound()) return;
  const field = currentBoard[index];
  if (!field) return;

  const confirmed = await requestConfirmation({
    title: "Feld neu rollen?",
    message: `„${fieldLabel(field)}“ wird gelöscht und durch ein anderes zufälliges Feld ersetzt.`,
    confirmLabel: "Feld neu rollen",
  });
  if (confirmed) rerollCell(index);
}

function renderBonus() {
  const hasBonus = Boolean(currentBonus);
  elements.bonusCard.classList.toggle("is-empty", !hasBonus);
  elements.bonusCard.classList.toggle("is-marked", hasBonus && bonusMarked);
  elements.bonusButton.disabled = !hasBonus;
  elements.bonusButton.setAttribute("aria-pressed", bonusMarked ? "true" : "false");

  if (hasBonus) {
    elements.bonusText.textContent = currentBonus;
    elements.bonusResult.textContent = bonusMarked ? "BONUS BINGO!" : "Antippen, sobald erfüllt";
  } else if (currentBoard.length) {
    elements.bonusText.textContent = "Der Bonus-Pool ist leer. Ergänze ihn auf der Pool-Seite.";
    elements.bonusResult.textContent = "";
  } else {
    elements.bonusText.textContent = "Wird zusammen mit dem nächsten Board gezogen.";
    elements.bonusResult.textContent = "";
  }
  renderRoundControls();
}

function toggleBonus() {
  if (!canEditRound()) return;
  if (!currentBonus) return;
  bonusMarked = !bonusMarked;
  renderBonus();
  saveBoard();
  showToast(bonusMarked ? "Extra Bonus-Bingo geschafft!" : "Bonus-Markierung entfernt");
}

function getLines() {
  const lines = [];
  for (let row = 0; row < boardSize; row += 1) {
    lines.push(Array.from({ length: boardSize }, (_, col) => row * boardSize + col));
  }
  for (let col = 0; col < boardSize; col += 1) {
    lines.push(Array.from({ length: boardSize }, (_, row) => row * boardSize + col));
  }
  lines.push(Array.from({ length: boardSize }, (_, index) => index * boardSize + index));
  lines.push(Array.from({ length: boardSize }, (_, index) => (index + 1) * (boardSize - 1)));
  return lines;
}

function updateWinningLines(allowSound = false) {
  elements.board.querySelectorAll(".bingo-cell").forEach((cell) => cell.classList.remove("is-winning"));
  const winningLines = getLines().filter((line) => line.every((index) => markedCells.has(index)));

  winningLines.flat().forEach((index) => {
    elements.board.querySelector(`.bingo-cell[data-index="${index}"]`)?.classList.add("is-winning");
  });

  if (winningLines.length) {
    elements.boardStatus.textContent = winningLines.length > 1 ? `BINGO × ${winningLines.length}!` : "BINGO!";
    elements.boardStatus.classList.add("is-success");
  } else {
    elements.boardStatus.textContent = "";
    elements.boardStatus.classList.remove("is-success");
  }

  const boardIsFull = currentBoard.length > 0 && markedCells.size === currentBoard.length;
  if (allowSound) {
    if (boardIsFull && !boardWasFull) playBingoSound("full", "Ganzes Board voll!");
    else if (winningLineCount < 7 && winningLines.length >= 7) playBingoSound("seven", "Siebenfach-Bingo!");
    else if (winningLineCount < 6 && winningLines.length >= 6) playBingoSound("six", "Sechsfach-Bingo!");
    else if (winningLineCount < 5 && winningLines.length >= 5) playBingoSound("five", "Fünffach-Bingo!");
    else if (winningLineCount < 4 && winningLines.length >= 4) playBingoSound("four", "Vierfach-Bingo!", 8);
    else if (winningLineCount < 3 && winningLines.length >= 3) playBingoSound("triple", "Dreifach-Bingo!");
    else if (winningLineCount < 2 && winningLines.length >= 2) playBingoSound("double", "Doppel-Bingo!", 4);
    else if (winningLineCount < 1 && winningLines.length >= 1) playBingoSound("single", "Bingo!", 5);
  }
  winningLineCount = winningLines.length;
  boardWasFull = boardIsFull;
  renderRoundControls();
}

function playBingoSound(key, message, maxSeconds) {
  stopBingoSound();
  const sound = elements.sounds[key];
  const playbackId = soundPlaybackId;
  activeSound = sound;
  // Keep play() directly in the click handler for mobile user activation.
  try {
    sound.currentTime = 0;
    sound.onplaying = () => {
      if (playbackId !== soundPlaybackId) return;
      showToast(message + " 🔊");
      if (maxSeconds) {
        window.clearTimeout(soundStopTimer);
        soundStopTimer = window.setTimeout(
          () => { if (playbackId === soundPlaybackId) stopBingoSound(); },
          Math.max(0, maxSeconds - sound.currentTime) * 1000,
        );
      }
    };
    sound.ontimeupdate = () => {
      if (maxSeconds && sound.currentTime >= maxSeconds && playbackId === soundPlaybackId) stopBingoSound();
    };
    sound.onended = () => { if (playbackId === soundPlaybackId) stopBingoSound(); };
    sound.play().catch((error) => reportSoundError(error, playbackId, message));
  } catch (error) {
    reportSoundError(error, playbackId, message);
  }
}

function reportSoundError(error, playbackId, message) {
  if (playbackId !== soundPlaybackId || error.name === "AbortError") return;
  console.warn("Bingo-Sound konnte nicht abgespielt werden:", error);
  stopBingoSound();
  showToast(error.name === "NotAllowedError"
    ? message + " Bitte Sound für diese Website im Browser erlauben."
    : message + " Sound nicht verfügbar – bitte Seite neu laden.");
}

function stopBingoSound() {
  soundPlaybackId += 1;
  window.clearTimeout(soundStopTimer);
  if (!activeSound) return;
  activeSound.onplaying = null;
  activeSound.ontimeupdate = null;
  activeSound.onended = null;
  activeSound.pause();
  activeSound.currentTime = 0;
  activeSound = null;
}

async function setBoardSize(size) {
  if (finishingRound || roundState === "pending") return;
  if (size === boardSize) return;
  if (
    currentBoard.length && roundState === "active" &&
    !(await requestConfirmation({
      title: `Auf ${size} × ${size} wechseln?`,
      message: "Das aktuelle Board, das Bonus-Feld und alle Markierungen werden dabei gelöscht.",
      confirmLabel: "Größe ändern",
    }))
  ) {
    updateSizeButtons();
    return;
  }

  boardSize = size;
  roundError = "";
  roundId = "";
  roundPlayer = "";
  roundState = "active";
  currentBoard = [];
  markedCells = new Set();
  cellProgress = [];
  currentBonus = "";
  bonusMarked = false;
  winningLineCount = 0;
  boardWasFull = false;
  stopBingoSound();
  elements.board.replaceChildren();
  elements.board.hidden = true;
  elements.boardEmpty.hidden = false;
  localStorage.removeItem(BOARD_KEY);
  updateSizeButtons();
  renderBonus();
  elements.boardStatus.textContent = `Bereit für ein ${boardSize} × ${boardSize} Board.`;
  elements.boardStatus.classList.remove("is-success");
}

function updateSizeButtons() {
  elements.sizeButtons.forEach((button) => {
    const isActive = Number(button.dataset.size) === boardSize;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function canEditRound() {
  return Boolean(currentBoard.length && roundPlayer && roundState === "active" && !finishingRound);
}

function renderRoundControls() {
  const hasBoard = currentBoard.length > 0;
  const locked = !canEditRound();
  const score = winningLineCount + Number(Boolean(currentBonus && bonusMarked));
  for (const button of elements.playerButtons) {
    const active = button.dataset.player === (hasBoard && roundState !== "completed" ? roundPlayer : selectedPlayer);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    button.disabled = finishingRound || roundState === "pending";
  }
  elements.board.querySelectorAll("button").forEach((button) => { button.disabled = locked; });
  elements.board.querySelectorAll(".cell-count-button").forEach((button) => {
    const index = Number(button.dataset.index);
    const delta = Number(button.dataset.delta);
    button.disabled = locked || (delta < 0 ? cellProgress[index] <= 0 : cellProgress[index] >= fieldTarget(currentBoard[index]));
  });
  elements.bonusButton.disabled = locked || !currentBonus;
  elements.generateButton.disabled = finishingRound || roundState === "pending" || !selectedPlayer;
  elements.sizeButtons.forEach((button) => { button.disabled = finishingRound || roundState === "pending"; });
  elements.finishButton.hidden = !hasBoard;
  elements.finishButton.disabled = finishingRound || !roundPlayer || roundState === "completed";
  elements.finishButton.textContent = finishingRound ? "Bitte warten …"
    : roundState === "completed" ? "Runde gespeichert ✓"
    : roundState === "pending" ? "Ergebnis erneut speichern" : "Fertig · Runde abschließen";
  elements.roundInfo.textContent = roundError || (!hasBoard
    ? "Wähle deinen Namen, bevor du ein Board mischst."
    : !roundPlayer ? "Wähle deinen Namen, um dieses Board weiterzuspielen."
    : roundState === "completed" ? roundPlayer + " · Runde abgeschlossen · " + score + " Bingos gespeichert"
    : roundState === "pending" ? roundPlayer + " · " + score + " Bingos · Ergebnis noch nicht bestätigt. Bitte erneut speichern."
    : roundPlayer + " · Aktuelle Runde: " + score + " Bingos (inklusive Bonus)");
}

function selectPlayer(player) {
  if (!PLAYERS.includes(player) || finishingRound || roundState === "pending") return;
  selectedPlayer = player;
  try { localStorage.setItem(PLAYER_KEY, player); } catch { /* Optional preference cache. */ }
  if (currentBoard.length && roundState === "active") {
    roundPlayer = player;
    saveBoard();
  }
  renderRoundControls();
}

async function finishRound() {
  if (!currentBoard.length || !roundPlayer || roundState === "completed" || finishingRound) return;
  finishingRound = true;
  roundError = "";
  renderRoundControls();
  try {
    const score = winningLineCount + Number(Boolean(currentBonus && bonusMarked));
    if (roundState !== "pending" && !(await requestConfirmation({
      title: "Runde abschließen?",
      message: roundPlayer + " erhält " + score + " Bingos inklusive Bonus. Danach ist dieses Board abgeschlossen.",
      confirmLabel: "Runde speichern",
    }))) return;
    roundState = "pending";
    // Persist the fixed ID and frozen result before making a network request.
    saveBoard();
    stopBingoSound();
    renderRoundControls();
    await leaderboard.finishRound({
      id: roundId,
      player: roundPlayer,
      boardSize,
      bingos: winningLineCount,
      bonusBingo: Boolean(currentBonus && bonusMarked),
    });
    roundState = "completed";
    saveBoard();
    showToast(roundPlayer + " · " + score + " Bingos gespeichert!");
  } catch (error) {
    roundError = error.message || "Ergebnis konnte nicht gespeichert werden. Bitte erneut versuchen.";
    showToast(roundError);
  } finally {
    finishingRound = false;
    renderRoundControls();
  }
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
}

elements.sizeButtons.forEach((button) => {
  button.addEventListener("click", () => setBoardSize(Number(button.dataset.size)));
});
elements.playerButtons.forEach((button) => {
  button.addEventListener("click", () => selectPlayer(button.dataset.player));
});
elements.finishButton.addEventListener("click", finishRound);
elements.generateButton.addEventListener("click", confirmAndGenerateBoard);
elements.bonusButton.addEventListener("click", toggleBonus);
elements.board.addEventListener("click", (event) => {
  const countButton = event.target.closest(".cell-count-button");
  if (countButton) {
    changeCellProgress(Number(countButton.dataset.index), Number(countButton.dataset.delta));
    return;
  }
  const rerollButton = event.target.closest(".reroll-cell");
  if (rerollButton) {
    confirmAndRerollCell(Number(rerollButton.dataset.index));
    return;
  }

  const toggleButton = event.target.closest(".bingo-cell-toggle");
  if (toggleButton) toggleCell(Number(toggleButton.dataset.index));
});

restoreBoard();
renderBonus();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js"));
}
