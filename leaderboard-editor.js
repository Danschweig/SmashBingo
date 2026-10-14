import { PLAYERS } from "./leaderboard-store.js";

// A UI password gate for this private static app, not a server-side admin login.
const EDIT_PASSWORD = "Schiss";
const EDIT_TIMEOUT_MS = 5 * 60 * 1000;

export function createLeaderboardEditor(store) {
  const elements = {
    button: document.querySelector("#leaderboardEditButton"),
    dialog: document.querySelector("#leaderboardEditDialog"),
    passwordForm: document.querySelector("#leaderboardPasswordForm"),
    password: document.querySelector("#leaderboardPassword"),
    passwordError: document.querySelector("#leaderboardPasswordError"),
    form: document.querySelector("#leaderboardEditForm"),
    save: document.querySelector("#leaderboardEditSave"),
    error: document.querySelector("#leaderboardEditError"),
    status: document.querySelector("#leaderboardEditStatus"),
    cancelButtons: [...document.querySelectorAll(".leaderboard-edit-cancel")],
    inputs: Object.fromEntries(PLAYERS.map((player) => [player, document.querySelector("#leaderboardScore" + player)])),
  };
  let latest;
  let session = null;
  let expiryTimer;
  let saving = false;
  store.subscribe((state) => {
    latest = state;
    elements.button.disabled = saving || !state.editable;
  });

  function lock() {
    session = null;
    window.clearTimeout(expiryTimer);
    elements.password.value = "";
    elements.passwordError.textContent = "";
    elements.error.textContent = "";
    elements.passwordForm.hidden = false;
    elements.form.hidden = true;
    for (const input of Object.values(elements.inputs)) input.value = "";
  }
  function close() {
    lock();
    if (elements.dialog.open) elements.dialog.close();
  }
  elements.button.addEventListener("click", () => {
    if (saving || !latest?.editable) return;
    lock();
    elements.status.textContent = "";
    elements.dialog.showModal();
    elements.password.focus();
  });
  elements.passwordForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (saving || !elements.dialog.open) return;
    const correct = elements.password.value === EDIT_PASSWORD;
    elements.password.value = "";
    if (!correct) {
      elements.passwordError.textContent = "Falsches Passwort.";
      elements.password.focus();
      return;
    }
    if (!latest?.editable) {
      elements.passwordError.textContent = "Bitte warte auf eine Verbindung zur Live-Rangliste.";
      return;
    }
    session = {
      revision: latest.revision,
      base: Object.fromEntries(latest.scores.map((score) => [score.player, score.bingos])),
      expiresAt: Date.now() + EDIT_TIMEOUT_MS,
    };
    for (const player of PLAYERS) elements.inputs[player].value = String(session.base[player]);
    elements.passwordError.textContent = "";
    elements.passwordForm.hidden = true;
    elements.form.hidden = false;
    elements.inputs.Daniel.focus();
    expiryTimer = window.setTimeout(() => {
      close();
      elements.status.textContent = "Bearbeitungszeit abgelaufen. Bitte erneut Edit öffnen und das Passwort eingeben.";
    }, EDIT_TIMEOUT_MS);
  });
  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!session || Date.now() >= session.expiresAt) {
      close();
      elements.status.textContent = "Bitte erneut Edit öffnen und das Passwort eingeben.";
      return;
    }
    const values = Object.fromEntries(PLAYERS.map((player) => {
      const value = elements.inputs[player].value.trim();
      return [player, /^\d+$/.test(value) ? Number(value) : NaN];
    }));
    if (Object.values(values).some((value) => !Number.isSafeInteger(value) || value > 1000000000)) {
      elements.error.textContent = "Bitte nur ganze Zahlen zwischen 0 und 1.000.000.000 eingeben.";
      return;
    }
    const edit = { revision: session.revision, base: { ...session.base }, values };
    // Consume this unlock before the request. Neither success nor failure leaves admin mode active.
    saving = true;
    elements.button.disabled = true;
    close();
    elements.status.textContent = "Korrektur wird gespeichert …";
    try {
      await store.saveAdjustment(edit);
      elements.status.textContent = "Leaderboard gespeichert. Bearbeitungsmodus beendet.";
    } catch (error) {
      elements.status.textContent = (error.message || "Speichern fehlgeschlagen.") + " Für einen neuen Versuch ist das Passwort erneut nötig.";
    } finally {
      saving = false;
      lock();
      elements.button.disabled = !latest?.editable;
    }
  });
  for (const button of elements.cancelButtons) button.addEventListener("click", close);
  elements.dialog.addEventListener("cancel", close);
  elements.dialog.addEventListener("close", lock);
  window.addEventListener("pagehide", close);
}
