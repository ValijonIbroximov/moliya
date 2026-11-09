"use client";
// AI tahlilni ishga tushirish — AI markazi ham, avtomatik kunlik tahlil ham shu funksiyani chaqiradi

import type { AiResult } from "./types";
import { getAccessToken } from "./store";

export type Provider = "openai" | "anthropic" | "gemini";

export function savedKey(provider: Provider): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("moliya:aikey:" + provider) || "";
}

export async function runAiAnalysis(provider: Provider, question: string, report: unknown, apiKey?: string): Promise<AiResult> {
  const token = await getAccessToken();
  const r = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
    body: JSON.stringify({ provider, question, report, apiKey: apiKey || undefined }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "Noma'lum xato");
  const res = j.result as { xulosa?: string; takliflar?: AiResult["takliflar"]; kamchiliklar?: string; manbalar_qidiruvdan?: { nom: string; url: string }[] };
  return {
    provider: j.provider,
    model: j.model,
    at: j.at,
    xulosa: String(res.xulosa || ""),
    takliflar: Array.isArray(res.takliflar) ? res.takliflar.map((s) => ({ ...s, manbalar: Array.isArray(s.manbalar) ? s.manbalar : [] })) : [],
    kamchiliklar: res.kamchiliklar ? String(res.kamchiliklar) : undefined,
    raw: res.manbalar_qidiruvdan?.length ? JSON.stringify(res.manbalar_qidiruvdan) : undefined,
  };
}

/** Avtomatik tahlil sharti: yoqilgan, kalit/akkaunt bor, oxirgisi 20 soatdan eski */
export function shouldAutoRun(autoAi: boolean | undefined, lastAt: string | undefined, provider: Provider, loggedIn: boolean): boolean {
  if (!autoAi) return false;
  if (!savedKey(provider) && !loggedIn) return false;
  if (!navigator.onLine) return false;
  if (lastAt && Date.now() - new Date(lastAt).getTime() < 20 * 3600 * 1000) return false;
  return true;
}
