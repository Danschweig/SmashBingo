import { firebaseConfig } from "./firebase-config.js";

const STORAGE_KEY = "smash-bingo-fields-v1";
const DELETED_FIELDS_KEY = "smash-bingo-deleted-fields-v1";
const RESTORE_WINDOW_MS = 5 * 60 * 1000;
const FIREBASE_VERSION = "12.16.0";

export const starterFields = [
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

function loadDeletedFields() {
  try {
    const saved = JSON.parse(localStorage.getItem(DELETED_FIELDS_KEY));
    const now = Date.now();
    return Array.isArray(saved)
      ? saved.filter(
          (item) =>
            item &&
            typeof item.field === "string" &&
            Number.isFinite(item.deletedAt) &&
            item.deletedAt <= now &&
            item.deletedAt + RESTORE_WINDOW_MS > now,
        )
      : [];
  } catch {
    return [];
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
  let deletedFields = loadDeletedFields();
  let mode = firebaseIsConfigured() ? "connecting" : "local";
  let detail = mode === "local" ? "Firebase ist noch nicht eingerichtet." : "Verbindung zu Firestore wird aufgebaut.";
  let remoteActions = null;
  let deletedFieldsTimer;
  const listeners = new Set();

  function snapshot() {
    return {
      fields: [...fields],
      deletedFields: deletedFields.map((item) => ({
        ...item,
        expiresAt: item.deletedAt + RESTORE_WINDOW_MS,
      })),
      mode,
      detail,
    };
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

  function scheduleDeletedFieldsCleanup() {
    window.clearTimeout(deletedFieldsTimer);
    if (!deletedFields.length) return;

    const nextExpiry = Math.min(...deletedFields.map((item) => item.deletedAt + RESTORE_WINDOW_MS));
    deletedFieldsTimer = window.setTimeout(cleanupDeletedFields, Math.max(0, nextExpiry - Date.now()) + 50);
  }

  function storeDeletedFields(nextDeletedFields) {
    deletedFields = [...nextDeletedFields];
    if (deletedFields.length) {
      localStorage.setItem(DELETED_FIELDS_KEY, JSON.stringify(deletedFields));
    } else {
      localStorage.removeItem(DELETED_FIELDS_KEY);
    }
    scheduleDeletedFieldsCleanup();
    notify();
  }

  function cleanupDeletedFields() {
    const now = Date.now();
    const activeDeletedFields = deletedFields.filter(
      (item) => item.deletedAt + RESTORE_WINDOW_MS > now,
    );

    if (activeDeletedFields.length !== deletedFields.length) {
      storeDeletedFields(activeDeletedFields);
    } else {
      scheduleDeletedFieldsCleanup();
    }
  }

  function rememberDeletedField(field) {
    storeDeletedFields([
      ...deletedFields.filter((item) => item.field !== field),
      { field, deletedAt: Date.now() },
    ]);
  }

  function forgetDeletedField(field) {
    storeDeletedFields(deletedFields.filter((item) => item.field !== field));
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
    if (event.key === DELETED_FIELDS_KEY) {
      deletedFields = loadDeletedFields();
      scheduleDeletedFieldsCleanup();
      notify();
    }
  });

  scheduleDeletedFieldsCleanup();

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
      if (!fields.includes(field)) return;

      if (remoteActions) {
        await remoteActions.remove(field);
      } else {
        storeLocal(fields.filter((item) => item !== field));
      }
      rememberDeletedField(field);
    },

    async restoreField(field) {
      await ready;
      cleanupDeletedFields();

      const deletedField = deletedFields.find((item) => item.field === field);
      if (!deletedField) throw new Error("Die 5-Minuten-Frist für dieses Feld ist abgelaufen.");

      const alreadyExists = fields.some(
        (item) => item.localeCompare(field, "de", { sensitivity: "base" }) === 0,
      );
      if (alreadyExists) {
        forgetDeletedField(field);
        return field;
      }
      if (fields.length >= 200) {
        throw new Error("Der Pool kann höchstens 200 Felder enthalten.");
      }

      if (remoteActions) {
        await remoteActions.add(field);
      } else {
        storeLocal([...fields, field]);
      }
      forgetDeletedField(field);
      return field;
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
