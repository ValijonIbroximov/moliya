// Erkin matn parseri — Google Keep uslubidagi satrlarni operatsiyalarga aylantiradi.
// Xom matn hech qachon o'zgartirilmaydi; faqat o'qiladi.

import type { Account, Currency, Entry, Note, QuickFix } from "./types";
import { parseDateHeader } from "./dates";

export const normApos = (s: string) => s.replace(/[ʻ‘’`´ʼ]/g, "'");
export const normCode = (s: string) => normApos(s).toLowerCase();
export const normText = (s: string) => normApos(s).replace(/\s+/g, " ").trim().toLowerCase();

const CODE = "[\\p{L}][\\p{L}\\d_'ʻ‘’]*";
const NUM = "(?:\\d{1,3}(?:[ \\u00a0]\\d{3})+|\\d+)(?:[.,]\\d+)?";
const TERM = `\\$?${NUM}(?:\\s*[*xх×]\\s*${NUM})*`;
const EXPR = `[+\\-−]?\\s*${TERM}(?:\\s*[+\\-−]\\s*${TERM})*`;

const RE_ACCOUNT = new RegExp(`^(${CODE})`, "u");
const RE_TRANSFER = new RegExp(`^\\s*(?:->|→|=>|>)\\s*(${CODE})\\s*(.*)$`, "su");
const RE_TRANSFER_DASH = new RegExp(`^\\s*[-−]\\s*(${CODE})(?![\\p{L}\\d])\\s*(.*)$`, "su");
const RE_OP = new RegExp(`^\\s*([+\\-−=])\\s*(${EXPR})(.*)$`, "su");
const RE_EXPECTED = new RegExp(`^\\s*=\\s*([+\\-−]?\\$?${NUM})(.*)$`, "su");
const RE_UNIT =
  /^\s*(ming|mln|million|mlrd|milliard|so'm|som|sum|uzs|usd|dollar|dollor|eur|evro|rub|rubl|\$|€|₽|k(?![\p{L}\d]))(?![\p{L}])/iu;

export interface AccountIndex {
  byCode: Map<string, Account>;
  list: Account[];
}

export function indexAccounts(accounts: Account[]): AccountIndex {
  const byCode = new Map<string, Account>();
  for (const a of accounts) {
    if (a.archived) continue;
    byCode.set(normCode(a.code), a);
  }
  // taxalluslar kodlardan keyin — kod ustun
  for (const a of accounts) {
    if (a.archived) continue;
    for (const al of a.aliases || []) {
      const k = normCode(al);
      if (k && !byCode.has(k)) byCode.set(k, a);
    }
  }
  return { byCode, list: accounts.filter((a) => !a.archived) };
}

export function findAccount(idx: AccountIndex, token: string): Account | undefined {
  return idx.byCode.get(normCode(token));
}

/** "uyga" → Uy, "naqddan" → N */
function findAccountLoose(idx: AccountIndex, token: string): Account | undefined {
  const direct = findAccount(idx, token);
  if (direct) return direct;
  const t = normCode(token).replace(/\s+/g, " ").trim();
  for (const suf of ["dan", "gacha", "ga", "ge", "da"]) {
    if (t.length > suf.length + 0 && t.endsWith(suf)) {
      const base = t.slice(0, -suf.length);
      if (base) {
        const a = idx.byCode.get(base);
        if (a) return a;
      }
    }
  }
  return undefined;
}

interface UnitInfo {
  currency?: Currency;
  multiplier?: number;
  len: number; // tokenning uzunligi (bo'shliq bilan)
}

function readUnit(s: string): UnitInfo {
  const m = s.match(RE_UNIT);
  if (!m) return { len: 0 };
  const tok = normCode(m[1]);
  const len = m[0].length;
  switch (tok) {
    case "ming":
    case "k":
      return { multiplier: 1000, len };
    case "mln":
    case "million":
      return { multiplier: 1_000_000, len };
    case "mlrd":
    case "milliard":
      return { multiplier: 1_000_000_000, len };
    case "so'm":
    case "som":
    case "sum":
    case "uzs":
      return { currency: "UZS", multiplier: 1, len };
    case "$":
    case "usd":
    case "dollar":
    case "dollor":
      return { currency: "USD", multiplier: 1, len };
    case "€":
    case "eur":
    case "evro":
      return { currency: "EUR", multiplier: 1, len };
    case "₽":
    case "rub":
    case "rubl":
      return { currency: "RUB", multiplier: 1, len };
  }
  return { len: 0 };
}

/** "-24-12" → -36; "52+66" → 118; "3*1.7" → 5.1; "1 000" → 1000; "2,5" → 2.5 */
export function evalExpr(expr: string): number | null {
  let e = expr.replace(/−/g, "-").replace(/\$/g, "").replace(/[xх×]/g, "*");
  e = e.replace(/(\d)[ \u00a0](?=\d{3}(?![\d]))/g, "$1");
  e = e.replace(/\s+/g, "");
  if (/[+-]{2}/.test(e)) return null;
  const terms = e.match(/[+-]?\d+(?:[.,]\d+)?(?:\*\d+(?:[.,]\d+)?)*/g);
  if (!terms) return null;
  let sum = 0;
  for (const t of terms) {
    const factors = t.split("*").map((f) => Number(f.replace(",", ".")));
    sum += factors.reduce((a, b) => a * b, 1);
  }
  return Number.isFinite(sum) ? sum : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ParseContext {
  accounts: AccountIndex;
  noteDate: string;
  unit: 1 | 1000;
  today: string;
}

/** Bitta satrni tahlil qilish (sana sarlavhasisiz holat) */
export function parseLine(rawLine: string, ctx: ParseContext): Partial<Entry> {
  const text = normApos(rawLine).trim();
  if (!text) return { status: "empty" };

  const header = parseDateHeader(text, ctx.noteDate, ctx.today);
  if (header === "invalid") return { status: "unclear", reason: "Sana noto'g'ri (kun/oy tekshiring)" };
  if (header) return { status: "header", date: header };

  const am = text.match(RE_ACCOUNT);
  if (!am) {
    // "1189 naqd", "10000 uyda" — raqam oldinda, keyin hisob nomi → qoldiq
    const nm = text.match(new RegExp(`^(${NUM})\\s*(\\$|usd|so'm|som|ming|k)?\\s+(${CODE}(?:\\s+${CODE})?)\\s*$`, "iu"));
    if (nm) {
      const acc0 = findAccountLoose(ctx.accounts, nm[3]);
      if (acc0) return parseLine(`${acc0.code} = ${nm[1]}${nm[2] ? " " + nm[2] : ""}`, ctx);
    }
    const fixes: QuickFix[] = ctx.accounts.list.slice(0, 4).map((a) => ({
      label: a.code + " hisobiga",
      line: /^[+\-−=]/.test(text) ? `${a.code} ${text}` : `${a.code} -${text}`,
    }));
    if (/^[\d+\-−=$]/.test(text)) return { status: "pending", reason: "Hisob qisqartmasi yetishmaydi", fixes };
    return { status: "pending", reason: "Tushunarsiz yozuv — hisob, amal va summa kerak" };
  }
  const codeTok = am[1];
  const acc = findAccount(ctx.accounts, codeTok);
  let rest = text.slice(am[0].length);

  let explicitTarget: Account | undefined;
  let explicit = false;
  let restToText = (j: number) => am[0].length + j; // rest indeksini text indeksiga o'tkazish
  let tm = rest.match(RE_TRANSFER);
  if (!tm) {
    const td = rest.match(RE_TRANSFER_DASH);
    if (td && findAccount(ctx.accounts, td[1])) tm = td;
  }
  if (tm) {
    explicit = true;
    explicitTarget = findAccount(ctx.accounts, tm[1]);
    if (!acc) return { status: "unknown_account", unknownCode: codeTok, reason: `Noma'lum qisqartma: ${codeTok}` };
    if (!explicitTarget)
      return { status: "unknown_account", unknownCode: tm[1], account: acc.code, reason: `Qabul qiluvchi hisob noma'lum: ${tm[1]}` };
    if (explicitTarget.id === acc.id) return { status: "unclear", account: acc.code, reason: "O'tkazma uchun ikki xil hisob bo'lsin" };
    const tailStart = text.length - tm[2].length;
    rest = "-" + tm[2];
    restToText = (j: number) => tailStart + (j - 1);
    if (!tm[2].trim()) return { status: "pending", account: acc.code, counterparty: explicitTarget.code, reason: "O'tkazma summasi yetishmaydi" };
  }

  if (!acc) return { status: "unknown_account", unknownCode: codeTok, reason: `Noma'lum qisqartma: ${codeTok}` };

  const om = rest.match(RE_OP);
  if (!om) {
    const r = rest.trim();
    if (!r) return { status: "pending", account: acc.code, reason: "Amal (+ − =) va summa yetishmaydi" };
    if (/^[+\-−=]\s*$/.test(r)) return { status: "pending", account: acc.code, reason: "Summa yetishmaydi" };
    if (/^[+\-−=]/.test(r)) return { status: "unclear", account: acc.code, reason: "Summa noto'g'ri yozilgan" };
    return { status: "pending", account: acc.code, reason: "Amal belgisi (+, −, =) va summa yetishmaydi", tail: r };
  }
  const op = om[1] === "−" ? "-" : om[1];
  const expr = om[2];
  const exprEnd = restToText(om[0].length - om[3].length);
  let after = om[3];

  const value = evalExpr((op === "=" ? "" : op) + expr);
  if (value === null) return { status: "unclear", account: acc.code, reason: "Summa ishorasini tekshiring" };

  // birlik / valyuta
  const u = readUnit(after);
  after = after.slice(u.len);
  const hasDollarInExpr = expr.includes("$");
  let currency: Currency = u.currency || (hasDollarInExpr ? "USD" : acc.currency);
  const unitExplicit = !!(u.currency || u.multiplier || hasDollarInExpr);
  let multiplier = u.multiplier ?? (currency === "UZS" ? ctx.unit : 1);
  if (u.multiplier && !u.currency && currency !== "UZS" && !hasDollarInExpr) currency = acc.currency;

  // kutilgan qoldiq "= 3447"
  let expected: number | undefined;
  const em = after.match(RE_EXPECTED);
  if (em) {
    const ev = evalExpr(em[1]);
    if (ev === null) return { status: "unclear", account: acc.code, reason: "Kutilgan qoldiq noto'g'ri" };
    let afterExp = em[2];
    const eu = readUnit(afterExp);
    afterExp = afterExp.slice(eu.len);
    const em2 = eu.multiplier ?? multiplier;
    expected = round2(ev * em2);
    after = afterExp;
  }

  // "N -45 = obedga" — "=" dan keyin raqam yo'q: bu izoh
  const eqText = after.match(/^\s*=\s*(?![+\-−]?\s*\$?\d)(.*)$/su);
  if (eqText && expected === undefined) after = " " + eqText[1];

  const amountFull = round2(value * multiplier);
  if (!Number.isFinite(amountFull) || Math.abs(amountFull) > 1e14)
    return { status: "unclear", account: acc.code, reason: "Summa chegaradan tashqarida" };

  // birlik noaniqligi: 1 = 1000 rejimida 1 000 000+ yozilsa — so'mmi yoki ming so'mmi?
  if (!unitExplicit && multiplier === 1000 && Math.abs(value) >= 1_000_000) {
    const mk = (ins: string) => text.slice(0, exprEnd) + ins + text.slice(exprEnd);
    return {
      status: "unclear",
      account: acc.code,
      reason: `Birlik noaniq: ${fmtPlain(Math.abs(value))} ming so'm = ${fmtPlain(Math.abs(value) * 1000)} so'm. Birlikni ko'rsating`,
      fixes: [
        { label: "Bu so'mda", line: mk(" so'm") },
        { label: "Bu ming so'mda", line: mk(" ming") },
      ],
    };
  }

  // Valyuta summasi haddan tashqari katta — ehtimol so'mda yozilgan ("C -3583803 dollar 300")
  if (currency !== "UZS" && Math.abs(value) >= 100_000) {
    const mk = (ins: string) => text.slice(0, exprEnd) + ins + text.slice(exprEnd);
    return {
      status: "unclear",
      account: acc.code,
      reason: `${fmtPlain(Math.abs(value))} ${currency} juda katta — so'mda yozmoqchimidingiz?`,
      fixes: [{ label: "Bu so'mda", line: mk(" so'm") }],
    };
  }

  let tail = after.trim();
  // "N -24 12" (ikkinchi raqam yolg'iz) yoki "= 13400 + 500" — summa tugallanmagan bo'lishi mumkin;
  // "2l kola", "2 ta ASU", "3 kishi" — oddiy izoh
  if (/^[+\-−=]\s*\$?\d/.test(tail) || /^\d+(?:[.,]\d+)?(?:\s*$|\s+[+\-−=]?\s*\$?\d)/.test(tail))
    return { status: "unclear", account: acc.code, reason: "Summa yoki qoldiq yozuvi tugallanmagan: “" + tail.slice(0, 12) + "”" };
  if (/^[+\-−=]/.test(tail)) tail = tail.replace(/^[+\-−=]+\s*/, "");

  const uncertain = tail.includes("?");
  if (uncertain) tail = tail.replace(/\?/g, " ").replace(/\s+/g, " ").trim();

  // tailda faqat hisob kodi/nomi: "N ga", "Uydan", "J", "tbc visa", "uzum kartadan" → o'tkazma ikkinchi tomoni
  let counterparty = explicitTarget?.code;
  if (!counterparty && op !== "=" && tail) {
    const t = normText(tail);
    const words = t.split(" ");
    if (words.length <= 3) {
      let cand = findAccountLoose(ctx.accounts, t);
      if (!cand && words.length > 1 && ["ga", "dan", "ge", "gacha", "da"].includes(words[words.length - 1]))
        cand = findAccountLoose(ctx.accounts, words.slice(0, -1).join(" "));
      if (cand && cand.id !== acc.id) {
        counterparty = cand.code;
        tail = "";
      }
    }
  }

  let type: Entry["type"];
  if (op === "=") type = "snapshot";
  else if (counterparty) {
    const other = findAccount(ctx.accounts, counterparty);
    type = acc.type === "person" || other?.type === "person" ? "debt" : "transfer";
  } else if (acc.type === "person") type = "debt";
  else if (amountFull > 0) type = "income";
  else if (amountFull < 0) type = "expense";
  else return { status: "unclear", account: acc.code, reason: "Summa nol" };

  const { category, comment } = splitTail(tail);

  return {
    status: "ok",
    account: acc.code,
    counterparty,
    explicit,
    amount: amountFull,
    currency,
    multiplier,
    unitExplicit,
    expected,
    type,
    tail,
    category,
    comment,
    uncertain,
  };
}

/** "do'kon, non va sut" → {category:"do'kon", comment:"non va sut"} */
export function splitTail(tail: string): { category: string; comment: string } {
  const t = tail.trim();
  if (!t) return { category: "", comment: "" };
  const i = t.indexOf(",");
  if (i > 0) return { category: t.slice(0, i).trim(), comment: t.slice(i + 1).trim() };
  return { category: t, comment: "" };
}

function fmtPlain(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n).replace(/ /g, " ");
}

/** Butun yozuvni satrma-satr tahlil qilish; sana sarlavhalari keyingi satrlarga tatbiq etiladi */
export function parseNote(note: Note, idx: AccountIndex, todayStr: string): Entry[] {
  const ctx: ParseContext = { accounts: idx, noteDate: note.note_date, unit: note.unit, today: todayStr };
  let date = note.note_date;
  let lastHeader: string | null = null;
  const lines = note.raw.split(/\r?\n/);
  const out: Entry[] = [];
  lines.forEach((raw, i) => {
    let p = parseLine(raw, ctx);
    if (p.status === "header") {
      if (lastHeader && p.date! < lastHeader) {
        // "31.08" dan keyin "01.08" — ehtimol oy xato yozilgan; oldingi sana davom etadi
        p = { status: "unclear", reason: `Sana orqaga ketdi (${raw.trim()} — oldingi sarlavha ${lastHeader.slice(8, 10)}.${lastHeader.slice(5, 7)}). Oy xato bo'lishi mumkin; shu satrdan keyingi yozuvlar oldingi sanada qoladi` };
      } else {
        date = p.date!;
        lastHeader = date;
      }
    }
    out.push({
      key: note.id + ":" + i,
      noteId: note.id,
      line: i,
      raw: raw,
      date,
      ...p,
      status: p.status!,
    } as Entry);
  });
  return out;
}
