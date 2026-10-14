export const MAX_FIELD_TARGET = 999;

export function fieldText(field) {
  return typeof field === "string" ? field : field.text;
}

export function fieldTarget(field) {
  return typeof field === "string" ? 1 : field.target;
}

export function isBingoField(field) {
  const text = typeof field === "string" ? field : field?.text;
  const target = typeof field === "string" ? 1 : field?.target;
  return typeof text === "string" && text.trim().length > 0 && text.length <= 80
    && Number.isInteger(target) && target >= 1 && target <= MAX_FIELD_TARGET;
}

export function makeBingoField(value, target = 1) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!text) throw new Error("Bitte gib zuerst einen Text ein.");
  if (text.length > 80) throw new Error("Ein Feld darf höchstens 80 Zeichen lang sein.");
  if (!Number.isInteger(target) || target < 1 || target > MAX_FIELD_TARGET) {
    throw new Error("Die benötigte Anzahl muss eine ganze Zahl zwischen 1 und 999 sein.");
  }
  // Keep existing single-occurrence fields compatible with stored strings.
  return target === 1 ? text : { text, target };
}

export function sameField(first, second) {
  return fieldTarget(first) === fieldTarget(second)
    && fieldText(first).localeCompare(fieldText(second), "de", { sensitivity: "base" }) === 0;
}

export function fieldLabel(field) {
  const target = fieldTarget(field);
  return target > 1 ? `${target} × ${fieldText(field)}` : fieldText(field);
}

export function restoreCellProgress(fields, progress, marked = []) {
  const legacyMarks = new Set(Array.isArray(marked) ? marked : []);
  return fields.map((field, index) => {
    const target = fieldTarget(field);
    if (!Array.isArray(progress)) return legacyMarks.has(index) ? target : 0;
    const count = progress[index];
    return Number.isInteger(count) && count >= 0 ? Math.min(count, target) : 0;
  });
}
