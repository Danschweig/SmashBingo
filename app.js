const STORAGE_KEY = "smash-bingo-fields-v1";
const BOARD_KEY = "smash-bingo-board-v1";

const starterFields = [
  "Pokémon-Eskalation",
  "Jemand fällt erbärmlich runter",
  "Final Smash geht daneben",
  "Aus Versehen selbst zerstört",
  "Item entscheidet das Match",
  "Jemand überlebt mit 200 %",
  "Schneller Tod nach Spawn",
  "Sieg mit 2 Leben",
  "Stage Hazard sorgt für Chaos",
  "Zwei fliegen gleichzeitig raus",
  "Close Call am Ende",
  "Weirder Call",
  "Lachflash",
  "Comeback",
  "Spike",
  "Sieger hatte einfach nur Glück",
  "Match endet im Chaos",
  "Jemand killt sich absichtlich selbst",
  "2D+ Tier oder niedriger",
  "Runde dauert ewig",
  "2A+ Tier oder höher",
  "Cheese",
  "Schlechtester Charakter gewinnt",
  "Fabi zieht den Drecks Löwen",
  "Ente",
  "9er Hammer",
  "Perfect Shield Dodge",
  "Beschwerde über Link von Fabi",
  "Trauriger Tod", 
  "Pokemon/Helfer Runde",
  "Gleiches Farbschema",
  "Tod durch Stage",
  "Maus Tretmine killt jemanden",
  "Fih",
  "Panda",
  "Drecks Drache",
  "Daniel zieht Held oder Steve",
  "Olimar statt Alph",
  "Fake Smash Ball kill",
  "Pokeball gefangen",
  "Franklin Badge Clutch",
];

const elements = {
  form: document.querySelector("#fieldForm"),
  input: document.querySelector("#fieldInput"),
  formError: document.querySelector("#formError"),
  list: document.querySelector("#fieldList"),
  listEmpty: document.querySelector("#listEmpty"),
  headerCount: document.querySelector("#headerCount"),
  poolBadge: document.querySelector("#poolBadge"),
  resetButton: document.querySelector("#resetButton"),
  sizeButtons: [...document.querySelectorAll(".size-option")],
  generateButton: document.querySelector("#generateButton"),
  board: document.querySelector("#bingoBoard"),
  boardEmpty: document.querySelector("#boardEmpty"),
  boardStatus: document.querySelector("#boardStatus"),
  toast: document.querySelector("#toast"),
};

let fields = loadFields();
let boardSize = 4;
let currentBoard = [];
let markedCells = new Set();
let toastTimer;

function loadFields() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved.filter((item) => typeof item === "string") : [...starterFields];
  } catch {
    return [...starterFields];
  }
}

function saveFields() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fields));
}

function saveBoard() {
  localStorage.setItem(
    BOARD_KEY,
    JSON.stringify({ size: boardSize, fields: currentBoard, marked: [...markedCells] }),
  );
}

function restoreBoard() {
  try {
    const saved = JSON.parse(localStorage.getItem(BOARD_KEY));
    const validSizes = [4, 5];
    if (
      saved &&
      validSizes.includes(saved.size) &&
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

function renderFields() {
  elements.list.replaceChildren();
  elements.listEmpty.hidden = fields.length !== 0;
  elements.headerCount.textContent = fields.length;
  elements.poolBadge.textContent = fields.length;

  fields.forEach((field, index) => {
    const item = document.createElement("li");
    item.className = "field-item";

    const text = document.createElement("span");
    text.textContent = field;

    const remove = document.createElement("button");
    remove.className = "delete-button";
    remove.type = "button";
    remove.dataset.index = index;
    remove.setAttribute("aria-label", `„${field}“ löschen`);
    remove.title = "Feld löschen";
    remove.innerHTML = "&#10005;";

    item.append(text, remove);
    elements.list.append(item);
  });
}

function addField(value) {
  const field = value.trim().replace(/\s+/g, " ");
  elements.formError.textContent = "";

  if (!field) {
    elements.formError.textContent = "Bitte gib zuerst einen Text ein.";
    return;
  }

  const exists = fields.some((item) => item.localeCompare(field, "de", { sensitivity: "base" }) === 0);
  if (exists) {
    elements.formError.textContent = "Dieses Feld ist bereits im Pool.";
    return;
  }

  fields.unshift(field);
  saveFields();
  renderFields();
  elements.form.reset();
  elements.input.focus();
  showToast("Feld zum Pool hinzugefügt");
}

function removeField(index) {
  const [removed] = fields.splice(index, 1);
  saveFields();
  renderFields();
  showToast(`„${removed}“ entfernt`);
}

function resetExamples() {
  const newExamples = starterFields.filter(
    (example) => !fields.some((item) => item.localeCompare(example, "de", { sensitivity: "base" }) === 0),
  );

  if (!newExamples.length) {
    showToast("Alle Beispiele sind bereits im Pool");
    return;
  }

  fields = [...fields, ...newExamples];
  saveFields();
  renderFields();
  showToast(`${newExamples.length} Beispiele hinzugefügt`);
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
    elements.boardStatus.textContent = `Noch ${missing} ${missing === 1 ? "Feld" : "Felder"} für ein ${boardSize} × ${boardSize} Board nötig.`;
    elements.input.focus();
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
  elements.board.style.gridTemplateColumns = `repeat(${boardSize}, 1fr)`;

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
  if (markedCells.has(index)) {
    markedCells.delete(index);
  } else {
    markedCells.add(index);
  }

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

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  addField(elements.input.value);
});

elements.list.addEventListener("click", (event) => {
  const button = event.target.closest(".delete-button");
  if (button) removeField(Number(button.dataset.index));
});

elements.sizeButtons.forEach((button) => {
  button.addEventListener("click", () => setBoardSize(Number(button.dataset.size)));
});

elements.generateButton.addEventListener("click", generateBoard);
elements.resetButton.addEventListener("click", resetExamples);
elements.board.addEventListener("click", (event) => {
  const cell = event.target.closest(".bingo-cell");
  if (cell) toggleCell(Number(cell.dataset.index));
});

renderFields();
restoreBoard();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js"));
}
