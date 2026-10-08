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

export function calculateLeaderboard(rounds) {
  const scores = PLAYERS.map((player) => ({ player, bingos: 0, rounds: 0 }));
  for (const round of rounds) {
    try { validateRound(round); } catch { continue; }
    const score = scores.find((item) => item.player === round.player);
    score.bingos += round.bingos + Number(round.bonusBingo);
    score.rounds += 1;
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
  function notify() { for (const listener of listeners) listener({ scores, status }); }

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
        if (!snapshot.metadata.fromCache || snapshot.docs.length) {
          scores = calculateLeaderboard(snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
        }
        status = snapshot.metadata.fromCache ? "Gespeicherter Stand · Verbindung wird geprüft" : "Live · Gesamtwertung aller abgeschlossenen Runden";
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(scores)); } catch { /* Optional cache. */ }
        notify();
      }, (error) => { status = errorMessage(error); notify(); });
    } catch (error) { status = errorMessage(error); notify(); }
  }
  const ready = connect();
  return {
    subscribe(listener) { listeners.add(listener); listener({ scores, status }); return () => listeners.delete(listener); },
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
