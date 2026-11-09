"use client";
import { useEffect, useRef, useState } from "react";
import { signIn, signInGoogle, signUp } from "@/lib/store";
import { Modal, useToast } from "./ui";

/**
 * Parol maydoni: ko'rsatish/yashirish tugmasi bilan.
 * Brauzer "parolni saqlaysizmi?" deb so'ramasligi uchun type="password" ishlatilmaydi —
 * oddiy matn maydoniga CSS niqobi (-webkit-text-security) qo'yiladi. Brauzer buni
 * qo'llamasa, xavfsizlik uchun odatiy parol maydoniga qaytadi (u holda so'rov chiqishi mumkin).
 */
export function PwInput({ id, value, onChange, placeholder, minLength, autoFocus, autoComplete = "off" }: {
  id: string; value: string; onChange: (v: string) => void; placeholder?: string; minLength?: number; autoFocus?: boolean; autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  const [maskOk, setMaskOk] = useState(true);
  useEffect(() => {
    try { setMaskOk(CSS.supports("-webkit-text-security", "disc")); } catch { setMaskOk(false); }
  }, []);
  const asText = show || maskOk;
  return (
    <div className="pwwrap">
      <input
        id={id}
        name={"fld-" + id}
        type={asText ? "text" : "password"}
        className={!show && maskOk ? "pwmask" : ""}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        minLength={minLength}
        required
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
        inputMode="text"
      />
      <button type="button" className="eye" onClick={() => setShow(!show)} aria-label={show ? "Parolni yashirish" : "Parolni ko'rsatish"} title={show ? "Yashirish" : "Ko'rsatish"}>
        {show ? (
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7- .4 1-1.4 2.6-3 4M6.6 6.6C4.3 8 2.7 10.3 2 12c1 2.5 5 7 10 7 1.5 0 2.9-.4 4.2-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
        )}
      </button>
    </div>
  );
}

type Mode = "in" | "up" | "reset";

export default function AuthDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [trusted, setTrusted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // reset holati
  const [requestId, setRequestId] = useState("");
  const [phoneHint, setPhoneHint] = useState("");
  const [code, setCode] = useState("");
  const [newPass, setNewPass] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const google = process.env.NEXT_PUBLIC_ENABLE_GOOGLE === "1";
  const remembered = typeof window !== "undefined" ? localStorage.getItem("moliya:lastEmail") || "" : "";

  useEffect(() => {
    if (open) { setMode("in"); setEmail(remembered); setPass(""); setErr(""); setRequestId(""); setCode(""); setNewPass(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  function startCooldown(s: number) {
    setCooldown(s);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => setCooldown((x) => { if (x <= 1 && timer.current) clearInterval(timer.current); return Math.max(0, x - 1); }), 1000);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      if (trusted) localStorage.removeItem("moliya:ephemeral");
      else localStorage.setItem("moliya:ephemeral", "1");
      localStorage.setItem("moliya:lastEmail", email.trim());
      if (mode === "in") { await signIn(email.trim(), pass); toast("Xush kelibsiz"); onClose(); }
      else if (mode === "up") {
        const ok = await signUp(email.trim(), pass);
        if (ok) { toast("Akkaunt yaratildi"); onClose(); }
        else { toast("Emailga tasdiqlash xati yuborildi. Tasdiqlab, keyin kiring."); setMode("in"); }
      }
    } catch (ex) {
      const m = (ex as Error).message || "";
      setErr(m.includes("Invalid login") ? "Email yoki parol noto'g'ri" : m.includes("already registered") ? "Bu email allaqachon ro'yxatdan o'tgan — kiring" : m.includes("Password should") ? "Parol kamida 6 belgi" : m || "Xato");
    } finally { setBusy(false); }
  }

  async function sendCode() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "send", email: email.trim() }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setRequestId(j.request_id);
      setPhoneHint(j.phone_hint || "");
      startCooldown(60);
      toast("Kod yuborildi — Telegram'da «Verification Codes» xabarini oching");
    } catch (ex) { setErr((ex as Error).message); } finally { setBusy(false); }
  }

  async function verifyReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "verify", email: email.trim(), request_id: requestId, code: code.trim(), newPassword: newPass }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast("Parol yangilandi — endi kiring");
      setMode("in"); setPass(""); setRequestId(""); setCode(""); setNewPass("");
    } catch (ex) { setErr((ex as Error).message); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={mode === "in" ? "Kirish" : mode === "up" ? "Ro'yxatdan o'tish" : "Parolni tiklash"}>
      {mode !== "reset" && <p className="hint" style={{ marginTop: -6 }}>Kirgandan keyin yozuvlar bulutda (Supabase) saqlanadi va telefon–kompyuter o'rtasida sinxronlanadi. Kirmasangiz ham ilova ishlaydi — faqat shu qurilmada.</p>}

      {mode !== "reset" ? (
        <>
          <form onSubmit={submit} autoComplete="off">
            {remembered && mode === "in" && email === remembered ? (
              <div className="row" style={{ marginTop: 4 }}>
                <span style={{ fontSize: 14 }}><b>{remembered}</b></span>
                <button type="button" className="ghost small" onClick={() => { setEmail(""); localStorage.removeItem("moliya:lastEmail"); }}>Boshqa akkaunt</button>
              </div>
            ) : (
              <>
                <label className="label" htmlFor="em">Email</label>
                <input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" inputMode="email" />
              </>
            )}
            <label className="label" htmlFor="pw">Parol</label>
            <PwInput id="pw" value={pass} onChange={setPass} minLength={6} autoFocus={!!remembered} />
            <label className="label" style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 500 }}>
              <input type="checkbox" checked={trusted} onChange={(e) => setTrusted(e.target.checked)} style={{ width: "auto" }} />
              Ishonchli qurilma — keyingi safar parol so'ralmasin
            </label>
            <p className="hint" style={{ marginTop: 2 }}>Parol saqlanmaydi — faqat sessiya belgisi qoladi. Belgilamasangiz, brauzer yopilganda sessiya tugaydi. Qo'shimcha himoya uchun Sozlamalar ⚙ da biometrik qulfni yoqing.</p>
            {err && <p className="hint" style={{ color: "var(--out)" }}>{err}</p>}
            <button className="primary" style={{ width: "100%", marginTop: 14 }} disabled={busy}>{busy ? "…" : mode === "in" ? "Kirish" : "Akkaunt yaratish"}</button>
          </form>
          {google && <button type="button" style={{ width: "100%", marginTop: 8 }} onClick={() => signInGoogle().catch((e) => setErr(e.message))}>Google orqali kirish</button>}
          <p className="hint" style={{ textAlign: "center", marginTop: 12 }}>
            {mode === "in" ? (
              <>Akkaunt yo'qmi? <a href="#" onClick={(e) => { e.preventDefault(); setMode("up"); setErr(""); }}>Ro'yxatdan o'ting</a> · <a href="#" onClick={(e) => { e.preventDefault(); setMode("reset"); setErr(""); }}>Parolni unutdingizmi?</a></>
            ) : (
              <>Akkaunt bormi? <a href="#" onClick={(e) => { e.preventDefault(); setMode("in"); setErr(""); }}>Kiring</a></>
            )}
          </p>
        </>
      ) : (
        <>
          <p className="hint" style={{ marginTop: -6 }}>Tasdiqlash kodi Telegram'dagi rasmiy <b>Verification Codes</b> akkauntidan {phoneHint ? <b>{phoneHint}</b> : "ro'yxatdagi raqamingizga"} keladi. SMS emas — Telegram xabari.</p>
          <label className="label" htmlFor="rem">Email</label>
          <input id="rem" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" inputMode="email" />
          <div className="wrap" style={{ marginTop: 10 }}>
            <button type="button" onClick={sendCode} disabled={busy || cooldown > 0 || !email.includes("@")}>{cooldown > 0 ? `Qayta yuborish · ${cooldown} s` : requestId ? "Kodni qayta yuborish" : "Telegram'ga kod yuborish"}</button>
          </div>
          {requestId && (
            <form onSubmit={verifyReset} autoComplete="off" style={{ marginTop: 6 }}>
              <label className="label" htmlFor="code">Telegram'dan kelgan kod</label>
              <input id="code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 xonali kod" maxLength={8} required style={{ letterSpacing: 4, fontSize: 18, fontWeight: 700 }} />
              <label className="label" htmlFor="npw">Yangi parol</label>
              <PwInput id="npw" value={newPass} onChange={setNewPass} minLength={6} placeholder="Kamida 6 belgi" />
              {err && <p className="hint" style={{ color: "var(--out)" }}>{err}</p>}
              <button className="primary" style={{ width: "100%", marginTop: 14 }} disabled={busy}>{busy ? "…" : "Parolni yangilash"}</button>
            </form>
          )}
          {!requestId && err && <p className="hint" style={{ color: "var(--out)" }}>{err}</p>}
          <p className="hint" style={{ textAlign: "center", marginTop: 12 }}><a href="#" onClick={(e) => { e.preventDefault(); setMode("in"); setErr(""); }}>← Kirishga qaytish</a></p>
        </>
      )}
    </Modal>
  );
}
