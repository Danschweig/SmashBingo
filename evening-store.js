import { firebaseConfig } from "./firebase-config.js";
import { PLAYERS } from "./leaderboard-store.js";

const CACHE_KEY = "smash-bingo-evenings-v1";
const FIREBASE_VERSION = "12.16.0";

export function validEveningDate(value) {
  if (typeof value !== "string" || !/^[2-9][0-9]{3}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateEvening(value) {
  if (!value || !validEveningDate(value.date) || !PLAYERS.includes(value.winner)
    || !PLAYERS.includes(value.schissPlayer) || !Number.isInteger(value.schissScore)
    || value.schissScore < 1 || value.schissScore > 10
    || !Number.isSafeInteger(value.revision) || value.revision < 0 || value.revision > 1000000000) {
    throw new Error("Bitte Datum, beide Namen und einen ganzen Schiss-Wert von 1 bis 10 eintragen.");
  }
}

export function calculateEveningStats(evenings) {
  const stats = PLAYERS.map((player) => ({ player, wins: 0, schissCount: 0, schissTotal: 0, schissMax: 0 }));
  for (const evening of evenings) {
    try { validateEvening(evening); } catch { continue; }
    stats.find((stat) => stat.player === evening.winner).wins += 1;
    const stat = stats.find((item) => item.player === evening.schissPlayer);
    stat.schissCount += 1;
    stat.schissTotal += evening.schissScore;
    stat.schissMax = Math.max(stat.schissMax, evening.schissScore);
  }
  return stats.map((stat) => ({ ...stat, schissAverage: stat.schissCount ? stat.schissTotal / stat.schissCount : null }));
}

// One shared record per calendar date. Revisions protect against stale edits on other phones.
export async function recordEvening(firestore, db, evening) {
  validateEvening(evening);
  const reference = firestore.doc(db, "smashBingoEvenings", evening.date);
  return firestore.runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    const current = snapshot.exists() ? snapshot.data() : null;
    if (current && current.revision === evening.revision + 1
      && ["date", "winner", "schissPlayer", "schissScore"].every((key) => current[key] === evening[key])) {
      return current.revision; // A lost response or double submit must not create a second result.
    }
    if ((current?.revision ?? 0) !== evening.revision) {
      throw new Error("Dieser Spieleabend wurde inzwischen bearbeitet. Lade den gespeicherten Stand und prüfe deine Eingaben erneut.");
    }
    if (evening.revision === 1000000000) throw new Error("Dieser Eintrag kann nicht weiter bearbeitet werden.");
    const revision = evening.revision + 1;
    transaction.set(reference, {
      date: evening.date, winner: evening.winner, schissPlayer: evening.schissPlayer,
      schissScore: evening.schissScore, revision, updatedAt: firestore.serverTimestamp(),
    });
    return revision;
  });
}

function connectionMessage(error) {
  if (error?.code === "permission-denied") {
    return "Spieleabende noch nicht freigeschaltet. Bitte die aktuelle firestore.rules in Firebase veröffentlichen.";
  }
  if (error?.code === "unavailable" || navigator.onLine === false) {
    return "Keine Verbindung. Deine Eingaben bleiben erhalten; bitte später erneut speichern.";
  }
  return "Spieleabende konnten nicht geladen oder gespeichert werden. Bitte erneut versuchen.";
}

export function createEveningStore() {
  let evenings = [];
  let live = false;
  let status = "Spieleabende werden geladen …";
  let firestore;
  let db;
  const listeners = new Set();
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (Array.isArray(cache)) {
      evenings = cache.filter((value) => { try { validateEvening(value); return value.revision > 0; } catch { return false; } });
    }
  } catch { /* The shared records also work without a local cache. */ }
  function snapshot() {
    return { evenings: evenings.map((value) => ({ ...value })), stats: calculateEveningStats(evenings), live, status };
  }
  function notify() { for (const listener of listeners) listener(snapshot()); }
  async function connect() {
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId
      || Object.values(firebaseConfig).some((value) => String(value).startsWith("HIER_"))) {
      status = "Für gemeinsame Spieleabende muss Firebase eingerichtet sein.";
      notify();
      return;
    }
    try {
      const [firebase, api] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/" + FIREBASE_VERSION + "/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/" + FIREBASE_VERSION + "/firebase-firestore.js"),
      ]);
      firestore = api;
      const app = firebase.getApps().length ? firebase.getApp() : firebase.initializeApp(firebaseConfig);
      db = firestore.getFirestore(app);
      firestore.onSnapshot(firestore.collection(db, "smashBingoEvenings"), { includeMetadataChanges: true }, (result) => {
        if (result.metadata.hasPendingWrites) return;
        evenings = result.docs.map((doc) => ({ ...doc.data(), date: doc.id }))
          .filter((value) => { try { validateEvening(value); return value.revision > 0; } catch { return false; } })
          .sort((a, b) => b.date.localeCompare(a.date));
        live = !result.metadata.fromCache;
        status = live ? "Live · Ein gemeinsamer Eintrag pro Datum" : "Gespeicherter Stand · Verbindung wird geprüft";
        if (live) {
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(evenings)); } catch { /* Optional cache. */ }
        }
        notify();
      }, (error) => { live = false; status = connectionMessage(error); notify(); });
    } catch (error) { live = false; status = connectionMessage(error); notify(); }
  }
  const ready = connect();
  return {
    subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); },
    async save(evening) {
      await ready;
      if (!firestore || !db || !live) throw new Error(status);
      if (navigator.onLine === false) throw new Error(connectionMessage({ code: "unavailable" }));
      try { return await recordEvening(firestore, db, evening); }
      catch (error) { if (error.code) throw new Error(connectionMessage(error)); throw error; }
    },
  };
}
