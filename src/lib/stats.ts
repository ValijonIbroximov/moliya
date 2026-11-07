// Statistika yordamchilari — faqat tasdiqlangan ("ok") satrlar asosida

import type { Account, Computed, Currency, Entry } from "./types";
import { daysBetween, monthEnd, monthOf, monthStart, shiftDate, shiftMonth } from "./dates";

export interface Flow {
  income: number;
  expense: number; // musbat son
  net: number;
  debtGiven: number; // shaxs hisoblariga chiqqan (qarz berildi / qaytarildi)
  debtReturned: number;
  transfers: number; // o'tkazmalar hajmi
  diffPlus: number; // qoldiq tafovutlari
  diffMinus: number;
  count: number;
  days: number;
}

export interface Period {
  from: string;
  to: string;
  label: string;
}

export function periodFor(kind: string, todayStr: string): Period {
  const ym = monthOf(todayStr);
  switch (kind) {
    case "7":
      return { from: shiftDate(todayStr, -6), to: todayStr, label: "Oxirgi 7 kun" };
    case "30":
      return { from: shiftDate(todayStr, -29), to: todayStr, label: "Oxirgi 30 kun" };
    case "90":
      return { from: shiftDate(todayStr, -89), to: todayStr, label: "Oxirgi 90 kun" };
    case "month":
      return { from: monthStart(ym), to: monthEnd(ym), label: "Joriy oy" };
    case "prev": {
      const p = shiftMonth(ym, -1);
      return { from: monthStart(p), to: monthEnd(p), label: "O'tgan oy" };
    }
    case "year":
      return { from: todayStr.slice(0, 4) + "-01-01", to: todayStr, label: "Shu yil" };
    default:
      return { from: shiftDate(todayStr, -29), to: todayStr, label: "Oxirgi 30 kun" };
  }
}

export function previousPeriod(p: Period): Period {
  const len = daysBetween(p.from, p.to) + 1;
  return { from: shiftDate(p.from, -len), to: shiftDate(p.from, -1), label: "Oldingi davr" };
}

export function inPeriod(e: Entry, p: Period): boolean {
  return e.date >= p.from && e.date <= p.to;
}

/** Shaxs hisobidagi o'zgarish: + berildi (qarz oshdi), − qaytdi */
export function debtDelta(e: Entry, accounts: Map<string, Account>): number {
  if (e.type !== "debt") return 0;
  const a = accounts.get(e.account!);
  if (a?.type === "person") return e.amount!;
  if (e.counterparty && accounts.get(e.counterparty)?.type === "person") return -e.amount!;
  return 0;
}

export function flow(ok: Entry[], p: Period, cur: Currency, accounts: Account[]): Flow {
  const am = new Map(accounts.map((a) => [a.code, a]));
  const f: Flow = { income: 0, expense: 0, net: 0, debtGiven: 0, debtReturned: 0, transfers: 0, diffPlus: 0, diffMinus: 0, count: 0, days: daysBetween(p.from, p.to) + 1 };
  for (const e of ok) {
    if (e.currency !== cur || !inPeriod(e, p)) continue;
    if (e.diff) {
      if (e.diff > 0) f.diffPlus += e.diff; else f.diffMinus += -e.diff;
    }
    if (e.type === "income") { f.income += e.amount!; f.count++; }
    else if (e.type === "expense") { f.expense += -e.amount!; f.count++; }
    else if (e.type === "transfer") { if (e.pairPrimary || !e.pairedWith) f.transfers += Math.abs(e.amount!); }
    else if (e.type === "debt") {
      if (e.pairedWith && !e.pairPrimary) continue;
      const d = debtDelta(e, am);
      if (d > 0) f.debtGiven += d; else f.debtReturned += -d;
    }
  }
  f.net = f.income - f.expense;
  for (const k of Object.keys(f) as (keyof Flow)[]) f[k] = Math.round(f[k] * 100) / 100;
  return f;
}

export interface CatRow { category: string; amount: number; count: number; share: number }

export function byCategory(ok: Entry[], p: Period, cur: Currency, type: "expense" | "income" = "expense"): CatRow[] {
  const m = new Map<string, { amount: number; count: number }>();
  let total = 0;
  for (const e of ok) {
    if (e.type !== type || e.currency !== cur || !inPeriod(e, p)) continue;
    const k = e.category || "toifasiz";
    const v = Math.abs(e.amount!);
    const r = m.get(k) || { amount: 0, count: 0 };
    r.amount += v; r.count++; m.set(k, r);
    total += v;
  }
  return [...m.entries()]
    .map(([category, r]) => ({ category, amount: r.amount, count: r.count, share: total ? r.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export interface DayPoint { date: string; income: number; expense: number }

export function dailySeries(ok: Entry[], p: Period, cur: Currency): DayPoint[] {
  const n = daysBetween(p.from, p.to) + 1;
  const pts: DayPoint[] = [];
  const idx = new Map<string, number>();
  for (let i = 0; i < n; i++) { const d = shiftDate(p.from, i); idx.set(d, i); pts.push({ date: d, income: 0, expense: 0 }); }
  for (const e of ok) {
    if (e.currency !== cur) continue;
    const i = idx.get(e.date);
    if (i === undefined) continue;
    if (e.type === "income") pts[i].income += e.amount!;
    else if (e.type === "expense") pts[i].expense += -e.amount!;
  }
  return pts;
}

/** Kunlik nuqtalarni k ta guruhga yig'ish (haftalik va h.k.) */
export function bucketize(pts: DayPoint[], buckets: number): { label: string; from: string; to: string; income: number; expense: number }[] {
  if (!pts.length) return [];
  const size = Math.ceil(pts.length / buckets);
  const out = [];
  for (let i = 0; i < pts.length; i += size) {
    const sl = pts.slice(i, i + size);
    out.push({
      label: sl[0].date.slice(8, 10) + "." + sl[0].date.slice(5, 7),
      from: sl[0].date, to: sl[sl.length - 1].date,
      income: sl.reduce((s, x) => s + x.income, 0),
      expense: sl.reduce((s, x) => s + x.expense, 0),
    });
  }
  return out;
}

export interface MonthPoint { ym: string; income: number; expense: number; net: number }

export function monthlySeries(ok: Entry[], cur: Currency, todayStr: string, months = 6): MonthPoint[] {
  const cur_ym = monthOf(todayStr);
  const out: MonthPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const ym = shiftMonth(cur_ym, -i);
    out.push({ ym, income: 0, expense: 0, net: 0 });
  }
  const idx = new Map(out.map((m, i) => [m.ym, i]));
  for (const e of ok) {
    if (e.currency !== cur) continue;
    const i = idx.get(monthOf(e.date));
    if (i === undefined) continue;
    if (e.type === "income") out[i].income += e.amount!;
    else if (e.type === "expense") out[i].expense += -e.amount!;
  }
  for (const m of out) m.net = m.income - m.expense;
  return out;
}

/** Hisob turlari bo'yicha yig'indi (faqat ma'lum qoldiqlar, shaxs hisoblarsiz) */
export function totals(c: Computed, accounts: Account[], cur: Currency) {
  let total = 0, home = 0, active = 0, known = 0, all = 0, unknownMove = 0;
  for (const a of accounts) {
    if (a.archived || a.type === "person") continue;
    const b = c.balances[a.code]?.[cur];
    if (!b) continue;
    if (!b.known && b.value === 0) continue;
    all++;
    if (!b.known) { unknownMove += b.value; continue; }
    known++;
    total += b.value;
    if (a.type === "home") home += b.value; else active += b.value;
  }
  return { total, home, active, known, all, unknownMove };
}

/** Shaxs hisoblari: musbat — sizga qarzdor, manfiy — siz qarzdorsiz */
export function debts(c: Computed, accounts: Account[]) {
  const out: { account: Account; cur: Currency; value: number; known: boolean }[] = [];
  for (const a of accounts) {
    if (a.archived || a.type !== "person") continue;
    const row = c.balances[a.code] || {};
    for (const [cur, b] of Object.entries(row)) {
      if (!b) continue;
      if (!b.known && b.value === 0) continue;
      out.push({ account: a, cur: cur as Currency, value: b.value, known: b.known });
    }
  }
  return out;
}
