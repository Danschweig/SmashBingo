import { createPoolStore } from "./pool-store.js";

const store = createPoolStore();
const elements = {
  form: document.querySelector("#fieldForm"),
  input: document.querySelector("#fieldInput"),
  submitButton: document.querySelector("#fieldForm button"),
  formError: document.querySelector("#formError"),
  list: document.querySelector("#fieldList"),
  listEmpty: document.querySelector("#listEmpty"),
  headerCount: document.querySelector("#headerCount"),
  poolBadge: document.querySelector("#poolBadge"),
  deletedPanel: document.querySelector("#deletedFieldsPanel"),
  deletedList: document.querySelector("#deletedFieldList"),
  deletedBadge: document.querySelector("#deletedFieldsBadge"),
  syncNotice: document.querySelector("#syncNotice"),
  syncTitle: document.querySelector("#syncTitle"),
  syncText: document.querySelector("#syncText"),
  toast: document.querySelector("#toast"),
};

let fields = [];
let deletedFields = [];
let toastTimer;

function renderFields() {
  elements.list.replaceChildren();
  elements.listEmpty.hidden = fields.length !== 0;
  elements.headerCount.textContent = fields.length;
  elements.poolBadge.textContent = fields.length;

  fields.forEach((field) => {
    const item = document.createElement("li");
    item.className = "field-item";

    const text = document.createElement("span");
    text.textContent = field;

    const remove = document.createElement("button");
    remove.className = "delete-button";
    remove.type = "button";
    remove.dataset.field = field;
    remove.setAttribute("aria-label", `„${field}“ löschen`);
    remove.title = "Feld löschen";
    remove.innerHTML = "&#10005;";

    item.append(text, remove);
    elements.list.append(item);
  });
}

function formatRemainingTime(expiresAt) {
  const remainingSeconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = String(remainingSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateRestoreCountdowns() {
  elements.deletedList.querySelectorAll(".restore-countdown").forEach((countdown) => {
    countdown.textContent = `Noch ${formatRemainingTime(Number(countdown.dataset.expiresAt))}`;
  });
}

function renderDeletedFields() {
  elements.deletedList.replaceChildren();
  elements.deletedPanel.hidden = deletedFields.length === 0;
  elements.deletedBadge.textContent = deletedFields.length;

  [...deletedFields].reverse().forEach(({ field, expiresAt }) => {
    const item = document.createElement("li");
    item.className = "deleted-field-item";

    const content = document.createElement("div");
    const text = document.createElement("span");
    text.textContent = field;
    const countdown = document.createElement("small");
    countdown.className = "restore-countdown";
    countdown.dataset.expiresAt = expiresAt;
    content.append(text, countdown);

    const restore = document.createElement("button");
    restore.className = "restore-button";
    restore.type = "button";
    restore.dataset.field = field;
    restore.textContent = "Wiederherstellen";
    restore.setAttribute("aria-label", `„${field}“ wiederherstellen`);

    item.append(content, restore);
    elements.deletedList.append(item);
  });

  updateRestoreCountdowns();
}

function renderSyncState(mode, detail) {
  elements.syncNotice.className = `sync-notice is-${mode}`;
  const content = {
    connecting: ["Cloud wird verbunden …", detail],
    remote: ["Live synchronisiert", detail],
    local: ["Nur auf diesem Gerät", `${detail} Die Firebase-Einrichtung steht in der README.`],
    error: ["Cloud nicht erreichbar", detail],
  }[mode];

  elements.syncTitle.textContent = content[0];
  elements.syncText.textContent = content[1];
  const isConnecting = mode === "connecting";
  elements.input.disabled = isConnecting;
  elements.submitButton.disabled = isConnecting;
  elements.list.querySelectorAll(".delete-button").forEach((button) => {
    button.disabled = isConnecting;
  });
  elements.deletedList.querySelectorAll(".restore-button").forEach((button) => {
    button.disabled = isConnecting;
  });
}

function setBusy(isBusy) {
  elements.input.disabled = isBusy;
  elements.submitButton.disabled = isBusy;
  elements.list.querySelectorAll(".delete-button").forEach((button) => {
    button.disabled = isBusy;
  });
  elements.deletedList.querySelectorAll(".restore-button").forEach((button) => {
    button.disabled = isBusy;
  });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
}

store.subscribe((state) => {
  fields = state.fields;
  deletedFields = state.deletedFields;
  renderFields();
  renderDeletedFields();
  renderSyncState(state.mode, state.detail);
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.formError.textContent = "";
  setBusy(true);
  try {
    await store.addField(elements.input.value);
    elements.form.reset();
    showToast("Feld zum gemeinsamen Pool hinzugefügt");
  } catch (error) {
    elements.formError.textContent = error.message;
  } finally {
    setBusy(false);
    elements.input.focus();
  }
});

elements.list.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-button");
  if (!button) return;

  button.disabled = true;
  try {
    await store.removeField(button.dataset.field);
    showToast(`„${button.dataset.field}“ entfernt · 5 Min. wiederherstellbar`);
  } catch (error) {
    button.disabled = false;
    elements.formError.textContent = error.message;
  }
});

elements.deletedList.addEventListener("click", async (event) => {
  const button = event.target.closest(".restore-button");
  if (!button) return;

  button.disabled = true;
  elements.formError.textContent = "";
  try {
    await store.restoreField(button.dataset.field);
    showToast(`„${button.dataset.field}“ wiederhergestellt`);
  } catch (error) {
    button.disabled = false;
    elements.formError.textContent = error.message;
  }
});

window.setInterval(updateRestoreCountdowns, 1000);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js"));
}
