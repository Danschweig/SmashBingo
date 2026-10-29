import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { boardHarness } from "./helpers/board-harness.mjs";

const board = boardHarness();
board.run('selectPlayer("Daniel"); generateBoard();');
const lines = Array.from(board.run("getLines()"), (line) => Array.from(line));
const masks = new Map();
for (let mask = 0; mask < 65536 && masks.size < 10; mask++) {
  const count = lines.filter((line) => line.every((index) => mask & (1 << index))).length;
  if (!masks.has(count)) masks.set(count, mask);
}
function setCount(count, previous = count - 1) {
  const mask = masks.get(count);
  assert.notEqual(mask, undefined, "Test board can reach " + count + " lines");
  const marked = Array.from({ length: 16 }, (_, i) => i).filter((i) => mask & (1 << i));
  board.run(`winningLineCount = ${previous}; boardWasFull = false; markedCells = new Set(${JSON.stringify(marked)}); updateWinningLines(true);`);
}
for (const [count, id, limit] of [
  [1, "single", 5], [2, "double", 4], [3, "triple"], [4, "four", 8],
  [5, "five"], [6, "six"], [7, "seven"], [10, "fullBoard"],
]) {
  setCount(count);
  const selector = `#${id === "fullBoard" ? id + "Sound" : id + "BingoSound"}`;
  assert.equal(board.audioPlays.at(-1), selector);
  const audio = board.elements.get(selector);
  assert.equal(audio.currentTime, 0);
  const before = board.audioPlays.length;
  board.run("updateWinningLines(true)");
  assert.equal(board.audioPlays.length, before, "No replay when the count stays unchanged");
  if (limit) {
    audio.onplaying();
    audio.currentTime = limit - 0.01;
    audio.ontimeupdate();
    assert.equal(board.run("activeSound !== null"), true);
    audio.currentTime = limit;
    audio.ontimeupdate();
    assert.equal(board.run("activeSound"), null, "Clip stops at the requested limit");
    assert.equal(audio.currentTime, 0);
  }
}
setCount(7, 0);
assert.equal(board.audioPlays.at(-1), "#sevenBingoSound", "Highest crossed milestone wins");
const oldEnded = board.elements.get("#sevenBingoSound").onended;
setCount(4, 0);
oldEnded();
assert.equal(board.run('activeSound === elements.sounds.four'), true, "Old callbacks cannot stop a newer sound");
board.run("stopBingoSound()");
assert.equal(board.run("activeSound"), null);
const beforeRestore = board.audioPlays.length;
board.run("updateWinningLines(false)");
assert.equal(board.audioPlays.length, beforeRestore, "Restoring a board stays silent");
board.run("winningLineCount = 0; updateWinningLines(true)");
assert.equal(board.audioPlays.at(-1), "#fourBingoSound", "A milestone can play again after falling below it");

const root = new URL("../", import.meta.url);
const html = await fs.readFile(new URL("index.html", root), "utf8");
const worker = await fs.readFile(new URL("service-worker.js", root), "utf8");
const context = vm.createContext({ self: { addEventListener() {} } });
vm.runInContext(worker + "\nglobalThis.appFiles = APP_FILES;", context);
for (const file of context.appFiles) {
  await fs.access(new URL(file, root));
}
for (const [, id, src] of html.matchAll(/<audio id="([^"]+)"[^>]*src="([^"]+)"/g)) {
  await fs.access(new URL(src, root));
  assert(context.appFiles.includes(src), id + " must be available offline");
  assert(!src.includes("#"), "Hashtags in filenames must be encoded, not treated as URL fragments");
}
assert.equal((html.match(/<audio /g) || []).length, 8);
console.log("PASS: eight audio milestones, clip limits, highest-threshold/full-board priority, replay, silent restore, stale callbacks, valid encoded filenames and offline assets.");
