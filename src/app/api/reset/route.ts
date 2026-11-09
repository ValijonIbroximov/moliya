// Parolni tiklash — AccessPassword (maxsus kalit so'z) bilan.
// AccessPassword Vercel env'da turadi: ACCESS_PASSWORD. U mos kelsa, Supabase'dagi
// akkaunt paroli yangilanadi; akkaunt hali yo'q bo'lsa — yaratiladi.
// Kerakli env: ACCESS_PASSWORD, SUPABASE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

const err = (m: string, status = 400) => NextResponse.json({ ok: false, error: m }, { status });

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    // uzunlik farqida ham vaqt bir xil bo'lishi uchun o'z-o'zi bilan solishtiramiz
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

// Oddiy sekinlashtirish: ketma-ket noto'g'ri urinishlar orasida kutish
let failCount = 0;
let lastFail = 0;

export async function POST(req: Request) {
  let body: { email?: string; accessPassword?: string; newPassword?: string };
  try { body = await req.json(); } catch { return err("So'rov JSON emas"); }

  const need: [string, string | undefined][] = [
    ["ACCESS_PASSWORD", process.env.ACCESS_PASSWORD],
    ["SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY],
    ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL],
  ];
  const miss = need.filter(([, v]) => !v).map(([k]) => k);
  if (miss.length) return err(`Parolni tiklash sozlanmagan — Vercel env'ga qo'shib, Redeploy qiling: ${miss.join(", ")}. SUPABASE_SECRET_KEY — Supabase → API Keys → Secret key (sb_secret_...).`);

  const owner = (process.env.NEXT_PUBLIC_OWNER_EMAIL || "valijonibroximov@gmail.com").toLowerCase();
  const allowed = (process.env.ALLOWED_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(owner)) allowed.push(owner);
  const email = (body.email || owner).trim().toLowerCase();
  if (!allowed.includes(email)) return err("Bu email uchun parolni tiklash yoqilmagan");

  // qo'pol kuch hujumiga qarshi: 5 ta xatodan keyin 60 soniya kutish
  if (failCount >= 5 && Date.now() - lastFail < 60_000) return err("Ko'p noto'g'ri urinish — 1 daqiqadan keyin urinib ko'ring", 429);

  if (!body.accessPassword || !safeEqual(body.accessPassword, process.env.ACCESS_PASSWORD!)) {
    failCount++; lastFail = Date.now();
    return err("AccessPassword noto'g'ri", 403);
  }
  failCount = 0;

  const newPassword = body.newPassword || "";
  if (newPassword.length < 6) return err("Yangi parol kamida 6 belgi bo'lsin");

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return err("Supabase admin: " + error.message + ". SUPABASE_SECRET_KEY to'g'ri (sb_secret_...) ekanini tekshiring.", 502);
  const user = data.users.find((u) => (u.email || "").toLowerCase() === email);

  if (user) {
    const { error: e2 } = await admin.auth.admin.updateUserById(user.id, { password: newPassword });
    if (e2) return err("Parol yangilanmadi: " + e2.message, 502);
    return NextResponse.json({ ok: true, created: false });
  }
  // Akkaunt hali yo'q — yaratamiz (email tasdiqlangan deb)
  const { error: e3 } = await admin.auth.admin.createUser({ email, password: newPassword, email_confirm: true });
  if (e3) return err("Akkaunt yaratilmadi: " + e3.message, 502);
  return NextResponse.json({ ok: true, created: true });
}
