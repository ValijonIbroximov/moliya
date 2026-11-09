// Composer yordamchilari: joriy satrni bo'laklarga ajratish va qayta yig'ish.
// Tugmalar (hisob, amal, summa, toifa) matnni shu orqali o'zgartiradi.

import { normApos } from "./parser";

export interface LineParts {
  special?: boolean; // Jami / sana sarlavhasi — tugmalar yangi satrga yozsin
  account: string; // kod yoki ""
  op: "-" | "+" | "=" | "->" | "";
  target: string; // o'tkazma uchun
  amount: string; // "24-12", "30" — belgisiz
  unit: string; // " so'm", "$" va h.k. (summa ketidagi birlik tokeni)
  expected: string; // "3447"
  tail: string;
}

const CODE = "[\\p{L}][\\p{L}\\d_'ʻ‘’]*";
const NUM = "(?:\\d{1,3}(?:[ \\u00a0]\\d{3})+|\\d+)(?:[.,]\\d+)?";
const EXPR = `\\$?${NUM}(?:\\s*[+\\-−]\\s*\\$?${NUM})*`;
const RE = new RegExp(
  `^\\s*(${CODE})?\\s*(?:(->|→|=>|>)\\s*(${CODE})?|([+\\-−=]))?\\s*(${EXPR})?\\s*(ming|mln|so'm|som|sum|uzs|usd|dollar|eur|rub|\\$|€|₽|k(?![\\p{L}\\d]))?\\s*(?:=\\s*([+\\-−]?\\$?${NUM})\\s*(ming|mln|so'm|som|sum|uzs|usd|\\$|€)?)?\\s*(.*)$`,
  "su",
);

export function decompose(line: string, isAccount: (code: string) => boolean): LineParts {
  const t = normApos(line);
  // Maxsus satrlar: "Jami = ..." va sana sarlavhalari — yordamchi maydonlarga chiqarilmaydi
  if (/^\s*(?:jami|total)\b/i.test(t) || /^\s*\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\s*(?:\p{L}+\s*)?$/u.test(t) || /^\s*\d{4}-\d{1,2}-\d{1,2}\s*$/.test(t)) {
    return { account: "", op: "", target: "", amount: "", unit: "", expected: "", tail: "", special: true };
  }
  const m = t.match(RE);
  const empty: LineParts = { account: "", op: "", target: "", amount: "", unit: "", expected: "", tail: t.trim() };
  if (!m) return empty;
  const acc = m[1] && isAccount(m[1]) ? m[1] : "";
  if (!acc) return { ...empty, tail: t.trim() };
  let op: LineParts["op"] = "";
  let target = "";
  if (m[2]) { op = "->"; target = m[3] && isAccount(m[3]) ? m[3] : ""; }
  else if (m[4]) op = m[4] === "−" ? "-" : (m[4] as LineParts["op"]);
  // "C-K 100" shakli
  let amount = (m[5] || "").trim();
  let tail = (m[9] || "").trim();
  if (op === "-" && !amount && tail) {
    const tm = tail.match(new RegExp(`^(${CODE})\\s+(${EXPR})\\s*(.*)$`, "su"));
    if (tm && isAccount(tm[1])) { op = "->"; target = tm[1]; amount = tm[2]; tail = (tm[3] || "").trim(); }
  }
  return { account: acc, op, target, amount, unit: m[6] ? " " + m[6] : "", expected: (m[7] || "").trim(), tail };
}

export function compose(p: LineParts): string {
  if (!p.account) return p.tail;
  let s = p.account;
  if (p.op === "->") {
    s += " -> " + (p.target || "");
    if (p.amount) s += " " + p.amount;
  } else if (p.op) {
    s += " " + p.op + (p.op === "=" ? " " : "") + p.amount;
  } else if (p.amount) s += " -" + p.amount;
  if (p.amount && p.unit) s += p.unit;
  if (p.expected) s += " = " + p.expected;
  if (p.tail) s += " " + p.tail;
  return s.replace(/\s+$/, "");
}

/** Toifa va izohni tailga yig'ish: "do'kon, non va sut" */
export function composeTail(category: string, comment: string): string {
  const c = category.trim();
  const k = comment.trim();
  if (c && k) return `${c}, ${k}`;
  return c || k;
}

export function splitTailSimple(tail: string): { category: string; comment: string } {
  const i = tail.indexOf(",");
  if (i > 0) return { category: tail.slice(0, i).trim(), comment: tail.slice(i + 1).trim() };
  return { category: tail.trim(), comment: "" };
}

/** Matndagi satrlar va kursor turgan satr indeksi */
export function lineAt(text: string, caret: number): { lines: string[]; index: number; start: number } {
  const lines = text.split("\n");
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    const end = pos + lines[i].length;
    if (caret <= end) return { lines, index: i, start: pos };
    pos = end + 1;
  }
  return { lines, index: lines.length - 1, start: Math.max(0, text.length - lines[lines.length - 1].length) };
}

export function replaceLine(text: string, index: number, newLine: string): { text: string; caret: number } {
  const lines = text.split("\n");
  lines[index] = newLine;
  const out = lines.join("\n");
  let caret = 0;
  for (let i = 0; i <= index; i++) caret += lines[i].length + (i < index ? 1 : 0);
  return { text: out, caret };
}
