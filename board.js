import { createPoolStore } from "./pool-store.js";

const BOARD_KEY = "smash-bingo-board-v1";
const store = createPoolStore();

const elements = {
  headerCount: document.querySelector("#headerCount"),
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
  sound: document.querySelector("#tripleBingoSound"),
  toast: document.querySelector("#toast"),
};

let fields = [];
let bonusFields = [];
let boardSize = 4;
let currentBoard = [];
let markedCells = new Set();
let currentBonus = "";
let bonusMarked = false;
let winningLineCount = 0;
let toastTimer;

store.subscribe((state) => {
  fields = state.fields;
  bonusFields = state.bonusFields;
  elements.headerCount.textContent = fields.length;

  if (currentBoard.length && !currentBonus && bonusFields.length) {
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
      bonusField: currentBonus,
      bonusMarked,
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
      saved.fields.length === saved.size * saved.size
    ) {
      boardSize = saved.size;
      currentBoard = saved.fields;
      markedCells = new Set(
        Array.isArray(saved.marked)
          ? saved.marked.filter(
              (index) => Number.isInteger(index) && index >= 0 && index < currentBoard.length,
            )
          : [],
      );
      currentBonus = typeof saved.bonusField === "string" ? saved.bonusField : "";
      bonusMarked = Boolean(currentBonus && saved.bonusMarked);
      if (!currentBonus && bonusFields.length) currentBonus = pickRandom(bonusFields);
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
  const needed = boardSize * boardSize;
  elements.boardStatus.classList.remove("is-success");

  if (fields.length < needed) {
    const missing = needed - fields.length;
    elements.boardStatus.innerHTML = `Noch ${missing} ${missing === 1 ? "Feld" : "Felder"} nötig. <a href="pool.html">Pool ergänzen</a>`;
    return;
  }

  currentBoard = shuffle(fields).slice(0, needed);
  markedCells = new Set();
  currentBonus = pickRandom(bonusFields);
  bonusMarked = false;
  winningLineCount = 0;
  stopTripleBingoSound();
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
  if (
    currentBoard.length &&
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
  const boardTracks = `repeat(${boardSize}, minmax(0, 1fr))`;
  elements.board.style.gridTemplateColumns = boardTracks;
  elements.board.style.gridTemplateRows = boardTracks;

  currentBoard.forEach((field, index) => {
    const cell = document.createElement("div");
    cell.className = "bingo-cell";
    cell.dataset.index = index;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "bingo-cell-toggle";
    toggle.dataset.index = index;
    toggle.setAttribute("aria-pressed", markedCells.has(index) ? "true" : "false");
    toggle.setAttribute("aria-label", `${field} ${markedCells.has(index) ? "als offen markieren" : "abhaken"}`);

    const label = document.createElement("span");
    label.className = "bingo-cell-label";
    label.textContent = field;
    toggle.append(label);

    const reroll = document.createElement("button");
    reroll.type = "button";
    reroll.className = "reroll-cell";
    reroll.dataset.index = index;
    reroll.textContent = "↻";
    reroll.title = "Feld neu zufällig besetzen";
    reroll.setAttribute("aria-label", `„${field}“ neu zufällig besetzen`);

    if (markedCells.has(index)) cell.classList.add("is-marked");
    cell.append(toggle, reroll);
    elements.board.append(cell);
  });

  updateWinningLines();
}

function toggleCell(index) {
  if (markedCells.has(index)) markedCells.delete(index);
  else markedCells.add(index);

  const cell = elements.board.querySelector(`.bingo-cell[data-index="${index}"]`);
  cell?.classList.toggle("is-marked", markedCells.has(index));
  const toggle = cell?.querySelector(".bingo-cell-toggle");
  toggle?.setAttribute("aria-pressed", markedCells.has(index) ? "true" : "false");
  toggle?.setAttribute(
    "aria-label",
    `${currentBoard[index]} ${markedCells.has(index) ? "als offen markieren" : "abhaken"}`,
  );
  updateWinningLines(true);
  saveBoard();
}

function rerollCell(index) {
  const availableFields = fields.filter((field) => !currentBoard.includes(field));
  if (!availableFields.length) {
    showToast("Kein unbenutztes Feld verfügbar · ergänze den Pool");
    return;
  }

  const oldField = currentBoard[index];
  const newField = pickRandom(availableFields);
  currentBoard[index] = newField;
  markedCells.delete(index);
  renderBoard();
  saveBoard();
  showToast(`„${oldField}“ durch „${newField}“ ersetzt`);
}

async function confirmAndRerollCell(index) {
  const field = currentBoard[index];
  if (!field) return;

  const confirmed = await requestConfirmation({
    title: "Feld neu rollen?",
    message: `„${field}“ wird gelöscht und durch ein anderes zufälliges Feld ersetzt.`,
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
}

function toggleBonus() {
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

  if (allowSound && winningLineCount < 3 && winningLines.length >= 3) {
    playTripleBingoSound();
  }
  winningLineCount = winningLines.length;
}

function playTripleBingoSound() {
  elements.sound.currentTime = 0;
  elements.sound.play().catch(() => {
    showToast("Dreifach-Bingo! Sound konnte nicht gestartet werden.");
  });
  showToast("Dreifach-Bingo! 🔊");
}

function stopTripleBingoSound() {
  elements.sound.pause();
  elements.sound.currentTime = 0;
}

async function setBoardSize(size) {
  if (size === boardSize) return;
  if (
    currentBoard.length &&
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
  currentBoard = [];
  markedCells = new Set();
  currentBonus = "";
  bonusMarked = false;
  winningLineCount = 0;
  stopTripleBingoSound();
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

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
}

elements.sizeButtons.forEach((button) => {
  button.addEventListener("click", () => setBoardSize(Number(button.dataset.size)));
});
elements.generateButton.addEventListener("click", confirmAndGenerateBoard);
elements.bonusButton.addEventListener("click", toggleBonus);
elements.board.addEventListener("click", (event) => {
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
