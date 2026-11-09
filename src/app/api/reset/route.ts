// Parolni tiklash — kod Telegram'dagi rasmiy "Verification Codes" akkauntidan keladi
// (Telegram Gateway API: https://core.telegram.org/gateway). O'z raqamingizga kod BEPUL.
// Kerakli env: TELEGRAM_GATEWAY_TOKEN, RESET_PHONE, ALLOWED_EMAILS, SUPABASE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;

const GW = "https://gatewayapi.telegram.org/";

const err = (m: string, status = 400) => NextResponse.json({ ok: false, error: m }, { status });

function envMissing(): string | null {
  const need: [string, string | undefined][] = [
    ["TELEGRAM_GATEWAY_TOKEN", process.env.TELEGRAM_GATEWAY_TOKEN],
    ["RESET_PHONE", process.env.RESET_PHONE],
    ["ALLOWED_EMAILS", process.env.ALLOWED_EMAILS],
    ["SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY],
    ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL],
  ];
  const miss = need.filter(([, v]) => !v).map(([k]) => k);
  return miss.length ? miss.join(", ") : null;
}

async function gw(method: string, body: Record<string, unknown>) {
  const r = await fetch(GW + method, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.TELEGRAM_GATEWAY_TOKEN}` },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(`Telegram Gateway: ${j?.error || r.status}`);
  return j.result as { request_id: string; verification_status?: { status: string } };
}

// Qayta yuborishni sekinlashtirish (instansiya ichida — qo'shimcha himoya Telegram tomonida ham bor)
const lastSend = new Map<string, number>();

export async function POST(req: Request) {
  let body: { action?: string; email?: string; request_id?: string; code?: string; newPassword?: string };
  try { body = await req.json(); } catch { return err("So'rov JSON emas"); }

  const miss = envMissing();
  if (miss) return err(`Parolni tiklash sozlanmagan. Vercel env'ga qo'shing: ${miss}. Token — gateway.telegram.org, RESET_PHONE — Telegram raqamingiz (+998...), SUPABASE_SECRET_KEY — Supabase → API Keys → Secret key.`);

  const email = (body.email || "").trim().toLowerCase();
  const allowed = (process.env.ALLOWED_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!email || !allowed.includes(email)) return err("Bu email uchun parolni tiklash yoqilmagan");

  if (body.action === "send") {
    const last = lastSend.get(email) || 0;
    if (Date.now() - last < 60_000) return err("Kod yaqinda yuborilgan — 1 daqiqadan keyin qayta urinib ko'ring", 429);
    try {
      const r = await gw("sendVerificationMessage", {
        phone_number: process.env.RESET_PHONE,
        code_length: 6,
        ttl: 600,
        payload: "moliya-reset",
      });
      lastSend.set(email, Date.now());
      const ph = process.env.RESET_PHONE!;
      return NextResponse.json({ ok: true, request_id: r.request_id, phone_hint: ph.slice(0, 5) + "•••" + ph.slice(-2) });
    } catch (e) {
      return err((e as Error).message, 502);
    }
  }

  if (body.action === "verify") {
    const { request_id, code, newPassword } = body;
    if (!request_id || !code || !/^\d{4,8}$/.test(code)) return err("Kod noto'g'ri formatda");
    if (!newPassword || newPassword.length < 6) return err("Yangi parol kamida 6 belgi bo'lsin");
    try {
      const r = await gw("checkVerificationStatus", { request_id, code });
      const st = r.verification_status?.status;
      if (st !== "code_valid") {
        const map: Record<string, string> = {
          code_invalid: "Kod noto'g'ri",
          code_max_attempts_exceeded: "Urinishlar soni tugadi — kodni qaytadan yuboring",
          expired: "Kod muddati o'tgan — qaytadan yuboring",
        };
        return err(map[st || ""] || "Kod tasdiqlanmadi (" + st + ")");
      }
    } catch (e) {
      return err((e as Error).message, 502);
    }
    // Kod to'g'ri — parolni admin sifatida yangilaymiz
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) return err("Supabase admin: " + error.message, 502);
    const user = data.users.find((u) => (u.email || "").toLowerCase() === email);
    if (!user) return err("Bu email bilan akkaunt topilmadi — avval ro'yxatdan o'ting");
    const { error: e2 } = await admin.auth.admin.updateUserById(user.id, { password: body.newPassword });
    if (e2) return err("Parol yangilanmadi: " + e2.message, 502);
    return NextResponse.json({ ok: true });
  }

  return err("action: send yoki verify bo'lsin");
}
