import type { Currency } from "./types";

const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

/** 1234567.5 → "1 234 567,5" */
export function num(n: number, max2 = true): string {
  return (max2 ? nf : nf0).format(n).replace(/ /g, " ");
}

export const CUR_LABEL: Record<Currency, string> = { UZS: "so'm", USD: "$", EUR: "€", RUB: "₽" };

/** To'liq: "1 234 567 so'm", "50 $" */
export function money(n: number, cur: Currency = "UZS"): string {
  if (cur === "UZS") return num(n, false) + " so'm";
  return num(n) + " " + CUR_LABEL[cur];
}

/** Qisqa: "1,23 mln", "47 ming", "50 $" */
export function short(n: number, cur: Currency = "UZS"): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (cur !== "UZS") return sign + num(a) + " " + CUR_LABEL[cur];
  if (a >= 1e9) return sign + num(Math.round(a / 1e7) / 100) + " mlrd";
  if (a >= 1e6) return sign + num(Math.round(a / 1e4) / 100) + " mln";
  if (a >= 1000) return sign + num(Math.round(a / 100) / 10) + " ming";
  return sign + num(a) + " so'm";
}

/** Ishorali: "+47 ming", "−2 mln" */
export function signed(n: number, cur: Currency = "UZS"): string {
  if (n > 0) return "+" + short(n, cur);
  return short(n, cur);
}

/** Daftar uslubi: so'mni "ming"da aniq ko'rsatish — 1 083 000 → "1 083 ming", 1 083 500 → "1 083,5 ming" */
export function ledger(n: number, cur: Currency = "UZS"): string {
  if (cur !== "UZS") return num(n) + " " + CUR_LABEL[cur];
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1000) return sign + num(Math.round(a / 100) / 10) + " ming";
  return sign + num(a) + " so'm";
}

export function pct(n: number): string {
  return (Math.round(n * 10) / 10).toString().replace(".", ",") + "%";
}
