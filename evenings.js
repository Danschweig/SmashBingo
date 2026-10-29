import { createEveningStore, validEveningDate, validateEvening } from "./evening-store.js";

const DRAFT_KEY = "smash-bingo-evening-draft-v1";

export function createEveningEditor(store) {
  const get = (id) => document.querySelector("#" + id);
  const form = get("eveningForm");
  const controls = get("eveningControls");
  const date = get("eveningDate");
  const winner = get("eveningWinner");
  const player = get("eveningSchissPlayer");
  const score = get("eveningSchissScore");
  const save = get("eveningSave");
  const reload = get("eveningReload");
  const feedback = get("eveningFeedback");
  let state = { evenings: [], stats: [], live: false };
  let revision = 0;
  let dirty = false;
  let saving = false;
  const today = new Date();
  date.value = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (draft && validEveningDate(draft.date) && Number.isSafeInteger(draft.revision) && draft.revision >= 0
      && [draft.winner, draft.schissPlayer, draft.schissScore].every((value) => typeof value === "string")) {
      date.value = draft.date;
      winner.value = draft.winner;
      player.value = draft.schissPlayer;
      score.value = draft.schissScore;
      revision = draft.revision;
      dirty = draft.dirty !== false;
      feedback.textContent = dirty ? "Ungespeicherte Eingaben wiederhergestellt." : "Letzten gespeicherten Spieleabend geladen.";
    }
  } catch { /* Draft caching is optional. */ }

  function cacheDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ date: date.value, winner: winner.value,
        schissPlayer: player.value, schissScore: score.value, revision, dirty }));
    } catch { /* Keep the in-memory form usable when storage is unavailable. */ }
  }
  function loadDate() {
    const evening = state.evenings.find((value) => value.date === date.value);
    revision = evening?.revision ?? 0;
    winner.value = evening?.winner ?? "";
    player.value = evening?.schissPlayer ?? "";
    score.value = evening ? String(evening.schissScore) : "";
    dirty = false;
  }
  function renderControls() {
    controls.disabled = saving;
    save.disabled = saving || !state.live;
    reload.disabled = saving || !state.live;
    save.textContent = saving ? "Wird gespeichert …" : "Spieleabend speichern";
  }
  function cell(row, text, tag = "td") {
    const node = document.createElement(tag);
    node.textContent = text;
    row.append(node);
    return node;
  }
  function renderStats() {
    const body = get("eveningStats");
    body.replaceChildren();
    for (const stat of state.stats) {
      const row = document.createElement("tr");
      const name = cell(row, stat.player, "th");
      name.scope = "row";
      cell(row, stat.wins);
      cell(row, stat.schissCount);
      cell(row, stat.schissAverage === null ? "–" : stat.schissAverage.toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " / 10");
      cell(row, stat.schissMax ? stat.schissMax + " / 10" : "–");
      body.append(row);
    }
    const history = get("eveningHistory");
    history.replaceChildren();
    get("eveningEmpty").hidden = state.evenings.length > 0;
    get("eveningHistoryTable").hidden = state.evenings.length === 0;
    for (const evening of state.evenings) {
      const row = document.createElement("tr");
      const [year, month, day] = evening.date.split("-");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "evening-date-button";
      button.textContent = `${day}.${month}.${year}`;
      button.dataset.date = evening.date;
      button.setAttribute("aria-label", `Spieleabend vom ${button.textContent} bearbeiten`);
      button.disabled = saving;
      const dateCell = document.createElement("td");
      dateCell.append(button);
      row.append(dateCell);
      cell(row, evening.winner);
      cell(row, evening.schissPlayer + " · " + evening.schissScore + " / 10");
      history.append(row);
    }
  }
  date.addEventListener("change", () => {
    loadDate();
    feedback.textContent = revision ? "Gespeicherten Spieleabend geladen. Änderungen ersetzen diesen Eintrag." : "Neuer Spieleabend für dieses Datum.";
    cacheDraft();
  });
  form.addEventListener("input", () => { dirty = true; feedback.textContent = ""; cacheDraft(); });
  reload.addEventListener("click", () => {
    if (saving || !state.live) return;
    loadDate();
    cacheDraft();
    feedback.textContent = "Aktuellen Stand für dieses Datum geladen.";
  });
  get("eveningHistory").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-date]");
    if (!button || saving) return;
    date.value = button.dataset.date;
    loadDate();
    cacheDraft();
    feedback.textContent = "Gespeicherten Spieleabend geladen. Änderungen ersetzen diesen Eintrag.";
    date.focus();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving || !state.live) return;
    const evening = { date: date.value, winner: winner.value, schissPlayer: player.value,
      schissScore: Number(score.value), revision };
    try { validateEvening(evening); } catch (error) { feedback.textContent = error.message; return; }
    saving = true;
    renderControls();
    renderStats();
    cacheDraft();
    try {
      revision = await store.save(evening);
      // Retain the confirmed revision even if the snapshot arrives after the response.
      dirty = false;
      cacheDraft();
      feedback.textContent = "Spieleabend gespeichert ✓";
    } catch (error) {
      feedback.textContent = error.message || "Speichern fehlgeschlagen. Bitte erneut versuchen.";
    } finally {
      saving = false;
      renderControls();
      renderStats();
    }
  });
  store.subscribe((next) => {
    state = next;
    get("eveningStatus").textContent = state.status;
    const current = state.evenings.find((value) => value.date === date.value);
    if (state.live && !dirty && !saving && (current?.revision ?? 0) >= revision) loadDate();
    renderControls();
    renderStats();
  });
}

createEveningEditor(createEveningStore());
