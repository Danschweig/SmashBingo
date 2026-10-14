import vm from "node:vm";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import * as fieldModel from "../../field-model.js";

const source = (await fs.readFile(new URL("../../board.js", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "");

export function boardHarness(savedBoard, finishAction = async () => {}, poolFields = Array.from({ length: 30 }, (_, i) => "Field " + i)) {
  const storage = new Map(savedBoard ? [["smash-bingo-board-v1", JSON.stringify(savedBoard)]] : []);
  const elements = new Map();
  const audioPlays = [];
  function matches(node, selector) {
    if (selector === "*") return true;
    if (selector.includes(",")) return selector.split(",").some((part) => matches(node, part.trim()));
    const index = /\[data-index="(\d+)"\]/.exec(selector)?.[1];
    const base = selector.replace(/\[.*\]/, "");
    return (base.startsWith(".") ? node.className.split(/\s+/).includes(base.slice(1)) : node.tag === base)
      && (index === undefined || String(node.dataset.index) === index);
  }
  function element(tag = "") {
    const node = {
      tag, className: "", dataset: {}, style: {}, attributes: {}, children: [], textContent: "", disabled: false, hidden: false,
      setAttribute(name, value) { this.attributes[name] = value; }, addEventListener() {}, focus() {},
      replaceChildren(...children) { this.children = children; },
      append(...children) { this.children.push(...children); },
      querySelectorAll(selector) {
        return this.children.flatMap((child) => [child, ...child.querySelectorAll("*")]).filter((child) => matches(child, selector));
      },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      currentTime: 0, pause() {}, play() { audioPlays.push(this.id); return Promise.resolve(); },
    };
    node.classList = {
      add(name) { if (!node.className.split(/\s+/).includes(name)) node.className = (node.className + " " + name).trim(); },
      remove(name) { node.className = node.className.split(/\s+/).filter((value) => value !== name).join(" "); },
      toggle(name, active = !node.className.split(/\s+/).includes(name)) { if (active) this.add(name); else this.remove(name); },
    };
    return node;
  }
  const players = ["Daniel", "Fabian", "Tim"].map((player) => Object.assign(element("button"), { dataset: { player } }));
  const sizes = [4, 5].map((size) => Object.assign(element("button"), { dataset: { size } }));
  const submitted = [];
  let poolSubscriber;
  const context = vm.createContext({
    ...fieldModel, console, crypto: { randomUUID }, navigator: {}, location: { protocol: "https:" },
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    document: {
      querySelector(id) { if (!elements.has(id)) elements.set(id, Object.assign(element(), { id })); return elements.get(id); },
      querySelectorAll(selector) { return selector === ".player-option" ? players : sizes; },
      createElement: element,
    },
    window: { confirm: () => true, addEventListener() {}, clearTimeout() {}, setTimeout() { return 1; } },
    PLAYERS: ["Daniel", "Fabian", "Tim"],
    createPoolStore: () => ({ subscribe(callback) {
      poolSubscriber = callback;
      callback({ fields: poolFields, bonusFields: ["Bonus"] });
    } }),
    createLeaderboardEditor() {},
    createLeaderboardStore: () => ({ subscribe(callback) { callback({ scores: [], status: "Test" }); }, async finishRound(result) { submitted.push(result); await finishAction(result); } }),
  });
  vm.runInContext(source, context);
  return { storage, elements, players, submitted, audioPlays, updatePool: (fields) => poolSubscriber({ fields, bonusFields: ["Bonus"] }), run: (code) => vm.runInContext(code, context) };
}
