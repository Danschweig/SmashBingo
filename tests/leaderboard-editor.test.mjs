import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const source = (await fs.readFile(new URL("../leaderboard-editor.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "").replaceAll("export ", "");
const PLAYERS = ["Daniel", "Fabian", "Tim"];
function harness(save = async () => {}) {
  const nodes = new Map();
  const timers = new Map();
  let clock = 1000;
  let timerId = 0;
  function element() {
    return {
      hidden: false, disabled: false, open: false, value: "", textContent: "", handlers: new Map(),
      addEventListener(name, handler) {
        if (!this.handlers.has(name)) this.handlers.set(name, []);
        this.handlers.get(name).push(handler);
      },
      async emit(name) { for (const handler of this.handlers.get(name) || []) await handler({ preventDefault() {} }); },
      focus() {}, showModal() { this.open = true; },
      close() { this.open = false; for (const handler of this.handlers.get("close") || []) handler(); },
    };
  }
  const get = (id) => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const canceled = [element(), element()];
  const submitted = [];
  const window = element();
  window.clearTimeout = (id) => timers.delete(id);
  window.setTimeout = (callback, ms) => { const id = ++timerId; timers.set(id, { callback, ms }); return id; };
  const state = { editable: true, revision: 0, scores: PLAYERS.map((player) => ({ player, bingos: 10 })) };
  let notify;
  const store = {
    subscribe(callback) { notify = callback; callback(state); },
    async saveAdjustment(edit) { submitted.push(edit); await save(edit); },
  };
  const context = vm.createContext({
    PLAYERS, Date: { now: () => clock }, window,
    document: { querySelector: get, querySelectorAll: () => canceled }, store,
  });
  vm.runInContext(source + "\ncreateLeaderboardEditor(store);", context);
  return { get, submitted, canceled, window, timers, setClock(value) { clock = value; },
    notify(update) { Object.assign(state, update); notify(state); },
    async open() { await get("#leaderboardEditButton").emit("click"); },
    async unlock(password = "Schiss") {
      get("#leaderboardPassword").value = password;
      await get("#leaderboardPasswordForm").emit("submit");
    },
    async save() { await get("#leaderboardEditForm").emit("submit"); },
  };
}

const editor = harness();
await editor.open();
assert.equal(editor.get("#leaderboardEditDialog").open, true);
await editor.unlock("wrong");
assert.equal(editor.get("#leaderboardEditForm").hidden, true);
assert.equal(editor.get("#leaderboardPassword").value, "");
assert.equal(editor.get("#leaderboardPasswordError").textContent, "Falsches Passwort.");
await editor.save();
assert.equal(editor.submitted.length, 0, "Cannot save without the password");
await editor.open();
await editor.unlock();
assert.equal(editor.get("#leaderboardPassword").value, "");
assert.equal(editor.get("#leaderboardEditForm").hidden, false);
assert.equal(editor.get("#leaderboardScoreDaniel").value, "10");
editor.get("#leaderboardScoreDaniel").value = "7";
editor.get("#leaderboardScoreFabian").value = "14";
await editor.save();
assert.equal(editor.submitted.length, 1);
assert.equal(editor.submitted[0].base.Daniel, 10);
assert.equal(editor.submitted[0].values.Daniel, 7);
assert.equal(editor.submitted[0].values.Fabian, 14);
assert.equal(editor.get("#leaderboardEditDialog").open, false);
assert.equal(editor.timers.size, 0);
await editor.open();
assert.equal(editor.get("#leaderboardPasswordForm").hidden, false);
assert.equal(editor.get("#leaderboardEditForm").hidden, true);
await editor.save();
assert.equal(editor.submitted.length, 1, "Successful save consumes the unlock");

const failed = harness(async () => { throw new Error("Connection failed"); });
await failed.open(); await failed.unlock(); await failed.save();
assert(failed.get("#leaderboardEditStatus").textContent.includes("Connection failed"));
await failed.open(); await failed.save();
assert.equal(failed.submitted.length, 1, "Failed save also consumes the unlock");
await failed.open(); await failed.unlock();
await failed.canceled[0].emit("click");
await failed.open(); await failed.save();
assert.equal(failed.submitted.length, 1, "Cancel discards the unlock");

const invalid = harness();
await invalid.open(); await invalid.unlock();
for (const value of ["-1", "1.5", "", "1000000001", "abc"]) {
  invalid.get("#leaderboardScoreDaniel").value = value;
  await invalid.save();
  assert.equal(invalid.submitted.length, 0);
  assert(invalid.get("#leaderboardEditError").textContent.length > 0);
}
invalid.get("#leaderboardScoreDaniel").value = "0";
await invalid.save();
assert.equal(invalid.submitted[0].values.Daniel, 0);

const expired = harness();
await expired.open(); await expired.unlock();
assert.equal([...expired.timers.values()][0].ms, 300000);
expired.setClock(301001);
await expired.save();
assert.equal(expired.submitted.length, 0, "Expired session cannot save even if its timer was suspended");
await expired.open(); await expired.unlock();
[...expired.timers.values()][0].callback();
assert.equal(expired.get("#leaderboardEditDialog").open, false);
await expired.open(); await expired.unlock();
await expired.window.emit("pagehide");
await expired.open(); await expired.save();
assert.equal(expired.submitted.length, 0, "Page navigation discards the unlock");

let release;
const slow = harness(() => new Promise((resolve) => { release = resolve; }));
await slow.open(); await slow.unlock();
const pending = slow.save();
await Promise.resolve();
await slow.open(); await slow.save();
assert.equal(slow.submitted.length, 1, "Repeated clicks cannot send another correction");
release(); await pending;

const offline = harness();
offline.notify({ editable: false });
await offline.open();
assert.equal(offline.get("#leaderboardEditDialog").open, false);
assert.equal(offline.get("#leaderboardEditButton").disabled, true);
console.log("PASS: password gate, single-use editing, failed saves, cancel, input validation, zero scores, timeout, navigation, duplicate clicks, and offline editing.");
