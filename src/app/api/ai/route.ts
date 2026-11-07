// AI tahlil — server tomonida provayderning RASMIY API'si orqali (web-qidiruv bilan).
// Bu obuna (ChatGPT Plus / Claude Pro / Gemini Advanced) emas — API kaliti kerak.
// Kalit manbasi: Vercel env (egasi uchun) yoki so'rov bilan kelgan foydalanuvchi kaliti (brauzerda saqlanadi).

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

type Provider = "openai" | "anthropic" | "gemini";

const MODELS: Record<Provider, string> = {
  openai: process.env.OPENAI_MODEL || "gpt-5.5",
  anthropic: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
  gemini: process.env.GEMINI_MODEL || "gemini-3.6-flash",
};
const ENV_KEYS: Record<Provider, string | undefined> = {
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
};

const SYSTEM = `Sen shaxsiy moliya maslahatchisisan. Foydalanuvchi O'zbekistonda (Toshkent) yashaydi, valyuta so'm (UZS). Javob FAQAT o'zbek tilida (lotin).

QAT'IY QOIDALAR:
1. Faqat berilgan JSON raqamlariga tayan. Ma'lumot to'liq bo'lmasligi mumkin (chala satrlar hisobga kirmagan) — buni hisobga ol va prognozga ta'sirini ayt.
2. Qarz, o'tkazma, qoldiq tafovuti va kirimni aralashtirma. USD va UZS ni kurssiz jamlama.
3. Bank omonat stavkalari, valyuta kursi, uy narxlari — FAQAT internetdan (web search) topilgan RASMIY yoki ishonchli manbalar asosida. Har bir tashqi raqam uchun manba URL va tekshirilgan sana ko'rsat. Qidira olmagan yoki topa olmagan bo'lsang — "tekshirilmadi" deb yoz, o'ylab topma.
4. Keskin da'volarni (masalan, "dollar 10 barobar arzonlashdi") tasdiqsiz signal qilib ko'rsatma.
5. Har taklif: aniq sabab, aniq summa (so'mda), keyingi harakat, shartlar (muddat, minimal summa, yechib olish, soliq), hisoblash farazlari.
6. Statistikani takrorlama — xulosa va harakat ber.

JAVOB FORMATI — faqat quyidagi JSON (boshqa matnsiz, markdown kod blokisiz):
{
 "xulosa": "2-4 gap: umumiy holat, eng muhim 1-2 raqam",
 "takliflar": [
   {"sarlavha": "qisqa", "turi": "omonat|xarajat|kirim|maqsad|kurs|boshqa", "sabab": "nega", "summa": "so'mda aniq summa yoki hisob", "harakat": "aniq keyingi qadam", "shartlar": "muddat, minimal summa, yechib olish, soliq", "farazlar": "hisoblash farazlari", "ishonch": "yuqori|o'rta|past", "manbalar": [{"nom": "", "url": "", "tekshirilgan": "YYYY-MM-DD"}]}
 ],
 "kamchiliklar": "yetishmayotgan yozuvlar prognozga qanday ta'sir qiladi"
}`;

function extractJSON(text: string): Record<string, unknown> | null {
  const t = text.replace(/```json|```/g, "").trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

interface Source { nom: string; url: string }

async function callOpenAI(key: string, user: string): Promise<{ text: string; sources: Source[]; model: string }> {
  const model = MODELS.openai;
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, instructions: SYSTEM, input: user, tools: [{ type: "web_search" }], max_output_tokens: 7000 }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${j?.error?.message || JSON.stringify(j).slice(0, 300)}`);
  let text = "";
  const sources: Source[] = [];
  for (const item of j.output || []) {
    if (item.type !== "message") continue;
    for (const c of item.content || []) {
      if (c.type === "output_text") {
        text += c.text;
        for (const a of c.annotations || []) if (a.type === "url_citation" && a.url) sources.push({ nom: a.title || a.url, url: a.url });
      }
    }
  }
  return { text, sources, model };
}

async function callAnthropic(key: string, user: string): Promise<{ text: string; sources: Source[]; model: string }> {
  const model = MODELS.anthropic;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 7000,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
      tools: [{ type: process.env.ANTHROPIC_WEB_SEARCH_TOOL || "web_search_20250305", name: "web_search", max_uses: 6 }],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${j?.error?.message || JSON.stringify(j).slice(0, 300)}`);
  let text = "";
  const sources: Source[] = [];
  for (const b of j.content || []) {
    if (b.type === "text") {
      text += b.text;
      for (const c of b.citations || []) if (c.url) sources.push({ nom: c.title || c.url, url: c.url });
    }
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const c of b.content) if (c.url) sources.push({ nom: c.title || c.url, url: c.url });
  }
  return { text, sources, model };
}

async function callGemini(key: string, user: string): Promise<{ text: string; sources: Source[]; model: string }> {
  const model = MODELS.gemini;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 1.0, maxOutputTokens: 7000 },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${j?.error?.message || JSON.stringify(j).slice(0, 300)}`);
  const cand = j.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("");
  const sources: Source[] = [];
  for (const ch of cand?.groundingMetadata?.groundingChunks || []) if (ch.web?.uri) sources.push({ nom: ch.web.title || ch.web.uri, url: ch.web.uri });
  return { text, sources, model };
}

async function verifyUser(req: Request): Promise<{ id: string; email?: string } | null> {
  const auth = req.headers.get("authorization") || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!jwt || !url || !anon) return null;
  const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const { data } = await sb.auth.getUser(jwt);
  return data.user ? { id: data.user.id, email: data.user.email } : null;
}

export async function POST(req: Request) {
  let body: { provider?: Provider; question?: string; report?: unknown; apiKey?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "So'rov JSON emas" }, { status: 400 }); }
  const provider = body.provider;
  if (!provider || !(provider in MODELS)) return NextResponse.json({ ok: false, error: "Provayder noto'g'ri" }, { status: 400 });
  if (!body.report) return NextResponse.json({ ok: false, error: "Hisobot yo'q" }, { status: 400 });

  const clientKey = (body.apiKey || "").trim();
  let key = clientKey;
  let keySource: "user" | "server" = "user";
  if (!key) {
    const envKey = ENV_KEYS[provider];
    if (!envKey) {
      return NextResponse.json({ ok: false, error: `Serverda ${provider} uchun API kaliti sozlanmagan (Vercel → Environment Variables → ${provider === "openai" ? "OPENAI_API_KEY" : provider === "anthropic" ? "ANTHROPIC_API_KEY" : "GEMINI_API_KEY"}). Yoki o'z kalitingizni ilovada kiriting.`, needsKey: true }, { status: 400 });
    }
    // egasining kaliti — faqat tizimga kirgan (va ruxsat etilgan) foydalanuvchi uchun
    const user = await verifyUser(req);
    if (!user) return NextResponse.json({ ok: false, error: "Server kalitidan foydalanish uchun tizimga kiring (yoki o'z API kalitingizni kiriting)." }, { status: 401 });
    const allowed = (process.env.ALLOWED_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (allowed.length && !allowed.includes((user.email || "").toLowerCase())) return NextResponse.json({ ok: false, error: "Bu akkaunt uchun server AI kaliti ochilmagan (ALLOWED_EMAILS)." }, { status: 403 });
    key = envKey;
    keySource = "server";
  }

  const userMsg = `${body.question || "Moliyaviy holatimni tahlil qil va aniq takliflar ber."}\n\nBugungi sana: ${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" })}\n\nMA'LUMOTLAR (JSON):\n${JSON.stringify(body.report, null, 1)}`;

  try {
    const fn = provider === "openai" ? callOpenAI : provider === "anthropic" ? callAnthropic : callGemini;
    const { text, sources, model } = await fn(key, userMsg);
    const parsed = extractJSON(text);
    const dedup = new Map<string, Source>();
    for (const s of sources) if (!dedup.has(s.url)) dedup.set(s.url, s);
    const result = parsed
      ? { ...parsed, manbalar_qidiruvdan: [...dedup.values()].slice(0, 20) }
      : { xulosa: text.slice(0, 4000), takliflar: [], kamchiliklar: "Javob JSON formatida kelmadi — matn ko'rsatildi.", manbalar_qidiruvdan: [...dedup.values()].slice(0, 20) };
    return NextResponse.json({ ok: true, provider, model, keySource, at: new Date().toISOString(), result });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
