import { firebaseConfig } from "./firebase-config.js";

const STORAGE_KEY = "smash-bingo-fields-v1";
const FIREBASE_VERSION = "12.16.0";

export const starterFields = [
  "Pokémon-Eskalation",
  "Jemand fällt erbärmlich runter",
  "Schildbruch",
  "Final Smash geht daneben",
  "Aus Versehen selbst zerstört",
  "Perfekter Konter",
  "Item entscheidet das Match",
  "Jemand überlebt mit 150 %",
  "Sudden Death",
  "Dreifach-K. o.",
  "Pokéball trifft den Werfer",
  "Alle kämpfen am Rand",
  "Controller-Ausrede",
  "Falsche Richtung angegriffen",
  "Sieg mit nur einem Leben",
  "Stage Hazard sorgt für Chaos",
  "Jemand tauntet zu früh",
  "Unfreiwilliger Team-K. o.",
  "Ultra-seltener Charakter-Pick",
  "Zwei fliegen gleichzeitig raus",
  "Comeback bei über 100 %",
  "Niemand nimmt das Item",
  "Meteor Smash",
  "Angriff in die komplett falsche Ecke",
  "Alle drei schreien gleichzeitig",
  "Ein CPU wäre besser gewesen",
  "Sieger hatte einfach nur Glück",
  "Rache im nächsten Match angekündigt",
  "K. o. in den ersten 10 Sekunden",
  "Jemand pausiert aus Versehen",
];

function loadLocalFields() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) && saved.every((item) => typeof item === "string")
      ? saved
      : [...starterFields];
  } catch {
    return [...starterFields];
  }
}

function firebaseIsConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      firebaseConfig.appId &&
      !firebaseConfig.apiKey.startsWith("HIER_") &&
      !firebaseConfig.projectId.startsWith("HIER_") &&
      !firebaseConfig.appId.startsWith("HIER_"),
  );
}

function normalizeField(value) {
  return value.trim().replace(/\s+/g, " ");
}

export function createPoolStore() {
  let fields = loadLocalFields();
  let mode = firebaseIsConfigured() ? "connecting" : "local";
  let detail = mode === "local" ? "Firebase ist noch nicht eingerichtet." : "Verbindung zu Firestore wird aufgebaut.";
  let remoteActions = null;
  const listeners = new Set();

  function snapshot() {
    return { fields: [...fields], mode, detail };
  }

  function notify() {
    const current = snapshot();
    listeners.forEach((listener) => listener(current));
  }

  function storeLocal(nextFields) {
    fields = [...nextFields];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fields));
    notify();
  }

  async function connectFirebase() {
    if (!firebaseIsConfigured()) return;

    try {
      const [{ initializeApp }, firestore] = await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
      ]);

      const app = initializeApp(firebaseConfig);
      const db = firestore.getFirestore(app);
      const poolReference = firestore.doc(db, "smashBingo", "sharedPool");
      const initialSnapshot = await firestore.getDoc(poolReference);

      if (!initialSnapshot.exists()) {
        await firestore.setDoc(poolReference, {
          fields,
          updatedAt: firestore.serverTimestamp(),
        });
      } else {
        const remoteFields = initialSnapshot.data().fields;
        if (Array.isArray(remoteFields)) storeLocal(remoteFields);
      }

      remoteActions = {
        add: (field) =>
          firestore.updateDoc(poolReference, {
            fields: firestore.arrayUnion(field),
            updatedAt: firestore.serverTimestamp(),
          }),
        remove: (field) =>
          firestore.updateDoc(poolReference, {
            fields: firestore.arrayRemove(field),
            updatedAt: firestore.serverTimestamp(),
          }),
        addMany: (items) =>
          firestore.updateDoc(poolReference, {
            fields: firestore.arrayUnion(...items),
            updatedAt: firestore.serverTimestamp(),
          }),
      };

      mode = "remote";
      detail = "Änderungen werden live an alle geöffneten Geräte übertragen.";
      notify();

      firestore.onSnapshot(
        poolReference,
        (documentSnapshot) => {
          const remoteFields = documentSnapshot.data()?.fields;
          if (Array.isArray(remoteFields)) storeLocal(remoteFields);
          mode = "remote";
          detail = documentSnapshot.metadata.fromCache
            ? "Offline – Änderungen werden synchronisiert, sobald die Verbindung zurück ist."
            : "Änderungen werden live an alle geöffneten Geräte übertragen.";
          notify();
        },
        (error) => {
          mode = "error";
          detail = `Firestore-Fehler: ${error.message}`;
          notify();
        },
      );
    } catch (error) {
      mode = "error";
      detail = `Cloud-Verbindung fehlgeschlagen. Lokaler Speicher bleibt aktiv: ${error.message}`;
      remoteActions = null;
      notify();
    }
  }

  const ready = connectFirebase();

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY && !remoteActions) {
      fields = loadLocalFields();
      notify();
    }
  });

  return {
    ready,

    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },

    async addField(value) {
      await ready;
      const field = normalizeField(value);
      if (!field) throw new Error("Bitte gib zuerst einen Text ein.");
      if (field.length > 80) throw new Error("Ein Feld darf höchstens 80 Zeichen lang sein.");

      const exists = fields.some((item) => item.localeCompare(field, "de", { sensitivity: "base" }) === 0);
      if (exists) throw new Error("Dieses Feld ist bereits im Pool.");
      if (fields.length >= 200) throw new Error("Der Pool kann höchstens 200 Felder enthalten.");

      if (remoteActions) {
        await remoteActions.add(field);
      } else {
        storeLocal([...fields, field]);
      }
      return field;
    },

    async removeField(field) {
      await ready;
      if (remoteActions) {
        await remoteActions.remove(field);
      } else {
        storeLocal(fields.filter((item) => item !== field));
      }
    },

    async addExamples() {
      await ready;
      const additions = starterFields.filter(
        (example) => !fields.some((item) => item.localeCompare(example, "de", { sensitivity: "base" }) === 0),
      );
      if (!additions.length) return 0;

      const availableSlots = Math.max(0, 200 - fields.length);
      const selectedAdditions = additions.slice(0, availableSlots);
      if (remoteActions) {
        await remoteActions.addMany(selectedAdditions);
      } else {
        storeLocal([...fields, ...selectedAdditions]);
      }
      return selectedAdditions.length;
    },
  };
}
