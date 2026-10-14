import { firebaseConfig } from "./firebase-config.js";

export const PLAYERS = ["Daniel", "Fabian", "Tim"];
const FIREBASE_VERSION = "12.16.0";
const CACHE_KEY = "smash-bingo-leaderboard-v1";

export function validateRound(round) {
  if (!round || typeof round.id !== "string" || !/^[a-zA-Z0-9_-]{20,80}$/.test(round.id)
    || !PLAYERS.includes(round.player) || ![4, 5].includes(round.boardSize)
    || !Number.isInteger(round.bingos) || round.bingos < 0
    || round.bingos > 2 * round.boardSize + 2 || typeof round.bonusBingo !== "boolean") {
    throw new Error("Diese Runde enthält ungültige Daten.");
  }
}

export function calculateLeaderboard(rounds, adjustments = {}) {
  const scores = PLAYERS.map((player) => ({ player, bingos: 0, rounds: 0 }));
  for (const round of rounds) {
    try { validateRound(round); } catch { continue; }
    const score = scores.find((item) => item.player === round.player);
    score.bingos += round.bingos + Number(round.bonusBingo);
    score.rounds += 1;
  }
  for (const score of scores) {
    const adjustment = adjustments[score.player];
    if (Number.isSafeInteger(adjustment)) score.bingos = Math.max(0, score.bingos + adjustment);
  }
  scores.sort((a, b) => b.bingos - a.bingos || PLAYERS.indexOf(a.player) - PLAYERS.indexOf(b.player));
  return scores.map((score) => ({ ...score, rank: 1 + scores.filter((other) => other.bingos > score.bingos).length }));
}

// Each board has one immutable result. A retry reads the existing result instead of adding points again.
export async function recordRound(firestore, db, round) {
  validateRound(round);
  const reference = firestore.doc(db, "smashBingoRounds", round.id);
  await firestore.runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (snapshot.exists()) {
      const saved = snapshot.data();
      if (["player", "boardSize", "bingos", "bonusBingo"].some((key) => saved[key] !== round[key])) {
        throw new Error("Diese Runde wurde bereits mit einem anderen Ergebnis gespeichert. Bitte lade die Seite neu.");
      }
      return;
    }
    transaction.set(reference, {
      player: round.player,
      boardSize: round.boardSize,
      bingos: round.bingos,
      bonusBingo: round.bonusBingo,
      completedAt: firestore.serverTimestamp(),
    });
  });
}

export async function recordLeaderboardAdjustment(firestore, db, edit) {
  if (!edit || !Number.isSafeInteger(edit.revision) || edit.revision < 0
    || ![edit.base, edit.values].every((values) => values && Object.keys(values).length === PLAYERS.length
      && PLAYERS.every((player) => Number.isSafeInteger(values[player])
        && values[player] >= 0 && values[player] <= 1000000000))) {
    throw new Error("Bitte gib für jeden Spieler eine ganze Zahl zwischen 0 und 1.000.000.000 ein.");
  }
  const reference = firestore.doc(db, "smashBingo", "leaderboardAdjustments");
  await firestore.runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    const current = snapshot.exists() ? snapshot.data() : { revision: 0, Daniel: 0, Fabian: 0, Tim: 0 };
    if (current.revision !== edit.revision) {
      throw new Error("Die Rangliste wurde inzwischen bearbeitet. Bitte erneut Edit öffnen und den aktuellen Stand prüfen.");
    }
    const next = { revision: current.revision + 1, updatedAt: firestore.serverTimestamp() };
    for (const player of PLAYERS) {
      // Apply only the intended correction; rounds finished meanwhile still count.
      next[player] = current[player] + edit.values[player] - edit.base[player];
      if (!Number.isSafeInteger(next[player]) || Math.abs(next[player]) > 1000000000) {
        throw new Error("Die Korrektur ist zu groß.");
      }
    }
    transaction.set(reference, next);
  });
}

function errorMessage(error) {
  if (error?.code === "permission-denied") {
    return "Leaderboard noch nicht freigeschaltet. Bitte die aktuelle firestore.rules in der Firebase Console veröffentlichen.";
  }
  if (error?.code === "unavailable" || navigator.onLine === false) {
    return "Keine Verbindung. Dein Ergebnis bleibt auf diesem Gerät erhalten; bitte später erneut speichern.";
  }
  return "Firebase-Verbindung fehlgeschlagen. Bitte später erneut versuchen.";
}

export function createLeaderboardStore() {
  let scores = calculateLeaderboard([]);
  let status = "Rangliste wird geladen …";
  let firestore;
  let db;
  let rounds = [];
  let adjustments = { revision: 0, Daniel: 0, Fabian: 0, Tim: 0 };
  let roundsLive = false;
  let adjustmentsLive = false;
  let connectionError = "";
  const listeners = new Set();
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (Array.isArray(cached) && cached.length === 3 && PLAYERS.every((player) =>
      cached.some((score) => score.player === player && Number.isSafeInteger(score.bingos)
        && score.bingos >= 0 && Number.isSafeInteger(score.rounds) && score.rounds >= 0
        && Number.isInteger(score.rank) && score.rank >= 1 && score.rank <= 3))) {
      scores = cached;
      status = "Gespeicherter Stand · Rangliste wird aktualisiert …";
    }
  } catch { /* A local cache is optional. */ }
  function snapshot() {
    return { scores: scores.map((score) => ({ ...score })), status,
      editable: roundsLive && adjustmentsLive && !connectionError, revision: adjustments.revision };
  }
  function notify() { for (const listener of listeners) listener(snapshot()); }
  function refresh() {
    if (roundsLive && adjustmentsLive && !connectionError) {
      scores = calculateLeaderboard(rounds, adjustments);
      status = "Live · Gesamtwertung aller abgeschlossenen Runden";
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(scores)); } catch { /* Optional cache. */ }
    } else {
      status = connectionError || "Gespeicherter Stand · Verbindung wird geprüft";
    }
    notify();
  }
  function reportConnectionError(error) { connectionError = errorMessage(error); refresh(); }

  async function connect() {
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId
      || Object.values(firebaseConfig).some((value) => String(value).startsWith("HIER_"))) {
      status = "Für die gemeinsame Rangliste muss Firebase eingerichtet sein.";
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
      firestore.onSnapshot(firestore.collection(db, "smashBingoRounds"), { includeMetadataChanges: true }, (snapshot) => {
        rounds = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
        roundsLive = !snapshot.metadata.fromCache;
        refresh();
      }, reportConnectionError);
      firestore.onSnapshot(firestore.doc(db, "smashBingo", "leaderboardAdjustments"), { includeMetadataChanges: true }, (snapshot) => {
        adjustments = snapshot.exists() ? snapshot.data() : { revision: 0, Daniel: 0, Fabian: 0, Tim: 0 };
        adjustmentsLive = !snapshot.metadata.fromCache;
        refresh();
      }, reportConnectionError);
    } catch (error) { status = errorMessage(error); notify(); }
  }
  const ready = connect();
  return {
    subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); },
    async saveAdjustment(edit) {
      await ready;
      if (!firestore || !db || !roundsLive || !adjustmentsLive || connectionError) {
        throw new Error("Bitte warte auf die Live-Rangliste. Prüfe die Verbindung und die aktuellen Firebase-Regeln.");
      }
      if (navigator.onLine === false) throw new Error("Keine Verbindung. Bitte später erneut Edit öffnen.");
      try { await recordLeaderboardAdjustment(firestore, db, edit); }
      catch (error) {
        if (error.code === "permission-denied") throw new Error(errorMessage(error));
        if (error.code) throw new Error("Speichern nicht bestätigt. Bitte den Live-Stand prüfen und erneut Edit öffnen.");
        throw error;
      }
    },
    async finishRound(round) {
      await ready;
      if (!firestore || !db) throw new Error(status);
      if (navigator.onLine === false) throw new Error(errorMessage({ code: "unavailable" }));
      try { await recordRound(firestore, db, round); }
      catch (error) {
        if (error.code) throw new Error(errorMessage(error));
        throw error;
      }
    },
  };
}
