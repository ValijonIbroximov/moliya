"use client";
// Mavzu: light / dark / auto (tizimga mos). Tanlov localStorage'da, <html data-theme> orqali qo'llanadi.

export type Theme = "auto" | "light" | "dark";
const KEY = "moliya:theme";

export function getTheme(): Theme {
  if (typeof window === "undefined") return "auto";
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "auto";
}

export function resolved(t: Theme): "light" | "dark" {
  if (t !== "auto") return t;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(t: Theme) {
  localStorage.setItem(KEY, t);
  document.documentElement.dataset.theme = resolved(t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved(t) === "dark" ? "#11161b" : "#eef1f3");
}

/** Tizim mavzusi o'zgarganda (auto rejimda) kuzatib borish */
export function watchSystemTheme() {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const fn = () => { if (getTheme() === "auto") document.documentElement.dataset.theme = mq.matches ? "dark" : "light"; };
  mq.addEventListener("change", fn);
  return () => mq.removeEventListener("change", fn);
}

/** Birinchi chizishdan oldin ishga tushadigan skript (yaltirashsiz) */
export const THEME_BOOT = `(function(){try{var t=localStorage.getItem("${KEY}");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){}})();`;
