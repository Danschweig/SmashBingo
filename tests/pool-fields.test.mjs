import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import * as fieldModel from "../field-model.js";

const source = (await fs.readFile(new URL("../pool-store.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "").replaceAll("export ", "")
  .replace(/import\((`[^`]+`)\)/g, "fakeImport($1)");
async function harness(remoteData) {
  const storage = new Map([["smash-bingo-fields-v1", JSON.stringify(["Legacy", { text: "Repeated", target: 5 }])]]);
  let remote = remoteData ? structuredClone(remoteData) : null;
  let listener;
  let sequence = Promise.resolve();
  const snap = () => ({ exists: () => Boolean(remote), data: () => structuredClone(remote), metadata: { fromCache: false } });
  const api = {
    getFirestore: () => ({}), doc: () => "sharedPool", getDoc: async () => snap(), serverTimestamp: () => "now",
    onSnapshot(_ref, callback) { listener = callback; callback(snap()); },
    async setDoc(_ref, data) { remote = structuredClone(data); },
    runTransaction(_db, action) {
      const pending = sequence.then(async () => {
        let update;
        await action({ get: async () => snap(), update(_ref, values) { update = values; } });
        remote = { ...remote, ...structuredClone(update) };
        listener(snap());
      });
      sequence = pending.catch(() => {});
      return pending;
    },
  };
  const context = vm.createContext({
    ...fieldModel, console, firebaseConfig: remoteData ? { apiKey: "test", projectId: "test", appId: "test" } : {},
    fakeImport: async (url) => url.endsWith("firebase-app.js") ? { initializeApp: () => ({}) } : api,
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    window: { addEventListener() {}, clearTimeout() {}, setTimeout() { return 1; } },
  });
  vm.runInContext(source + "\nvar store = createPoolStore();", context);
  const run = (code) => vm.runInContext(code, context);
  await run("store.ready");
  let latest;
  context.collect = (state) => { latest = state; };
  run("store.subscribe(collect)");
  return { run, storage, latest: () => latest, remote: () => remote };
}

for (const cloud of [false, true]) {
  const pool = await harness(cloud ? { fields: ["Legacy", { text: "Repeated", target: 5 }], bonusFields: ["Extra"], updatedAt: "before" } : undefined);
  assert.equal(pool.latest().fields.length, 2, "Stored string and repeated fields both survive loading");
  await pool.run('store.addField("Repeated", 3)');
  await pool.run('store.addField("Repeated", 1)');
  assert.equal(pool.latest().fields.length, 4, "Same text with different targets creates unique variants");
  await assert.rejects(pool.run('store.addField("repeated", 5)'), /bereits im Pool/);
  for (const target of [0, 1.5, 1000]) await assert.rejects(pool.run('store.addField("Invalid", ' + target + ')'));
  assert.equal(pool.latest().fields.length, 4);
  await pool.run('store.updateField({target: 3, text: "Repeated"}, "Repeated changed", 7)');
  assert(pool.latest().fields.some((field) => field.target === 7 && field.text === "Repeated changed"));
  await assert.rejects(pool.run('store.updateField("Repeated", "Repeated", 5)'), /bereits im Pool/);
  await pool.run('store.removeField({target: 7, text: "Repeated changed"})');
  assert.equal(pool.latest().fields.length, 3);
  assert.equal(pool.latest().deletedFields[0].field.target, 7);
  await pool.run('store.restoreField({text: "Repeated changed", target: 7})');
  assert.equal(pool.latest().fields.length, 4);
  assert.equal(pool.latest().deletedFields.length, 0);
  await pool.run('store.updateField({text: "Repeated changed", target: 7}, "Simple", 1)');
  assert(pool.latest().fields.includes("Simple"), "Changing target to one keeps the compact field format");
  if (cloud) {
    await Promise.all([pool.run('store.addField("Concurrent A", 2)'), pool.run('store.addField("Concurrent B", 4)')]);
    assert(pool.remote().fields.some((field) => field.text === "Concurrent A"));
    assert(pool.remote().fields.some((field) => field.text === "Concurrent B"));
    assert.deepEqual(pool.remote().bonusFields, ["Extra"], "Regular field edits preserve the bonus pool");
  }
  const cached = JSON.parse(pool.storage.get("smash-bingo-fields-v1"));
  assert(cached.some((field) => field.target === 5));
  assert(cached.includes("Legacy"));
}
console.log("PASS: local and simulated Firebase pool loading, target variants, validation, editing, duplicate prevention, deletion/restoration, single-target conversion, concurrent additions, unchanged bonus fields.");
