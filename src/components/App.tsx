"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Account } from "@/lib/types";
import { createNote, exportData, importData, initApp, migrateGuest, pruneEmptyNotes, setActiveNote, signOut, updateNote, useApp } from "@/lib/store";
import { compute } from "@/lib/compute";
import { humanDate, today } from "@/lib/dates";
import { money, short } from "@/lib/format";
import { flow, totals } from "@/lib/stats";
import { buildInsights } from "@/lib/insights";
import Composer from "./Composer";
import History from "./History";
import Stats from "./Stats";
import Accounts, { AccountDialog } from "./Accounts";
import AiCenter from "./AiCenter";
import AuthDialog from "./Auth";
import { Amount, Badge, ICONS, Modal, ToastProvider, TypeChip, useToast } from "./ui";

type Tab = "editor" | "history" | "stats" | "accounts" | "ai";
const TABS: [Tab, string][] = [["editor", "Yozuv"], ["history", "Tarix"], ["stats", "Tahlil"], ["accounts", "Hisoblar"], ["ai", "AI"]];

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

function Shell() {
  const app = useApp();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("editor");
  const [accDlg, setAccDlg] = useState<{ open: boolean; editing: Account | null; prefill?: string }>({ open: false, editing: null });
  const [authOpen, setAuthOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusLine, setFocusLine] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const todayStr = today();

  useEffect(() => { void initApp(); }, []);
  useEffect(() => { const t = setInterval(pruneEmptyNotes, 60000); return () => clearInterval(t); }, []);

  const computed = useMemo(() => compute(app.notes, app.accounts, app.settings, todayStr), [app.notes, app.accounts, app.settings, todayStr]);
  const note = useMemo(() => app.notes.find((n) => n.id === app.activeNoteId && !n.deleted) || null, [app.notes, app.activeNoteId]);
  const reviewCount = computed.issues.filter((i) => i.kind !== "snapshot_diff" && i.kind !== "expected_mismatch").length;
  const t = totals(computed, app.accounts, "UZS");
  const fToday = flow(computed.ok, { from: todayStr, to: todayStr, label: "" }, "UZS", app.accounts);
  const insights = useMemo(() => buildInsights(computed, app.accounts, app.settings, todayStr), [computed, app.accounts, app.settings, todayStr]);
  const accByCode = useMemo(() => new Map(app.accounts.map((a) => [a.code, a])), [app.accounts]);
  const pendingNotes = useMemo(() => {
    const ids = new Set(computed.entries.filter((e) => e.status !== "ok").map((e) => e.noteId));
    return app.notes.filter((n) => ids.has(n.id) && !n.deleted);
  }, [computed, app.notes]);

  function go(t: Tab) { setTab(t); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function openEntry(noteId: string, line: number) { setActiveNote(noteId); setFocusLine(line); go("editor"); setTimeout(() => setFocusLine(null), 500); }
  function writeBalance(code: string) {
    const n = note && note.note_date === todayStr ? note : createNote(todayStr);
    const base = n.raw.replace(/\s+$/, "");
    const raw = base ? base + "\n" + code + " = " : code + " = ";
    updateNote(n.id, { raw });
    setActiveNote(n.id);
    setFocusLine(raw.split("\n").length - 1);
    go("editor");
    setTimeout(() => setFocusLine(null), 500);
  }

  function doExport() {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `moliya-${todayStr}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function doImport(f: File) {
    try {
      const j = JSON.parse(await f.text());
      if (!j || !Array.isArray(j.notes)) throw new Error("format");
      if (!confirm(`${j.notes.length} ta yozuv va ${j.accounts?.length || 0} ta hisob import qilinsinmi? Joriy ma'lumotlar bilan birlashtiriladi (bir xil ID'lar almashtiriladi).`)) return;
      importData({ notes: j.notes, accounts: j.accounts, settings: j.settings });
      toast("Import qilindi");
    } catch { toast("Import qilinmadi — fayl formati noto'g'ri"); }
  }

  const recent = computed.entries.slice(-6).reverse();

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand"><span className="mark"><span>m</span></span>Moliya<span style={{ fontSize: 11, color: "var(--in)", fontWeight: 700, marginLeft: -4 }}>AI</span></div>
        <div className="right">
          {app.cloud ? (
            app.user ? <button type="button" className="small" onClick={() => setSettingsOpen(true)} title={app.user.email}>{(app.user.email || "akkaunt").split("@")[0]}</button>
              : app.authReady ? <button type="button" className="small primary" onClick={() => setAuthOpen(true)}>Kirish</button> : null
          ) : <span className="chip warn" title="NEXT_PUBLIC_SUPABASE_URL sozlanmagan">faqat qurilma</span>}
          <button type="button" className="small" onClick={() => setSettingsOpen(true)} aria-label="Sozlamalar">⚙</button>
        </div>
      </header>

      <nav className="nav" aria-label="Bo'limlar">
        {TABS.map(([id, name]) => (
          <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => go(id)} aria-current={tab === id ? "page" : undefined}>
            {ICONS[id]}{name}{id === "stats" && reviewCount > 0 ? <span className="dot" title={`${reviewCount} ta tekshirish`} /> : null}
          </button>
        ))}
      </nav>

      {app.pendingMigration > 0 && (
        <div className="insight warn" style={{ gridTemplateColumns: "1fr", marginBottom: 12 }}>
          <div>
            <b>Mehmon rejimida {app.pendingMigration} ta yozuv bor</b>
            <p>Ularni shu akkauntga ko'chiraylikmi? Ko'chirilsa, bulutda saqlanadi va boshqa qurilmalarda ko'rinadi.</p>
            <div className="wrap" style={{ marginTop: 8 }}>
              <button type="button" className="small primary" onClick={() => { migrateGuest(true); toast("Yozuvlar akkauntga ko'chirildi"); }}>Ko'chirish</button>
              <button type="button" className="small" onClick={() => migrateGuest(false)}>Kerak emas</button>
            </div>
          </div>
        </div>
      )}

      {tab === "editor" && (
        <section className="view">
          <div className="grid">
            <div className="stack">
              <Composer computed={computed} accounts={app.accounts} note={note} onAddAccount={(prefill) => setAccDlg({ open: true, editing: null, prefill })} focusLine={focusLine} />
              <div className="card">
                <div className="row"><h2>So'nggi yozuvlar</h2><button type="button" className="ghost small" onClick={() => go("history")}>Barchasi →</button></div>
                {recent.length === 0 ? <div className="empty"><b>Hali yozuv yo'q</b>Yuqorida bitta satr yozing — masalan, «N = 212» (hozirgi naqd pulingiz).</div> : recent.map((e) => (
                  <div key={e.key} className="entry" onClick={() => openEntry(e.noteId, e.line)}>
                    <Badge acc={e.account ? accByCode.get(e.account) : undefined} code={e.unknownCode || e.account} />
                    <div className="main"><b>{e.status === "ok" ? (e.type === "transfer" || e.type === "debt" ? `${e.account} → ${e.counterparty}` : e.type === "snapshot" ? "Qoldiq " + e.account : e.category || "toifasiz") : e.raw}</b><small><TypeChip e={e} /> {humanDate(e.date, false)}{e.comment ? " · " + e.comment : ""}{e.status !== "ok" ? " · " + e.reason : ""}</small></div>
                    <div className="right"><Amount e={e} /></div>
                  </div>
                ))}
              </div>
            </div>
            <aside className="stack">
              <div className="card" style={{ background: "linear-gradient(160deg,#16212b,#2a3d4f)", color: "#fff", borderColor: "transparent" }}>
                <small style={{ color: "#aebcc9" }}>Tasdiqlangan pul · {t.known}/{t.all} hisob</small>
                <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -1, marginTop: 4 }}>{t.known ? money(t.total) : "—"}</div>
                <div className="row" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #3b4e60" }}>
                  <span><small style={{ color: "#aebcc9" }}>Uyda</small><br /><b>{short(t.home)}</b></span>
                  <span><small style={{ color: "#aebcc9" }}>Naqd + kartalar</small><br /><b>{short(t.active)}</b></span>
                  <span><small style={{ color: "#aebcc9" }}>Bugun</small><br /><b style={{ color: "#9fe3c0" }}>+{short(fToday.income)}</b> <b style={{ color: "#ffb3a3" }}>−{short(fToday.expense)}</b></span>
                </div>
                {t.known < t.all && <small style={{ color: "#aebcc9", display: "block", marginTop: 8 }}>Qoldig'i noma'lum hisoblar bor — «K = 1085» kabi yozing. Qarzlar va dollar qo'shilmagan.</small>}
              </div>
              {pendingNotes.length > 0 && (
                <div className="card">
                  <div className="row"><h2>Chala yozuvlar</h2><span className="chip warn">{pendingNotes.length} ta</span></div>
                  <p className="hint">Saqlangan, lekin hisobga qo'shilmagan satrlar bor. Bosib davom ettiring.</p>
                  {pendingNotes.slice(0, 5).map((n) => {
                    const first = computed.entries.find((e) => e.noteId === n.id && e.status !== "ok")!;
                    return <div key={n.id} className="entry" onClick={() => openEntry(n.id, first.line)}><Badge acc={first.account ? accByCode.get(first.account) : undefined} code={first.unknownCode || first.account} /><div className="main"><b className="mono">{first.raw || "(bo'sh satr)"}</b><small>{humanDate(n.note_date, false)} · {first.reason}</small></div><TypeChip e={first} /></div>;
                  })}
                </div>
              )}
              <div className="card">
                <div className="row"><h2>Nazorat</h2><button type="button" className="ghost small" onClick={() => go("stats")}>Batafsil →</button></div>
                {insights.length === 0 ? <p className="hint">Bir necha kun yozuv to'plansa, bu yerda aniq xulosalar paydo bo'ladi.</p> : insights.slice(0, 3).map((i) => (
                  <div key={i.id} className={`insight ${i.severity}`}><div className="ic">{i.icon}</div><div><b>{i.title}</b><p>{i.text}</p>{i.action && <div className="act">→ {i.action}</div>}</div></div>
                ))}
              </div>
            </aside>
          </div>
        </section>
      )}

      {tab === "history" && <section className="view"><History computed={computed} accounts={app.accounts} onOpen={openEntry} /></section>}
      {tab === "stats" && <section className="view"><Stats computed={computed} accounts={app.accounts} settings={app.settings} onOpen={openEntry} onGo={go} onAddAccount={(prefill) => setAccDlg({ open: true, editing: null, prefill })} /></section>}
      {tab === "accounts" && <section className="view"><Accounts computed={computed} accounts={app.accounts} onWriteBalance={writeBalance} onEdit={(a) => setAccDlg({ open: true, editing: a })} onAdd={() => setAccDlg({ open: true, editing: null })} /></section>}
      {tab === "ai" && <section className="view"><AiCenter computed={computed} accounts={app.accounts} settings={app.settings} /></section>}

      <AccountDialog open={accDlg.open} onClose={() => setAccDlg({ open: false, editing: null })} editing={accDlg.editing} prefill={accDlg.prefill} accounts={app.accounts} />
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Sozlamalar va ma'lumotlar">
        <dl className="kv">
          <dt>Saqlash</dt><dd>{app.cloud ? (app.user ? `Bulut (Supabase) + shu qurilma · ${app.user.email}` : "Faqat shu qurilma (mehmon). Kirsangiz — bulut va sinxronizatsiya.") : "Faqat shu qurilma — bulut sozlanmagan (Vercel env: NEXT_PUBLIC_SUPABASE_URL)"}</dd>
          <dt>Holat</dt><dd>{app.online ? "Internet bor" : "Internet yo'q — navbatda"}{app.lastSync ? ` · oxirgi sinx ${new Date(app.lastSync).toLocaleTimeString("uz-UZ", { timeZone: "Asia/Tashkent" })}` : ""}{app.saveError ? ` · ${app.saveError}` : ""}</dd>
          <dt>Yozuvlar</dt><dd>{app.notes.filter((n) => !n.deleted).length} ta yozuv · {computed.ok.length} ta aniq satr · {app.accounts.length} ta hisob</dd>
          <dt>Vaqt</dt><dd>Asia/Tashkent · {humanDate(todayStr, true, true)}</dd>
        </dl>
        <div className="wrap" style={{ marginTop: 16 }}>
          <button type="button" onClick={doExport}>↓ JSON eksport</button>
          <button type="button" onClick={() => fileRef.current?.click()}>↑ JSON import</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ""; }} />
          {app.cloud && !app.user && <button type="button" className="primary" onClick={() => { setSettingsOpen(false); setAuthOpen(true); }}>Kirish / ro'yxatdan o'tish</button>}
          {app.user && <button type="button" className="danger" onClick={async () => { await signOut(); setSettingsOpen(false); toast("Chiqdingiz. Yozuvlar bulutda saqlangan."); }}>Chiqish</button>}
        </div>
        <p className="hint" style={{ marginTop: 14 }}>Xom matn hech qachon avtomatik o'zgartirilmaydi. Eksport faylida barcha yozuvlar, hisoblar va sozlamalar bor — boshqa qurilmaga ko'chirish yoki zaxira uchun.</p>
      </Modal>
    </div>
  );
}
