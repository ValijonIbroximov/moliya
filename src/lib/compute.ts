// Hisob-kitob yadrosi: balanslar, juftlashtirish, tafovutlar, toifalar.
// Faqat "ok" satrlar balansga ta'sir qiladi.

import type { Account, Balances, BalanceCell, Computed, Currency, Entry, Issue, Note, Settings } from "./types";
import { indexAccounts, parseNote, normText, splitTail } from "./parser";
import { daysBetween } from "./dates";

const round2 = (n: number) => Math.round(n * 100) / 100;

export const DEFAULT_CATEGORIES = [
  "ovqat", "obed", "kechki ovqat", "transport", "taksi", "metro", "samokat", "do'kon", "bozor",
  "apteka", "sog'liq", "aloqa", "internet", "kiyim", "uy", "kommunal", "oylik", "premya", "sovg'a", "o'qish",
];

export function entrySig(e: Entry): string {
  return `${e.date}|${e.account}|${e.amount}|${e.currency}`;
}

function cell(b: Balances, code: string, cur: Currency): BalanceCell {
  const row = (b[code] ||= {});
  return (row[cur] ||= { value: 0, known: false });
}

export function compute(notes: Note[], accounts: Account[], settings: Settings, todayStr: string): Computed {
  const idx = indexAccounts(accounts);
  const accByCode = new Map(accounts.map((a) => [a.code, a]));
  const live = notes.filter((n) => !n.deleted).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  const order = new Map(live.map((n, i) => [n.id, i]));

  const all: Entry[] = [];
  for (const n of live)
    for (const e of parseNote(n, idx, todayStr))
      if (e.status !== "header" && e.status !== "empty") {
        if (n.disabled) e.disabled = true;
        all.push(e);
      }

  all.sort(
    (a, b) => a.date.localeCompare(b.date) || order.get(a.noteId)! - order.get(b.noteId)! || a.line - b.line,
  );

  const ok = all.filter((e) => e.status === "ok" && !e.disabled);

  // ---- toifalar (ikki bosqich) ----
  const tailCount = new Map<string, number>();
  const explicitCats = new Set<string>();
  for (const e of ok) {
    if (e.type === "snapshot" || e.type === "transfer" || !e.tail) continue;
    const { category, comment } = splitTail(e.tail);
    if (comment) explicitCats.add(normText(category));
    else {
      const t = normText(e.tail);
      tailCount.set(t, (tailCount.get(t) || 0) + 1);
    }
  }
  const known = new Set<string>(DEFAULT_CATEGORIES.map(normText));
  for (const c of explicitCats) if (c) known.add(c);
  for (const [t, c] of tailCount) {
    const words = t.split(" ").length;
    if (words <= 1 || (words <= 3 && c >= 2)) known.add(t);
  }
  const knownList = [...known].sort((a, b) => b.length - a.length);
  const catFreq = new Map<string, number>();
  const bump = (c: string) => catFreq.set(c, (catFreq.get(c) || 0) + 1);

  for (const e of ok) {
    if (e.type === "total") { e.category = "jami"; continue; }
    if (e.type === "snapshot") { e.category = "qoldiq"; e.comment = e.tail || ""; continue; }
    if (e.type === "transfer") { e.category = "o'tkazma"; e.comment = e.tail || ""; continue; }
    if (e.type === "debt" && e.counterparty) { e.category = "qarz"; e.comment = e.tail || ""; continue; }
    const tail = e.tail || "";
    if (!tail) { e.category = ""; e.comment = ""; continue; }
    const { category, comment } = splitTail(tail);
    if (comment) { e.category = normText(category); e.comment = comment; bump(e.category); continue; }
    const t = normText(tail);
    if (known.has(t)) { e.category = t; e.comment = ""; bump(t); continue; }
    const hit = knownList.find((k) => k && new RegExp(`(^|\\s)${escapeRe(k)}(\\s|$)`, "u").test(t));
    if (hit) { e.category = hit; e.comment = tail; bump(hit); continue; }
    e.category = t; e.comment = ""; bump(t);
  }

  // ---- juftlashtirish (o'tkazmaning ikkala tomoni) ----
  const confirmed = new Set(settings.confirmedPairs || []);
  const rejected = new Set(settings.rejectedPairs || []);
  const issues: Issue[] = [];
  for (const e of ok) e.sig = entrySig(e);

  const pairable = (e: Entry) => e.status === "ok" && e.type !== "snapshot" && e.type !== "total" && !e.pairedWith && e.amount !== 0;
  for (let i = 0; i < ok.length; i++) {
    const e = ok[i];
    if (!pairable(e)) continue;
    for (let j = i + 1; j < ok.length; j++) {
      const f = ok[j];
      if (daysBetween(e.date, f.date) > 1) break;
      if (!pairable(f)) continue;
      if (f.account === e.account || f.currency !== e.currency) continue;
      if (round2(e.amount! + f.amount!) !== 0) continue;
      const eHint = e.counterparty, fHint = f.counterparty;
      if (eHint && eHint !== f.account) continue;
      if (fHint && fHint !== e.account) continue;
      const sig = e.sig + "~" + f.sig;
      if (rejected.has(sig)) continue;
      const hinted = !!(eHint || fHint);
      if (hinted || confirmed.has(sig)) {
        e.pairedWith = f.key; f.pairedWith = e.key; e.pairPrimary = true;
        e.counterparty = f.account; f.counterparty = e.account;
        const pa = accByCode.get(e.account!), pb = accByCode.get(f.account!);
        const t = pa?.type === "person" || pb?.type === "person" ? "debt" : "transfer";
        e.type = t; f.type = t;
        if (t === "transfer") { e.category = "o'tkazma"; f.category = "o'tkazma"; } else { e.category = "qarz"; f.category = "qarz"; }
        break;
      }
      if (e.date === f.date && !e.explicit && !f.explicit) {
        issues.push({
          kind: "possible_pair",
          entry: e,
          other: f,
          amount: Math.abs(e.amount!),
          currency: e.currency,
          pairSig: sig,
          text: `Ehtimoliy o'tkazma: ${e.account} → ${f.account}. Ikkala satr ham yozilgan bo'lsa, bu bitta o'tkazma — tasdiqlang`,
        });
      }
    }
  }

  // ---- valyuta ayirboshlash juftligi ----
  // "C -3583803 so'm 300$ sotib olindi" + "Uy +300$ C dan" — turli valyuta, summalar teng bo'lmaydi.
  // Shart: hint ("C dan") boshqa hisobga ko'rsatsin, qarama-qarshi ishora, bir sana, va satrlardan
  // birida $ / dollar / valyuta / kurs / ayirbosh so'zi bo'lsin. Ikkala tomon ham transfer bo'ladi.
  const exMention = (x: Entry) => /[$]|dollar|valyuta|kurs|ayirbosh/i.test((x.tail || "") + " " + (x.raw || ""));
  for (let i = 0; i < ok.length; i++) {
    const e = ok[i];
    if (!pairable(e) || !e.counterparty) continue;
    if (accByCode.get(e.account!)?.type === "person") continue;
    for (let j = 0; j < ok.length; j++) {
      const f = ok[j];
      if (f === e || !pairable(f)) continue;
      if (f.account !== e.counterparty || f.currency === e.currency || e.date !== f.date) continue;
      if (Math.sign(e.amount!) === Math.sign(f.amount!)) continue;
      if (f.counterparty && f.counterparty !== e.account) continue;
      if (accByCode.get(f.account!)?.type === "person") continue;
      if (!exMention(e) && !exMention(f)) continue;
      const prim = e.currency === "UZS" ? e : f;
      const sec = prim === e ? f : e;
      e.pairedWith = f.key; f.pairedWith = e.key; prim.pairPrimary = true; sec.pairPrimary = false;
      e.counterparty = f.account!; f.counterparty = e.account!;
      e.type = "transfer"; f.type = "transfer";
      e.exchange = true; f.exchange = true;
      e.category = "ayirboshlash"; f.category = "ayirboshlash";
      break;
    }
  }

  // ---- balanslar ----
  const balances: Balances = {};
  for (const a of accounts) cell(balances, a.code, a.currency);
  for (const e of ok) {
    const cur = e.currency!;
    if (e.type === "total") {
      // Jami = Uy+N+K+C+U+T... (shaxs va qayd hisoblaridan tashqari, faqat ma'lum UZS qoldiqlar)
      let sum = 0;
      let unknownCnt = 0;
      for (const a of accounts) {
        if (a.archived || a.type === "person" || a.type === "report") continue;
        const bb = balances[a.code]?.["UZS"];
        if (!bb) continue;
        if (bb.known) sum = round2(sum + bb.value);
        else if (bb.value !== 0) unknownCnt++;
      }
      e.balanceAfter = sum;
      const d = round2(e.amount! - sum);
      if (Math.abs(d) > 999.5) {
        e.diff = d;
        issues.push({ kind: "snapshot_diff", entry: e, amount: d, currency: "UZS", text: unknownCnt ? `Jami tekshiruv: ${unknownCnt} hisob qoldig'i noma'lum` : "Jami tekshiruv hisobga mos emas" });
      }
      continue;
    }
    const b = cell(balances, e.account!, cur);
    // yaxlitlash chegarasi: so'mda 1 000 dan kichik farq tafovut hisoblanmaydi (0,7 ming kabi)
    const tol = cur === "UZS" ? 999.5 : 0.005;
    if (e.type === "snapshot") {
      if (b.known && Math.abs(b.value - e.amount!) > tol) {
        e.diff = round2(e.amount! - b.value);
        issues.push({ kind: "snapshot_diff", entry: e, amount: e.diff, currency: cur, text: `Qoldiq tafovuti: ${e.account}` });
      }
      b.value = e.amount!;
      b.known = true;
      b.lastSnapshot = e.date;
      e.balanceAfter = b.value;
      continue;
    }
    const secondary = !!e.pairedWith && !e.pairPrimary && !e.exchange;
    if (!secondary) {
      b.value = round2(b.value + e.amount!);
      // Ayirboshlashda har tomon o'z valyutasida o'z hisobiga yoziladi — ko'zgu aksi kerak emas
      if (e.counterparty && !e.exchange) {
        const o = cell(balances, e.counterparty, cur);
        o.value = round2(o.value - e.amount!);
      }
    }
    if (e.expected !== undefined) {
      if (b.known) {
        const d = round2(e.expected - b.value);
        if (Math.abs(d) > tol) {
          e.diff = d;
          issues.push({ kind: "expected_mismatch", entry: e, amount: d, currency: cur, text: `Yozilgan qoldiq hisobga mos emas: ${e.account}` });
        }
      }
      b.value = e.expected;
      b.known = true;
    }
    e.balanceAfter = b.value;
  }

  // ---- boshqa masalalar ----
  for (const e of all) {
    if (e.disabled) continue;
    if (e.status === "pending") issues.push({ kind: "pending", entry: e, text: e.reason || "Chala yozuv" });
    else if (e.status === "unknown_account") issues.push({ kind: "unknown_account", entry: e, text: e.reason || "Noma'lum hisob" });
    else if (e.status === "unclear") issues.push({ kind: "unclear", entry: e, text: e.reason || "Noaniq yozuv" });
    else if (e.status === "ok" && e.uncertain) issues.push({ kind: "uncertain", entry: e, text: "Savol belgisi bilan yozilgan — tekshiring" });
  }

  const knownCategories = [...catFreq.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  for (const c of DEFAULT_CATEGORIES) if (!knownCategories.includes(c)) knownCategories.push(c);
  const comments: string[] = [];
  for (let i = ok.length - 1; i >= 0 && comments.length < 200; i--) {
    const c = ok[i].comment;
    if (c && !comments.includes(c)) comments.push(c);
  }

  return { entries: all, ok, balances, issues, knownCategories, comments };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Hisobning qoldiq katagini olish */
export function getCell(b: Balances, code: string, cur: Currency): BalanceCell {
  return b[code]?.[cur] || { value: 0, known: false };
}
