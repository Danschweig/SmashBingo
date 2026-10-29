import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { validEveningDate, validateEvening, calculateEveningStats, recordEvening } from "../evening-store.js";

const evening = { date: "2026-10-29", winner: "Daniel", schissPlayer: "Tim", schissScore: 7, revision: 0 };
validateEvening(evening);
for (const date of ["2026-02-29", "2026-02-30", "2026-13-01", "2026-10-00", "29.10.2026", "2026-1-1", "1999-12-31", null]) {
  assert.equal(validEveningDate(date), false);
}
assert(validEveningDate("2028-02-29"));
for (const invalid of [null, { ...evening, winner: "Other" }, { ...evening, schissPlayer: "Other" },
  ...[0, 11, 1.5, "5", NaN].map((schissScore) => ({ ...evening, schissScore })),
  ...[-1, 1.5, Infinity, 1000000001].map((revision) => ({ ...evening, revision }))]) {
  assert.throws(() => validateEvening(invalid));
}
const stats = calculateEveningStats([evening, { ...evening, date: "2026-10-30", winner: "Fabian", schissScore: 10 },
  { ...evening, date: "2026-10-31", schissPlayer: "Daniel", schissScore: 1 }, { ...evening, schissScore: 99 }]);
assert.equal(stats.find((s) => s.player === "Daniel").wins, 2);
assert.equal(stats.find((s) => s.player === "Fabian").wins, 1);
assert.equal(stats.find((s) => s.player === "Fabian").schissAverage, null);
assert.equal(stats.find((s) => s.player === "Tim").schissCount, 2);
assert.equal(stats.find((s) => s.player === "Tim").schissAverage, 8.5);
assert.equal(stats.find((s) => s.player === "Tim").schissMax, 10);

const documents = new Map();
let writes = 0;
let queue = Promise.resolve();
const api = {
  doc: (_db, collection, id) => collection + "/" + id,
  serverTimestamp: () => "server-time",
  runTransaction(_db, action) {
    const result = queue.then(() => action({
      get: async (ref) => ({ exists: () => documents.has(ref), data: () => documents.get(ref) }),
      set(ref, data) { writes++; documents.set(ref, data); },
    }));
    queue = result.catch(() => {});
    return result;
  },
};
assert.deepEqual(await Promise.all([recordEvening(api, {}, evening), recordEvening(api, {}, evening)]), [1, 1]);
assert.equal(writes, 1, "Duplicate submissions write a single record");
await recordEvening(api, {}, evening);
assert.equal(writes, 1, "Retry after a lost response is idempotent");
await assert.rejects(recordEvening(api, {}, { ...evening, winner: "Tim" }), /inzwischen bearbeitet/);
const edit = { ...evening, revision: 1, schissScore: 9 };
const edits = await Promise.allSettled([recordEvening(api, {}, edit), recordEvening(api, {}, { ...edit, winner: "Tim" })]);
assert.equal(edits.filter((result) => result.status === "fulfilled").length, 1);
assert.equal(documents.size, 1, "Editing the same date cannot duplicate an evening");
assert.equal(documents.values().next().value.revision, 2);
await recordEvening(api, {}, { ...evening, date: "2026-10-30" });
assert.equal(documents.size, 2, "Different dates keep separate history");
assert([...documents.keys()].every((key) => key.startsWith("smashBingoEvenings/")), "No writes to pool, rounds, leaderboard or Schafkopf");
await assert.rejects(recordEvening({ ...api, runTransaction: async () => { throw new Error("unavailable"); } }, {}, evening), /unavailable/);

const source = (await fs.readFile(new URL("../evenings.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "").replaceAll("export ", "");
function editorHarness(draft, saveAction = async (data) => data.revision + 1) {
  const nodes = new Map();
  const storage = new Map(draft ? [["smash-bingo-evening-draft-v1", JSON.stringify(draft)]] : []);
  function element() {
    return { value: "", textContent: "", dataset: {}, children: [], listeners: {},
      setAttribute() {}, focus() {}, append(...nodes) { this.children.push(...nodes); },
      replaceChildren(...nodes) { this.children = nodes; },
      addEventListener(name, action) { this.listeners[name] = action; },
    };
  }
  const get = (id) => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const submitted = [];
  let subscription;
  const context = vm.createContext({ validEveningDate, validateEvening,
    document: { querySelector: get, createElement: element },
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    createEveningStore: () => ({
      subscribe(listener) { subscription = listener; listener({ evenings: [], stats: calculateEveningStats([]), status: "Loading", live: false }); },
      async save(data) { submitted.push(data); return saveAction(data); },
    }),
  });
  vm.runInContext(source, context);
  const live = (evenings = []) => subscription({ evenings, stats: calculateEveningStats(evenings), status: "Live", live: true });
  return { get, storage, submitted, live,
    input(id, value) { get("#" + id).value = value; get("#eveningForm").listeners.input(); },
    submit: () => get("#eveningForm").listeners.submit({ preventDefault() {} }),
  };
}
const editor = editorHarness();
assert(editor.get("#eveningSave").disabled, "Saving needs a confirmed live snapshot");
editor.live();
editor.input("eveningDate", evening.date);
editor.get("#eveningDate").listeners.change();
editor.input("eveningWinner", "Daniel");
editor.input("eveningSchissPlayer", "Tim");
editor.input("eveningSchissScore", "0");
await editor.submit();
assert.equal(editor.submitted.length, 0, "Invalid score never reaches the store");
editor.input("eveningSchissScore", "7");
const cached = JSON.parse(editor.storage.get("smash-bingo-evening-draft-v1"));
const restored = editorHarness(cached);
restored.live();
assert.equal(restored.get("#eveningWinner").value, "Daniel", "Reload preserves unsaved input");
await editor.submit();
assert.equal(editor.submitted.length, 1);
assert.equal(editor.submitted[0].schissScore, 7);
assert.match(editor.get("#eveningFeedback").textContent, /gespeichert/);
assert.equal(JSON.parse(editor.storage.get("smash-bingo-evening-draft-v1")).revision, 1);
assert.equal(JSON.parse(editor.storage.get("smash-bingo-evening-draft-v1")).dirty, false);
editor.live([{ ...evening, revision: 1 }]);
const confirmed = editorHarness(JSON.parse(editor.storage.get("smash-bingo-evening-draft-v1")));
confirmed.live([{ ...evening, revision: 2, winner: "Fabian" }]);
assert.equal(confirmed.get("#eveningWinner").value, "Fabian", "A confirmed, unchanged form follows live updates after reload");
editor.input("eveningWinner", "Daniel");
editor.live([{ ...evening, revision: 2, winner: "Fabian", schissScore: 9 }]);
assert.equal(editor.get("#eveningWinner").value, "Daniel", "Remote edits cannot silently overwrite a draft");
editor.get("#eveningReload").listeners.click();
assert.equal(editor.get("#eveningWinner").value, "Fabian");
assert.equal(editor.get("#eveningSchissScore").value, "9");
assert.equal(editor.get("#eveningHistory").children.length, 1);
const failed = editorHarness(cached, async () => { throw new Error("Keine Verbindung"); });
failed.live();
await failed.submit();
assert.equal(failed.get("#eveningWinner").value, "Daniel");
assert.equal(failed.get("#eveningControls").disabled, false);
assert.match(failed.get("#eveningFeedback").textContent, /Keine Verbindung/);
assert.equal(JSON.parse(failed.storage.get("smash-bingo-evening-draft-v1")).revision, 0);
let release;
const slow = editorHarness(cached, () => new Promise((resolve) => { release = resolve; }));
slow.live();
const pending = slow.submit();
await slow.submit();
assert.equal(slow.submitted.length, 1, "No duplicate UI submission");
assert(slow.get("#eveningControls").disabled);
release(1);
await pending;
assert.equal(slow.get("#eveningControls").disabled, false);
console.log("PASS: dates, names, 1–10 validation, statistics, one record per date, retries, concurrent-edit conflicts, isolated writes, local drafts, reload, remote edits, failed saves and double-click protection.");
