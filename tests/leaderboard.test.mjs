import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { randomUUID } from "node:crypto";

const root = new URL("../", import.meta.url);
const storeSource = await fs.readFile(new URL("leaderboard-store.js", root), "utf8");
const storeContext = vm.createContext({ console });
vm.runInContext(storeSource.replace(/^import .*;\r?\n/, "").replaceAll("export ", ""), storeContext);
const evaluate = (code) => vm.runInContext(code, storeContext);
const round = { id: randomUUID(), player: "Daniel", boardSize: 4, bingos: 3, bonusBingo: true };
storeContext.round = round;
evaluate("validateRound(round)");
for (const invalid of [
  { ...round, player: "Other" }, { ...round, boardSize: 3 },
  { ...round, bingos: -1 }, { ...round, bingos: 11 }, { ...round, bingos: 1.5 },
  { ...round, id: "short" }, { ...round, bonusBingo: 1 },
]) {
  storeContext.invalid = invalid;
  assert.throws(() => evaluate("validateRound(invalid)"));
}
storeContext.rounds = [round, { ...round, id: randomUUID(), player: "Fabian", bingos: 4, bonusBingo: false },
  { ...round, id: randomUUID(), player: "Tim", bingos: 0, bonusBingo: false },
  { ...round, id: randomUUID(), player: "Other" }];
const scores = evaluate("calculateLeaderboard(rounds)");
assert.equal(scores[0].player, "Daniel");
assert.equal(scores[0].bingos, 4);
assert.equal(scores[1].rank, 1);
assert.equal(scores[2].rank, 3);
assert.equal(scores[2].rounds, 1);
storeContext.rounds = [{ ...round, boardSize: 5, bingos: 12 }];
assert.equal(evaluate("calculateLeaderboard(rounds)")[0].bingos, 13);

const documents = new Map();
let writes = 0;
let transactionQueue = Promise.resolve();
storeContext.db = {};
storeContext.api = {
  doc: (_db, collection, id) => collection + "/" + id,
  serverTimestamp: () => "server-time",
  runTransaction(_db, action) {
    const result = transactionQueue.then(() => action({
      async get(ref) { return { exists: () => documents.has(ref), data: () => documents.get(ref) }; },
      set(ref, data) { writes++; documents.set(ref, data); },
    }));
    transactionQueue = result.catch(() => {});
    return result;
  },
};
await Promise.all([evaluate("recordRound(api, db, round)"), evaluate("recordRound(api, db, round)")]);
await evaluate("recordRound(api, db, round)");
assert.equal(writes, 1, "Retry and concurrent submissions must not count twice");
storeContext.conflict = { ...round, player: "Tim" };
await assert.rejects(evaluate("recordRound(api, db, conflict)"));
assert.equal(writes, 1);
storeContext.round = { ...round, id: randomUUID(), player: "Tim" };
await evaluate("recordRound(api, db, round)");
assert.equal(writes, 2, "Different rounds must not overwrite one another");

const boardSource = (await fs.readFile(new URL("board.js", root), "utf8")).replace(/^import .*;\r?\n/gm, "");
function element() {
  return {
    dataset: {}, style: {}, children: [], textContent: "", disabled: false, hidden: false,
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, addEventListener() {}, focus() {},
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
    querySelectorAll(selector) {
      const all = this.children.flatMap((child) => [child, ...child.querySelectorAll("*")]);
      if (selector === "button") return all.filter((child) => child.tag === "button");
      if (selector === ".bingo-cell") return all.filter((child) => child.className === "bingo-cell");
      return all;
    },
    querySelector(selector) {
      const index = /data-index="(\d+)"/.exec(selector)?.[1];
      return this.querySelectorAll("*").find((child) => index !== undefined
        ? child.className === "bingo-cell" && String(child.dataset.index) === index
        : "." + child.className === selector) || null;
    },
    currentTime: 0, pause() {}, play() { return Promise.resolve(); },
  };
}
function boardHarness(savedBoard, finishAction = async () => {}) {
  const storage = new Map(savedBoard ? [["smash-bingo-board-v1", JSON.stringify(savedBoard)]] : []);
  const elements = new Map();
  const players = ["Daniel", "Fabian", "Tim"].map((player) => Object.assign(element(), { dataset: { player } }));
  const sizes = [4, 5].map((size) => Object.assign(element(), { dataset: { size } }));
  const submitted = [];
  const context = vm.createContext({
    console, crypto: { randomUUID }, navigator: {}, location: { protocol: "https:" },
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    document: {
      querySelector(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      querySelectorAll(selector) { return selector === ".player-option" ? players : sizes; },
      createElement(tag) { return Object.assign(element(), { tag }); },
    },
    window: { confirm: () => true, addEventListener() {}, clearTimeout() {}, setTimeout() { return 1; } },
    PLAYERS: ["Daniel", "Fabian", "Tim"],
    createPoolStore: () => ({ subscribe(callback) { callback({ fields: Array.from({ length: 30 }, (_, i) => "Field " + i), bonusFields: ["Bonus"] }); } }),
    createLeaderboardStore: () => ({ subscribe(callback) { callback({ scores: [], status: "Test" }); }, async finishRound(result) { submitted.push(result); await finishAction(result); } }),
  });
  vm.runInContext(boardSource, context);
  return { storage, elements, players, submitted, run: (code) => vm.runInContext(code, context) };
}
const board = boardHarness();
board.run("generateBoard()");
assert.equal(board.run("currentBoard.length"), 0, "Starting requires player selection");
board.run('selectPlayer("Daniel"); generateBoard();');
const originalId = board.run("roundId");
assert.equal(board.run("roundPlayer"), "Daniel");
board.run('selectPlayer("Tim")');
assert.equal(board.run("roundPlayer"), "Tim", "Player can correct their selection during a round");
assert(board.players.every((button) => !button.disabled));
board.run("for (let i = 0; i < 8; i++) toggleCell(i); toggleBonus();");
assert.equal(board.run("winningLineCount"), 2);
board.run('selectPlayer("Fabian")');
assert.equal(board.run("roundPlayer"), "Fabian");
assert.equal(board.run("roundId"), originalId, "Changing player must keep the same round");
assert.equal(board.run("markedCells.size"), 8);
assert.equal(board.run("bonusMarked"), true);
assert.equal(board.run("winningLineCount"), 2);
const changedPlayerSave = JSON.parse(board.storage.get("smash-bingo-board-v1"));
assert.equal(changedPlayerSave.roundPlayer, "Fabian");
const changedPlayerReload = boardHarness(changedPlayerSave);
assert.equal(changedPlayerReload.run("roundPlayer"), "Fabian");
assert.equal(changedPlayerReload.run("markedCells.size"), 8);
assert(changedPlayerReload.players.every((button) => !button.disabled));
await Promise.all([board.run("finishRound()"), board.run("finishRound()")]);
assert.equal(board.submitted.length, 1);
assert.equal(board.submitted[0].player, "Fabian", "Points belong to the final selected player");
assert.equal(board.submitted[0].bingos, 2);
assert.equal(board.submitted[0].bonusBingo, true);
assert.equal(board.run("roundState"), "completed");
board.run("toggleCell(0); toggleBonus(); rerollCell(0)");
assert.equal(board.run("markedCells.size"), 8);
assert.equal(board.run("bonusMarked"), true);
board.run('selectPlayer("Daniel")');
assert.equal(board.run("roundPlayer"), "Fabian", "Completed result retains its original player");
await board.run("finishRound()");
assert.equal(board.submitted.length, 1);
const restored = boardHarness(JSON.parse(board.storage.get("smash-bingo-board-v1")));
await restored.run("finishRound()");
assert.equal(restored.submitted.length, 0, "Reloaded completed round stays locked");
assert.equal(restored.run("roundId"), originalId);
board.run('selectPlayer("Tim"); generateBoard()');
assert.equal(board.run("roundPlayer"), "Tim");
assert.notEqual(board.run("roundId"), originalId);

const failed = boardHarness(undefined, async () => { throw new Error("Network unavailable"); });
failed.run('selectPlayer("Fabian"); generateBoard(); toggleCell(0);');
await failed.run("finishRound()");
assert.equal(failed.run("roundState"), "pending");
const pending = JSON.parse(failed.storage.get("smash-bingo-board-v1"));
failed.run('toggleCell(1); generateBoard(); selectPlayer("Daniel")');
await failed.run("setBoardSize(5)");
assert.equal(failed.run("markedCells.size"), 1);
assert.equal(failed.run("roundId"), pending.roundId);
assert.equal(failed.run("roundPlayer"), "Fabian");
assert(failed.players.every((button) => button.disabled), "Unconfirmed writes must keep the original player");
const retry = boardHarness(pending);
await retry.run("finishRound()");
assert.equal(retry.submitted[0].id, pending.roundId);
assert.equal(retry.run("roundState"), "completed");
const legacy = boardHarness({ size: 4, fields: Array.from({ length: 16 }, (_, i) => "Field " + i), marked: [0, 1, 2, 3] });
legacy.run("toggleCell(4)");
assert.equal(legacy.run("markedCells.size"), 4);
legacy.run('selectPlayer("Daniel"); toggleCell(4)');
assert.equal(legacy.run("markedCells.size"), 5);
const canceled = boardHarness();
canceled.run('selectPlayer("Daniel"); generateBoard(); window.confirm = () => false;');
await canceled.run("finishRound()");
assert.equal(canceled.run("roundState"), "active");
assert.equal(canceled.submitted.length, 0);
assert.equal(canceled.run("finishingRound"), false);
canceled.run('selectPlayer("Tim")');
assert.equal(canceled.run("roundPlayer"), "Tim", "Canceling submission permits player corrections again");
canceled.run("toggleCell(0)");
assert.equal(canceled.run("markedCells.size"), 1);
const full = boardHarness();
full.run('selectPlayer("Tim"); boardSize = 5; generateBoard(); for (let i = 0; i < 25; i++) toggleCell(i); toggleBonus();');
await full.run("finishRound()");
assert.equal(full.submitted[0].bingos, 12);
assert.equal(full.submitted[0].bonusBingo, true);
let releaseSave;
const slowSave = boardHarness(undefined, () => new Promise((resolve) => { releaseSave = resolve; }));
slowSave.run('selectPlayer("Daniel"); generateBoard(); selectPlayer("Tim")');
const saving = slowSave.run("finishRound()");
await Promise.resolve();
assert.equal(slowSave.submitted.length, 1);
slowSave.run('selectPlayer("Fabian")');
assert.equal(slowSave.run("roundPlayer"), "Tim", "Player is fixed once submission starts");
assert(slowSave.players.every((button) => button.disabled));
releaseSave();
await saving;
assert.equal(slowSave.submitted[0].player, "Tim");
console.log("PASS: validation, bonus scoring, ties, immutable records, concurrent retries, player corrections before submission, round locking, reload, failed-save recovery, and legacy boards.");

// The fixture is the complete ruleset supplied by the user for the shared database.
// Only the separate leaderboard block may be added to that baseline.
const rules = (await fs.readFile(new URL("firestore.rules", root), "utf8")).replaceAll("\r\n", "\n");
const baselineRules = (await fs.readFile(new URL("tests/fixtures/firestore-before-leaderboard.rules", root), "utf8")).replaceAll("\r\n", "\n");
const leaderboardStart = rules.indexOf("    // Unveränderliche Rundenergebnisse");
const schafkopfStart = rules.indexOf("    // Gemeinsame Schafkopf-Räume.");
assert(leaderboardStart > 0 && schafkopfStart > leaderboardStart);
assert.equal(rules.slice(0, leaderboardStart) + rules.slice(schafkopfStart), baselineRules,
  "Pool, Schafkopf, and default-deny rules must exactly match the user's original rules");
assert.equal((rules.match(/match \/schafkopfRooms\//g) || []).length, 1);
assert.equal((rules.match(/match \/smashBingoRounds\//g) || []).length, 1);
const leaderboardRules = rules.slice(leaderboardStart, schafkopfStart);
assert.equal((leaderboardRules.match(/\bmatch\b/g) || []).length, 1, "Leaderboard rules cannot contain other collection matches");
assert(leaderboardRules.includes("roundId.matches('^[a-zA-Z0-9_-]{20,80}$')"));
assert(leaderboardRules.includes("allow update, delete: if false;"));
// Check delimiters and terminated string literals; this is not a Firebase emulator test.
const strippedRules = rules.replace(/\/\/[^\n]*/g, "").replace(/'(?:\\.|[^'\\\n])*'/g, "");
assert(!strippedRules.includes("'"), "Rule strings must be terminated on the same line");
const delimiters = [];
for (const character of strippedRules) {
  if ("({[".includes(character)) delimiters.push(character);
  if (")}]".includes(character)) {
    assert.equal(delimiters.pop(), { ")": "(", "}": "{", "]": "[" }[character]);
  }
}
assert.equal(delimiters.length, 0);
console.log("PASS: supplied Pool and Schafkopf rules preserved exactly, one isolated leaderboard block, balanced rule structure.");
