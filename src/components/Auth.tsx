"use client";
import { useEffect, useState } from "react";
import { signIn, signInGoogle, signUp } from "@/lib/store";
import { Modal, useToast } from "./ui";

export default function AuthDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [trusted, setTrusted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const google = process.env.NEXT_PUBLIC_ENABLE_GOOGLE === "1";
  const remembered = typeof window !== "undefined" ? localStorage.getItem("moliya:lastEmail") || "" : "";
  useEffect(() => {
    if (open) { setEmail(remembered); setPass(""); setErr(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      if (trusted) localStorage.removeItem("moliya:ephemeral");
      else localStorage.setItem("moliya:ephemeral", "1");
      localStorage.setItem("moliya:lastEmail", email.trim());
      if (mode === "in") { await signIn(email.trim(), pass); toast("Xush kelibsiz"); onClose(); }
      else {
        const ok = await signUp(email.trim(), pass);
        if (ok) { toast("Akkaunt yaratildi"); onClose(); }
        else { setErr(""); toast("Emailga tasdiqlash xati yuborildi. Tasdiqlab, keyin kiring."); setMode("in"); }
      }
    } catch (ex) {
      const m = (ex as Error).message || "";
      setErr(m.includes("Invalid login") ? "Email yoki parol noto'g'ri" : m.includes("already registered") ? "Bu email allaqachon ro'yxatdan o'tgan — kiring" : m.includes("Password should") ? "Parol kamida 6 belgi" : m || "Xato");
    } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={mode === "in" ? "Kirish" : "Ro'yxatdan o'tish"}>
      <p className="hint" style={{ marginTop: -6 }}>Kirgandan keyin yozuvlar bulutda (Supabase) saqlanadi va telefon–kompyuter o'rtasida sinxronlanadi. Kirmasangiz ham ilova ishlaydi — faqat shu qurilmada.</p>
      <form onSubmit={submit}>
        {remembered && mode === "in" && email === remembered ? (
          <div className="row" style={{ marginTop: 4 }}>
            <span style={{ fontSize: 14 }}><b>{remembered}</b></span>
            <button type="button" className="ghost small" onClick={() => { setEmail(""); localStorage.removeItem("moliya:lastEmail"); }}>Boshqa akkaunt</button>
          </div>
        ) : (
          <>
            <label className="label" htmlFor="em">Email</label>
            <input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" inputMode="email" />
          </>
        )}
        <label className="label" htmlFor="pw">Parol</label>
        <input id="pw" type="password" value={pass} onChange={(e) => setPass(e.target.value)} required minLength={6} autoFocus={!!remembered} autoComplete={mode === "in" ? "current-password" : "new-password"} />
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
        {mode === "in" ? <>Akkaunt yo'qmi? <a href="#" onClick={(e) => { e.preventDefault(); setMode("up"); }}>Ro'yxatdan o'ting</a></> : <>Akkaunt bormi? <a href="#" onClick={(e) => { e.preventDefault(); setMode("in"); }}>Kiring</a></>}
      </p>
    </Modal>
  );
}
