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
  toast: document.querySelector("#toast"),
};

let fields = [];
let boardSize = 4;
let currentBoard = [];
let markedCells = new Set();
let toastTimer;

store.subscribe((state) => {
  fields = state.fields;
  elements.headerCount.textContent = fields.length;
});

function saveBoard() {
  localStorage.setItem(
    BOARD_KEY,
    JSON.stringify({ size: boardSize, fields: currentBoard, marked: [...markedCells] }),
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
      markedCells = new Set(Array.isArray(saved.marked) ? saved.marked : []);
      updateSizeButtons();
      renderBoard();
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
  renderBoard();
  saveBoard();
  showToast(`${boardSize} × ${boardSize} Board frisch gemischt`);
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
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "bingo-cell";
    cell.dataset.index = index;
    cell.textContent = field;
    cell.setAttribute("aria-pressed", markedCells.has(index) ? "true" : "false");
    if (markedCells.has(index)) cell.classList.add("is-marked");
    elements.board.append(cell);
  });

  updateWinningLines();
}

function toggleCell(index) {
  if (markedCells.has(index)) markedCells.delete(index);
  else markedCells.add(index);

  const cell = elements.board.querySelector(`[data-index="${index}"]`);
  cell.classList.toggle("is-marked", markedCells.has(index));
  cell.setAttribute("aria-pressed", markedCells.has(index) ? "true" : "false");
  updateWinningLines();
  saveBoard();
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

function updateWinningLines() {
  elements.board.querySelectorAll(".bingo-cell").forEach((cell) => cell.classList.remove("is-winning"));
  const winningLines = getLines().filter((line) => line.every((index) => markedCells.has(index)));

  winningLines.flat().forEach((index) => {
    elements.board.querySelector(`[data-index="${index}"]`)?.classList.add("is-winning");
  });

  if (winningLines.length) {
    elements.boardStatus.textContent = winningLines.length > 1 ? `BINGO × ${winningLines.length}!` : "BINGO!";
    elements.boardStatus.classList.add("is-success");
  } else {
    elements.boardStatus.textContent = "";
    elements.boardStatus.classList.remove("is-success");
  }
}

function setBoardSize(size) {
  if (size === boardSize) return;
  boardSize = size;
  currentBoard = [];
  markedCells = new Set();
  elements.board.replaceChildren();
  elements.board.hidden = true;
  elements.boardEmpty.hidden = false;
  localStorage.removeItem(BOARD_KEY);
  updateSizeButtons();
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
elements.generateButton.addEventListener("click", generateBoard);
elements.board.addEventListener("click", (event) => {
  const cell = event.target.closest(".bingo-cell");
  if (cell) toggleCell(Number(cell.dataset.index));
});

restoreBoard();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js"));
}
