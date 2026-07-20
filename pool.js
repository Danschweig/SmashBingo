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
  resetButton: document.querySelector("#resetButton"),
  syncNotice: document.querySelector("#syncNotice"),
  syncTitle: document.querySelector("#syncTitle"),
  syncText: document.querySelector("#syncText"),
  toast: document.querySelector("#toast"),
};

let fields = [];
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
  elements.resetButton.disabled = isConnecting;
}

function setBusy(isBusy) {
  elements.input.disabled = isBusy;
  elements.submitButton.disabled = isBusy;
  elements.resetButton.disabled = isBusy;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
}

store.subscribe((state) => {
  fields = state.fields;
  renderFields();
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
    showToast(`„${button.dataset.field}“ entfernt`);
  } catch (error) {
    button.disabled = false;
    elements.formError.textContent = error.message;
  }
});

elements.resetButton.addEventListener("click", async () => {
  setBusy(true);
  elements.formError.textContent = "";
  try {
    const count = await store.addExamples();
    showToast(count ? `${count} Beispiele hinzugefügt` : "Alle Beispiele sind bereits im Pool");
  } catch (error) {
    elements.formError.textContent = error.message;
  } finally {
    setBusy(false);
  }
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js"));
}
