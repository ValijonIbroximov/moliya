// Sana yordamchilari — barcha hisob-kitob Asia/Tashkent bo'yicha

export const TZ = "Asia/Tashkent";

const fmtISO = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Bugungi sana Toshkent vaqti bilan, YYYY-MM-DD */
export function today(now: Date = new Date()): string {
  return fmtISO.format(now);
}

export function isValidDate(s: string | undefined | null): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Sanaga n kun qo'shish (manfiy ham bo'ladi) */
export function shiftDate(date: string, n: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((db - da) / 86400000);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function daysInMonth(ym: string): number {
  const y = +ym.slice(0, 4);
  const m = +ym.slice(5, 7);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthStart(ym: string): string {
  return ym + "-01";
}
export function monthEnd(ym: string): string {
  return ym + "-" + String(daysInMonth(ym)).padStart(2, "0");
}
export function shiftMonth(ym: string, n: number): string {
  const y = +ym.slice(0, 4);
  const m = +ym.slice(5, 7) - 1 + n;
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 7);
}

const MONTHS_UZ = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
];
const WEEKDAYS_UZ = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];

const MONTHS_SHORT_UZ = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
export function monthShortUz(ym: string): string {
  return MONTHS_SHORT_UZ[+ym.slice(5, 7) - 1];
}

export function monthNameUz(ym: string): string {
  return MONTHS_UZ[+ym.slice(5, 7) - 1] + " " + ym.slice(0, 4);
}

/** "7-noyabr, shanba" */
export function humanDate(date: string, withWeekday = true, withYear = false): string {
  if (!isValidDate(date)) return date;
  const d = new Date(date + "T12:00:00Z");
  const day = d.getUTCDate();
  const m = MONTHS_UZ[d.getUTCMonth()];
  const wd = WEEKDAYS_UZ[d.getUTCDay()];
  let s = `${day}-${m}`;
  if (withYear) s += ` ${d.getUTCFullYear()}`;
  if (withWeekday) s += `, ${wd}`;
  return s;
}

/** "07.11" */
export function shortDate(date: string): string {
  return date.slice(8, 10) + "." + date.slice(5, 7);
}

/** Sana sarlavhasini aniqlash: "07.11", "7/11/2026", "2026-11-07", "20.08 dushanba" */
export function parseDateHeader(text: string, baseDate: string, todayStr: string): string | null | "invalid" {
  const t = text.trim();
  let y: number, m: number, d: number;
  let rest = "";
  let hasYear = true;
  let mm = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(.*))?$/);
  if (mm) {
    y = +mm[1]; m = +mm[2]; d = +mm[3]; rest = mm[4] || "";
  } else {
    mm = t.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?(?:\s+(.*))?$/);
    if (!mm) return null;
    d = +mm[1]; m = +mm[2]; rest = mm[4] || "";
    if (mm[3]) y = mm[3].length === 2 ? 2000 + +mm[3] : +mm[3];
    else {
      y = +baseDate.slice(0, 4);
      hasYear = false;
    }
  }
  // sarlavhadan keyingi matnda raqam yoki amal belgisi bo'lmasin ("20.08 dushanba" mumkin)
  if (rest && /[\d+\-=]/.test(rest)) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  if (!isValidDate(iso)) return "invalid";
  // yil ko'rsatilmagan va sana kelajakda (7 kundan ko'p) bo'lsa — o'tgan yil
  if (!hasYear && daysBetween(todayStr, iso) > 7) {
    const prev = `${y - 1}-${pad(m)}-${pad(d)}`;
    return isValidDate(prev) ? prev : iso;
  }
  return iso;
}
