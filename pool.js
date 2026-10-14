import { createPoolStore } from "./pool-store.js";
import { fieldText, fieldTarget, fieldLabel, sameField } from "./field-model.js";

const store = createPoolStore();
const elements = {
  form: document.querySelector("#fieldForm"),
  input: document.querySelector("#fieldInput"),
  target: document.querySelector("#fieldTarget"),
  submitButton: document.querySelector("#fieldForm button"),
  formError: document.querySelector("#formError"),
  list: document.querySelector("#fieldList"),
  listEmpty: document.querySelector("#listEmpty"),
  headerCount: document.querySelector("#headerCount"),
  poolBadge: document.querySelector("#poolBadge"),
  deletedPanel: document.querySelector("#deletedFieldsPanel"),
  deletedList: document.querySelector("#deletedFieldList"),
  deletedBadge: document.querySelector("#deletedFieldsBadge"),
  bonusForm: document.querySelector("#bonusFieldForm"),
  bonusInput: document.querySelector("#bonusFieldInput"),
  bonusSubmitButton: document.querySelector("#bonusFieldForm button"),
  bonusFormError: document.querySelector("#bonusFormError"),
  bonusList: document.querySelector("#bonusFieldList"),
  bonusListEmpty: document.querySelector("#bonusListEmpty"),
  bonusBadge: document.querySelector("#bonusPoolBadge"),
  syncNotice: document.querySelector("#syncNotice"),
  syncTitle: document.querySelector("#syncTitle"),
  syncText: document.querySelector("#syncText"),
  toast: document.querySelector("#toast"),
};

let fields = [];
let bonusFields = [];
let deletedFields = [];
let editingField = null;
let editingBonusField = null;
let syncMode = "connecting";
let isBusy = false;
let toastTimer;

function renderFields() {
  elements.list.replaceChildren();
  elements.listEmpty.hidden = fields.length !== 0;
  elements.headerCount.textContent = fields.length;
  elements.poolBadge.textContent = fields.length;

  fields.forEach((field) => {
    const item = document.createElement("li");
    item.className = "field-item";

    if (editingField && sameField(field, JSON.parse(editingField))) {
      item.classList.add("is-editing");

      const editForm = document.createElement("form");
      editForm.className = "edit-field-form counted-edit-form";
      editForm.dataset.field = JSON.stringify(field);

      const editInput = document.createElement("input");
      editInput.className = "edit-field-input";
      editInput.type = "text";
      editInput.maxLength = 80;
      editInput.value = fieldText(field);
      editInput.required = true;
      editInput.setAttribute("aria-label", `„${fieldLabel(field)}“ bearbeiten`);

      const targetLabel = document.createElement("label");
      targetLabel.className = "edit-target-control";
      targetLabel.textContent = "Benötigte Anzahl";
      const targetInput = document.createElement("input");
      targetInput.className = "edit-field-target";
      targetInput.type = "number";
      targetInput.min = "1";
      targetInput.max = "999";
      targetInput.step = "1";
      targetInput.inputMode = "numeric";
      targetInput.required = true;
      targetInput.value = fieldTarget(field);
      targetInput.setAttribute("aria-label", "Benötigte Anzahl");
      targetLabel.append(targetInput);

      const save = document.createElement("button");
      save.className = "edit-save-button";
      save.type = "submit";
      save.textContent = "✓";
      save.title = "Änderung speichern";
      save.setAttribute("aria-label", "Änderung speichern");

      const cancel = document.createElement("button");
      cancel.className = "edit-cancel-button";
      cancel.type = "button";
      cancel.textContent = "✕";
      cancel.title = "Bearbeitung abbrechen";
      cancel.setAttribute("aria-label", "Bearbeitung abbrechen");

      editForm.append(editInput, targetLabel, save, cancel);
      item.append(editForm);
      elements.list.append(item);
      return;
    }

    const text = document.createElement("span");
    text.className = "field-text";
    text.textContent = fieldLabel(field);

    const actions = document.createElement("div");
    actions.className = "field-actions";

    const edit = document.createElement("button");
    edit.className = "edit-button";
    edit.type = "button";
    edit.dataset.field = JSON.stringify(field);
    edit.setAttribute("aria-label", `„${fieldLabel(field)}“ bearbeiten`);
    edit.title = "Feld bearbeiten";
    edit.innerHTML = "&#9998;";

    const remove = document.createElement("button");
    remove.className = "delete-button";
    remove.type = "button";
    remove.dataset.field = JSON.stringify(field);
    remove.setAttribute("aria-label", `„${fieldLabel(field)}“ löschen`);
    remove.title = "Feld löschen";
    remove.innerHTML = "&#10005;";

    actions.append(edit, remove);
    item.append(text, actions);
    elements.list.append(item);
  });

  updateInteractiveState();
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
    text.textContent = fieldLabel(field);
    const countdown = document.createElement("small");
    countdown.className = "restore-countdown";
    countdown.dataset.expiresAt = expiresAt;
    content.append(text, countdown);

    const restore = document.createElement("button");
    restore.className = "restore-button";
    restore.type = "button";
    restore.dataset.field = JSON.stringify(field);
    restore.textContent = "Wiederherstellen";
    restore.setAttribute("aria-label", `„${fieldLabel(field)}“ wiederherstellen`);

    item.append(content, restore);
    elements.deletedList.append(item);
  });

  updateRestoreCountdowns();
}

function renderBonusFields() {
  elements.bonusList.replaceChildren();
  elements.bonusListEmpty.hidden = bonusFields.length !== 0;
  elements.bonusBadge.textContent = bonusFields.length;

  bonusFields.forEach((field) => {
    const item = document.createElement("li");
    item.className = "field-item bonus-field-item";

    if (field === editingBonusField) {
      item.classList.add("is-editing");

      const editForm = document.createElement("form");
      editForm.className = "edit-field-form bonus-edit-field-form";
      editForm.dataset.field = field;

      const editInput = document.createElement("input");
      editInput.className = "edit-field-input";
      editInput.type = "text";
      editInput.maxLength = 80;
      editInput.value = field;
      editInput.required = true;
      editInput.setAttribute("aria-label", `Bonus-Feld „${field}“ bearbeiten`);

      const save = document.createElement("button");
      save.className = "edit-save-button";
      save.type = "submit";
      save.textContent = "✓";
      save.title = "Änderung speichern";
      save.setAttribute("aria-label", "Änderung speichern");

      const cancel = document.createElement("button");
      cancel.className = "edit-cancel-button bonus-edit-cancel-button";
      cancel.type = "button";
      cancel.textContent = "✕";
      cancel.title = "Bearbeitung abbrechen";
      cancel.setAttribute("aria-label", "Bearbeitung abbrechen");

      editForm.append(editInput, save, cancel);
      item.append(editForm);
      elements.bonusList.append(item);
      return;
    }

    const text = document.createElement("span");
    text.className = "field-text";
    text.textContent = field;

    const actions = document.createElement("div");
    actions.className = "field-actions";

    const edit = document.createElement("button");
    edit.className = "edit-button bonus-edit-button";
    edit.type = "button";
    edit.dataset.field = field;
    edit.setAttribute("aria-label", `Bonus-Feld „${field}“ bearbeiten`);
    edit.title = "Bonus-Feld bearbeiten";
    edit.innerHTML = "&#9998;";

    const remove = document.createElement("button");
    remove.className = "delete-button bonus-delete-button";
    remove.type = "button";
    remove.dataset.field = field;
    remove.setAttribute("aria-label", `Bonus-Feld „${field}“ löschen`);
    remove.title = "Bonus-Feld löschen";
    remove.innerHTML = "&#10005;";

    actions.append(edit, remove);
    item.append(text, actions);
    elements.bonusList.append(item);
  });

  updateInteractiveState();
}

function renderSyncState(mode, detail) {
  syncMode = mode;
  elements.syncNotice.className = `sync-notice is-${mode}`;
  const content = {
    connecting: ["Cloud wird verbunden …", detail],
    remote: ["Live synchronisiert", detail],
    local: ["Nur auf diesem Gerät", `${detail} Die Firebase-Einrichtung steht in der README.`],
    error: ["Cloud nicht erreichbar", detail],
  }[mode];

  elements.syncTitle.textContent = content[0];
  elements.syncText.textContent = content[1];
  updateInteractiveState();
}

function updateInteractiveState() {
  const disabled = isBusy || syncMode === "connecting";
  elements.input.disabled = disabled;
  elements.target.disabled = disabled;
  elements.submitButton.disabled = disabled;
  elements.bonusInput.disabled = disabled;
  elements.bonusSubmitButton.disabled = disabled;
  elements.list
    .querySelectorAll(".delete-button, .edit-button, .edit-field-input, .edit-field-target, .edit-save-button, .edit-cancel-button")
    .forEach((control) => {
      control.disabled = disabled;
    });
  elements.deletedList.querySelectorAll(".restore-button").forEach((button) => {
    button.disabled = disabled;
  });
  elements.bonusList
    .querySelectorAll("button, input")
    .forEach((control) => {
      control.disabled = disabled;
    });
}

function setBusy(nextIsBusy) {
  isBusy = nextIsBusy;
  updateInteractiveState();
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
}

store.subscribe((state) => {
  fields = state.fields;
  bonusFields = state.bonusFields;
  deletedFields = state.deletedFields;
  renderFields();
  renderDeletedFields();
  renderBonusFields();
  renderSyncState(state.mode, state.detail);
});

elements.bonusForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.bonusFormError.textContent = "";
  setBusy(true);
  try {
    await store.addBonusField(elements.bonusInput.value);
    elements.bonusForm.reset();
    showToast("Bonus-Feld zum gemeinsamen Pool hinzugefügt");
  } catch (error) {
    elements.bonusFormError.textContent = error.message;
  } finally {
    setBusy(false);
    elements.bonusInput.focus();
  }
});

elements.bonusList.addEventListener("click", async (event) => {
  const editButton = event.target.closest(".bonus-edit-button");
  if (editButton) {
    editingBonusField = editButton.dataset.field;
    elements.bonusFormError.textContent = "";
    renderBonusFields();
    const editInput = elements.bonusList.querySelector(".edit-field-input");
    editInput?.focus();
    editInput?.select();
    return;
  }

  if (event.target.closest(".bonus-edit-cancel-button")) {
    editingBonusField = null;
    elements.bonusFormError.textContent = "";
    renderBonusFields();
    return;
  }

  const deleteButton = event.target.closest(".bonus-delete-button");
  if (!deleteButton) return;

  deleteButton.disabled = true;
  try {
    await store.removeBonusField(deleteButton.dataset.field);
    showToast(`Bonus-Feld „${deleteButton.dataset.field}“ entfernt`);
  } catch (error) {
    deleteButton.disabled = false;
    elements.bonusFormError.textContent = error.message;
  }
});

elements.bonusList.addEventListener("submit", async (event) => {
  const editForm = event.target.closest(".bonus-edit-field-form");
  if (!editForm) return;

  event.preventDefault();
  const editInput = editForm.querySelector(".edit-field-input");
  elements.bonusFormError.textContent = "";
  setBusy(true);
  try {
    const updatedField = await store.updateBonusField(editForm.dataset.field, editInput.value);
    editingBonusField = null;
    showToast(`Bonus-Feld „${updatedField}“ aktualisiert`);
  } catch (error) {
    elements.bonusFormError.textContent = error.message;
  } finally {
    setBusy(false);
    if (editingBonusField) editInput.focus();
  }
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.formError.textContent = "";
  setBusy(true);
  try {
    await store.addField(elements.input.value, Number(elements.target.value));
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
  const editButton = event.target.closest(".edit-button");
  if (editButton) {
    editingField = editButton.dataset.field;
    elements.formError.textContent = "";
    renderFields();
    const editInput = elements.list.querySelector(".edit-field-input");
    editInput?.focus();
    editInput?.select();
    return;
  }

  const cancelButton = event.target.closest(".edit-cancel-button");
  if (cancelButton) {
    editingField = null;
    elements.formError.textContent = "";
    renderFields();
    return;
  }

  const button = event.target.closest(".delete-button");
  if (!button) return;

  button.disabled = true;
  try {
    const field = JSON.parse(button.dataset.field);
    await store.removeField(field);
    showToast(`„${fieldLabel(field)}“ entfernt · 5 Min. wiederherstellbar`);
  } catch (error) {
    button.disabled = false;
    elements.formError.textContent = error.message;
  }
});

elements.list.addEventListener("submit", async (event) => {
  const editForm = event.target.closest(".edit-field-form");
  if (!editForm) return;

  event.preventDefault();
  const editInput = editForm.querySelector(".edit-field-input");
  elements.formError.textContent = "";
  setBusy(true);
  try {
    const targetInput = editForm.querySelector(".edit-field-target");
    const updatedField = await store.updateField(JSON.parse(editForm.dataset.field), editInput.value, Number(targetInput.value));
    editingField = null;
    showToast(`„${fieldLabel(updatedField)}“ aktualisiert`);
  } catch (error) {
    elements.formError.textContent = error.message;
  } finally {
    setBusy(false);
    if (editingField) editInput.focus();
    else renderFields();
  }
});

elements.deletedList.addEventListener("click", async (event) => {
  const button = event.target.closest(".restore-button");
  if (!button) return;

  button.disabled = true;
  elements.formError.textContent = "";
  try {
    const field = JSON.parse(button.dataset.field);
    await store.restoreField(field);
    showToast(`„${fieldLabel(field)}“ wiederhergestellt`);
  } catch (error) {
    button.disabled = false;
    elements.formError.textContent = error.message;
  }
});

window.setInterval(updateRestoreCountdowns, 1000);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js"));
}
