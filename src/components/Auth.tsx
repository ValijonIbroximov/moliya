"use client";
import { useState } from "react";
import { signIn, signInGoogle, signUp } from "@/lib/store";
import { Modal, useToast } from "./ui";

export default function AuthDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const google = process.env.NEXT_PUBLIC_ENABLE_GOOGLE === "1";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
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
        <label className="label" htmlFor="em">Email</label>
        <input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" inputMode="email" />
        <label className="label" htmlFor="pw">Parol</label>
        <input id="pw" type="password" value={pass} onChange={(e) => setPass(e.target.value)} required minLength={6} autoComplete={mode === "in" ? "current-password" : "new-password"} />
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
