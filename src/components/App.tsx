"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Account } from "@/lib/types";
import { createNote, exportData, importData, initApp, migrateGuest, pruneEmptyNotes, setActiveNote, signOut, updateNote, updateSettings, useApp } from "@/lib/store";
import { compute } from "@/lib/compute";
import { humanDate, today } from "@/lib/dates";
import { money, short } from "@/lib/format";
import { flow, totals } from "@/lib/stats";
import { buildInsights } from "@/lib/insights";
import Composer from "./Composer";
import Plans from "./Plans";
import { runAiAnalysis, shouldAutoRun, savedKey } from "@/lib/ai";
import { disableLock, enableLock, isLocked, lockEnabled, lockSupported, unlock } from "@/lib/lock";
import { applyTheme, getTheme, resolved, watchSystemTheme, type Theme } from "@/lib/theme";
import History from "./History";
import Stats from "./Stats";
import Accounts, { AccountDialog } from "./Accounts";
import AiCenter from "./AiCenter";
import AuthDialog from "./Auth";
import { Amount, Badge, Brand, ICONS, Tile, ToastProvider, TypeChip, entryTitle, useToast } from "./ui";

type Tab = "editor" | "history" | "stats" | "accounts" | "ai" | "profile";
type NavTab = Exclude<Tab, "ai">;
const TABS: [NavTab, string][] = [["editor", "Yozuv"], ["accounts", "Hisob"], ["history", "Tarix"], ["stats", "Tahlil"], ["profile", "Profil"]];

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
  const [tab, setTab] = useState<NavTab>("editor");
  const [statsView, setStatsView] = useState<"stats" | "ai">("stats");
  const [accDlg, setAccDlg] = useState<{ open: boolean; editing: Account | null; prefill?: string }>({ open: false, editing: null });
  const [authOpen, setAuthOpen] = useState(false);

  const [focusLine, setFocusLine] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const todayStr = today();

  const [locked, setLocked] = useState(() => typeof window !== "undefined" && isLocked());
  const [theme, setTheme] = useState<Theme>(() => (typeof window !== "undefined" ? getTheme() : "auto"));
  useEffect(() => { applyTheme(theme); }, [theme]);
  const ui = app.settings.ui || { zoom: 100, tile: 44 };
  useEffect(() => {
    document.documentElement.style.setProperty("--tile", ui.tile + "px");
    (document.body.style as CSSStyleDeclaration & { zoom?: string }).zoom = ui.zoom === 100 ? "" : String(ui.zoom / 100);
  }, [ui.zoom, ui.tile]);
  useEffect(() => watchSystemTheme(), []);
  const [lockErr, setLockErr] = useState("");
  useEffect(() => { void initApp(); }, []);
  useEffect(() => { const t = setInterval(pruneEmptyNotes, 60000); return () => clearInterval(t); }, []);
  // Qulf ochilganda darhol biometrik so'rov
  useEffect(() => { if (locked) { void unlock().then(() => setLocked(false)).catch(() => {}); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const computed = useMemo(() => compute(app.notes, app.accounts, app.settings, todayStr), [app.notes, app.accounts, app.settings, todayStr]);
  const note = useMemo(() => app.notes.find((n) => n.id === app.activeNoteId && !n.deleted) || null, [app.notes, app.activeNoteId]);
  const reviewCount = computed.issues.filter((i) => i.kind !== "snapshot_diff" && i.kind !== "expected_mismatch").length;
  const t = totals(computed, app.accounts, "UZS");
  const fToday = flow(computed.ok, { from: todayStr, to: todayStr, label: "" }, "UZS", app.accounts);
  const insights = useMemo(() => buildInsights(computed, app.accounts, app.settings, todayStr), [computed, app.accounts, app.settings, todayStr]);
  const accByCode = useMemo(() => new Map(app.accounts.map((a) => [a.code, a])), [app.accounts]);
  const pendingEntries = useMemo(() => computed.entries.filter((e) => e.status !== "ok"), [computed]);

  // Avtomatik kunlik AI tahlil: ochilganda, oxirgisi 20 soatdan eski bo'lsa, fonda yangilanadi
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current || !app.authReady || locked) return;
    const st = app.settings;
    if (computed.ok.length < 5) return;
    if (!shouldAutoRun(st.autoAi, st.lastAi?.at, st.provider, !!app.user)) return;
    autoRanRef.current = true;
    import("@/lib/report").then(({ buildReport, AI_QUESTION_DEFAULT }) => {
      const report = buildReport(computed, app.accounts, st, todayStr);
      runAiAnalysis(st.provider, AI_QUESTION_DEFAULT, report, savedKey(st.provider))
        .then((ai) => { updateSettings({ lastAi: ai }); toast("Kunlik AI tahlil tayyor — AI bo'limida", { label: "Ochish", fn: () => go("ai") }); })
        .catch(() => { /* jim — qo'lda urinish mumkin */ });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.authReady, app.settings.autoAi, computed, locked]);

  function go(t: Tab) {
    if (t === "ai") { setTab("stats"); setStatsView("ai"); }
    else { setTab(t); if (t === "stats") setStatsView("stats"); }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function openEntry(noteId: string, line: number) { setActiveNote(noteId); setFocusLine(line); go("editor"); setTimeout(() => setFocusLine(null), 500); }
  function insertLines(ls: string[]) {
    const n = note && note.note_date === todayStr ? note : createNote(todayStr);
    const base = n.raw.replace(/\s+$/, "");
    const raw = (base ? base + "\n" : "") + ls.join("\n");
    updateNote(n.id, { raw });
    setActiveNote(n.id);
    setFocusLine(raw.split("\n").length - 1);
    go("editor");
    setTimeout(() => setFocusLine(null), 500);
    toast("Satr yozuvga qo'shildi — summa va hisobni tekshirib qo'ying");
  }

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

  if (locked) {
    return (
      <div className="shell" style={{ maxWidth: 420, paddingTop: 80, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}><Brand /></div>
        <div className="card">
          <h2>Biometrik qulf</h2>
          <p className="hint" style={{ margin: "8px 0 14px" }}>Davom etish uchun qurilma biometriyasi (barmoq izi / yuz) bilan tasdiqlang.</p>
          <button type="button" className="primary" style={{ width: "100%" }} onClick={() => { setLockErr(""); unlock().then(() => setLocked(false)).catch((e) => setLockErr((e as Error).message || "Tasdiqlanmadi — qayta urinib ko'ring")); }}>Ochish</button>
          {lockErr && <p className="hint" style={{ color: "var(--out)", marginTop: 8 }}>{lockErr}</p>}
          <button type="button" className="ghost small" style={{ marginTop: 12 }} onClick={() => { if (confirm("Biometrik qulf o'chirilsinmi? (Ma'lumotlar joyida qoladi; qulf faqat ilovani ochishni himoya qiladi)")) { disableLock(); setLocked(false); } }}>Qulfni o'chirish</button>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="pinhead">
      <header className="topbar">
        <Brand />
        <div className="right">
          {app.cloud ? (
            app.user ? <button type="button" className="small" onClick={() => go("profile")} title={app.user.email}>{(app.user.email || "akkaunt").split("@")[0]}</button>
              : app.authReady ? <button type="button" className="small primary" onClick={() => setAuthOpen(true)}>Kirish</button> : null
          ) : <span className="chip warn" title="NEXT_PUBLIC_SUPABASE_URL sozlanmagan">faqat qurilma</span>}
          <button type="button" className="small" onClick={() => setTheme(resolved(theme) === "dark" ? "light" : "dark")} aria-label="Kunduzgi/tungi rejim" title="Kunduzgi/tungi rejim">
            {resolved(theme) === "dark" ? (
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M4.8 4.8l1.8 1.8M17.4 17.4l1.8 1.8M19.2 4.8l-1.8 1.8M6.6 17.4l-1.8 1.8"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z"/></svg>
            )}
          </button>
          <button type="button" className="small" onClick={() => go("profile")} aria-label="Profil va sozlamalar">⚙</button>
        </div>
      </header>

      <nav className="nav" aria-label="Bo'limlar">
        {TABS.map(([id, name]) => (
          <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => go(id)} aria-current={tab === id ? "page" : undefined}>
            {ICONS[id]}{name}{id === "stats" && reviewCount > 0 ? <span className="dot" title={`${reviewCount} ta tekshirish`} /> : null}
          </button>
        ))}
      </nav>
      </div>

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
          <div className="balstrip" aria-label="Hisoblar qoldig'i">
            <button type="button" className="tot" onClick={() => go("accounts")} title="Tasdiqlangan pul (qarzlarsiz)"><b>{t.known ? short(t.total) : "—"}</b></button>
            {app.accounts.filter((a) => !a.archived && a.type !== "report").map((a) => {
              const b = computed.balances[a.code]?.[a.currency];
              const v = b && (b.known || b.value !== 0) ? short(a.type === "person" ? b.value : b.value, a.currency) : "—";
              return (
                <button key={a.id} type="button" onClick={() => go("accounts")} title={a.name + (b?.known ? "" : " · tasdiqlanmagan")}>
                  <span className="bcode" style={{ ["--t" as string]: a.color }}>{a.code.slice(0, 3)}</span>
                  <b className={a.type === "person" ? (b && b.value >= 0 ? "amt in" : "amt out") : undefined}>{v}{b && !b.known ? "·?" : ""}</b>
                </button>
              );
            })}
          </div>
          <div className="grid">
            <div className="stack">
              <Composer computed={computed} accounts={app.accounts} note={note} onAddAccount={(prefill) => setAccDlg({ open: true, editing: null, prefill })} focusLine={focusLine} />
              <div className="card">
                <div className="row"><h2>So'nggi yozuvlar</h2><button type="button" className="ghost small" onClick={() => go("history")}>Barchasi →</button></div>
                {recent.length === 0 ? <div className="empty"><b>Hali yozuv yo'q</b>Yuqorida bitta satr yozing — masalan, «N = 212» (hozirgi naqd pulingiz).</div> : recent.map((e) => (
                  <div key={e.key} className="entry" onClick={() => openEntry(e.noteId, e.line)}>
                    <Badge acc={e.account ? accByCode.get(e.account) : undefined} code={e.unknownCode || e.account} />
                    <div className="main"><b>{entryTitle(e)}</b><small><TypeChip e={e} /> {humanDate(e.date, false)}{e.status !== "ok" ? " · " + e.reason : ""}</small></div>
                    <div className="right"><Amount e={e} /></div>
                  </div>
                ))}
              </div>
            </div>
            <aside className="stack">
              <div className="card" style={{ background: "linear-gradient(160deg,var(--hero-a),var(--hero-b))", color: "#fff", borderColor: "transparent" }}>
                <small style={{ color: "#aebcc9" }}>Tasdiqlangan pul · {t.known}/{t.all} hisob</small>
                <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -1, marginTop: 4 }}>{t.known ? money(t.total) : "—"}</div>
                <div className="row" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #3b4e60" }}>
                  <span><small style={{ color: "#aebcc9" }}>Uyda</small><br /><b>{short(t.home)}</b></span>
                  <span><small style={{ color: "#aebcc9" }}>Naqd + kartalar</small><br /><b>{short(t.active)}</b></span>
                  <span><small style={{ color: "#aebcc9" }}>Bugun</small><br /><b style={{ color: "#9fe3c0" }}>+{short(fToday.income)}</b> <b style={{ color: "#ffb3a3" }}>−{short(fToday.expense)}</b></span>
                </div>
                {t.known < t.all && <small style={{ color: "#aebcc9", display: "block", marginTop: 8 }}>Qoldig'i noma'lum hisoblar bor — «K = 1085» kabi yozing. Qarzlar va dollar qo'shilmagan.</small>}
              </div>
              {pendingEntries.length > 0 && (
                <div className="card">
                  <div className="row"><h2>Chala satrlar</h2><span className="chip warn">{pendingEntries.length} ta</span></div>
                  <p className="hint">Saqlangan, lekin hisobga qo'shilmagan. Bosib davom ettiring — tahrir dublikat yaratmaydi.</p>
                  {pendingEntries.slice(0, 8).map((e) => (
                    <div key={e.key} className="entry" onClick={() => openEntry(e.noteId, e.line)}><Badge acc={e.account ? accByCode.get(e.account) : undefined} code={e.unknownCode || e.account} /><div className="main"><b className="mono">{e.raw.trim() || "(bo'sh satr)"}</b><small>{humanDate(e.date, false)} · {e.reason}</small></div><TypeChip e={e} /></div>
                  ))}
                  {pendingEntries.length > 8 && <button type="button" className="small" style={{ width: "100%", marginTop: 8 }} onClick={() => go("stats")}>Yana {pendingEntries.length - 8} ta — Tahlil → Tekshirish kerak</button>}
                </div>
              )}
              <Plans settings={app.settings} accounts={app.accounts} onInsert={insertLines} />
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
      {tab === "stats" && (
        <section className="view">
          <div className="segment" style={{ marginBottom: 14, maxWidth: 420 }} role="tablist" aria-label="Tahlil bo'limi">
            <button type="button" role="tab" aria-selected={statsView === "stats"} className={statsView === "stats" ? "on" : ""} onClick={() => setStatsView("stats")}>Statistika</button>
            <button type="button" role="tab" aria-selected={statsView === "ai"} className={statsView === "ai" ? "on" : ""} onClick={() => setStatsView("ai")}>AI maslahat</button>
          </div>
          {statsView === "stats"
            ? <Stats computed={computed} accounts={app.accounts} settings={app.settings} onOpen={openEntry} onGo={go} onAddAccount={(prefill) => setAccDlg({ open: true, editing: null, prefill })} />
            : <AiCenter computed={computed} accounts={app.accounts} settings={app.settings} />}
        </section>
      )}
      {tab === "accounts" && <section className="view"><Accounts computed={computed} accounts={app.accounts} onWriteBalance={writeBalance} onEdit={(a) => setAccDlg({ open: true, editing: a })} onAdd={() => setAccDlg({ open: true, editing: null })} /></section>}

      {tab === "profile" && (
        <section className="view stack">
          <div className="card">
            <div className="row"><h2>Profil</h2>{app.user ? <span className="chip ok">kirilgan</span> : <span className="chip warn">mehmon</span>}</div>
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>Akkaunt</dt><dd>{app.user ? app.user.email : "Mehmon — yozuvlar faqat shu qurilmada"}</dd>
              <dt>Saqlash</dt><dd>{app.cloud ? (app.user ? "Bulut (Supabase) + shu qurilma" : "Faqat shu qurilma. Kirsangiz — bulut va sinxronizatsiya.") : "Bulut sozlanmagan (Vercel env: NEXT_PUBLIC_SUPABASE_URL)"}</dd>
              <dt>Holat</dt><dd>{app.online ? "Internet bor" : "Internet yo'q — navbatda"}{app.lastSync ? ` · oxirgi sinx ${new Date(app.lastSync).toLocaleTimeString("uz-UZ", { timeZone: "Asia/Tashkent" })}` : ""}{app.saveError ? ` · ${app.saveError}` : ""}</dd>
              <dt>Ma'lumot</dt><dd>{app.notes.filter((n) => !n.deleted).length} ta yozuv · {computed.ok.length} ta aniq satr · {app.accounts.length} ta hisob</dd>
              <dt>Vaqt</dt><dd>Asia/Tashkent · {humanDate(todayStr, true, true)}</dd>
            </dl>
            <div className="wrap" style={{ marginTop: 14 }}>
              {app.cloud && !app.user && <button type="button" className="primary" onClick={() => setAuthOpen(true)}>Kirish / ro'yxatdan o'tish</button>}
              {app.user && <button type="button" className="danger" onClick={async () => { await signOut(); toast("Chiqdingiz. Yozuvlar bulutda saqlangan."); }}>Chiqish</button>}
              {lockSupported() && (lockEnabled()
                ? <button type="button" onClick={() => { disableLock(); toast("Biometrik qulf o'chirildi"); }}>🔓 Biometrik qulfni o'chirish</button>
                : <button type="button" onClick={() => { enableLock().then(() => toast("Biometrik qulf yoqildi — keyingi ochilishda so'raladi")).catch((e) => toast((e as Error).message)); }}>🔒 Biometrik qulf yoqish</button>)}
            </div>
          </div>

          <div className="card">
            <h2>Ko'rinish</h2>
            <label className="label">Mavzu</label>
            <div className="segment" role="group" aria-label="Mavzu" style={{ maxWidth: 420 }}>
              {([["auto", "Avto (tizim)"], ["light", "Kunduzgi"], ["dark", "Tungi"]] as const).map(([v, l]) => (
                <button key={v} type="button" className={theme === v ? "on" : ""} onClick={() => setTheme(v)}>{l}</button>
              ))}
            </div>
            <label className="label" htmlFor="uiz">Umumiy masshtab · {ui.zoom}%</label>
            <input id="uiz" type="range" min={80} max={115} step={5} value={ui.zoom} onChange={(e) => updateSettings({ ui: { ...ui, zoom: +e.target.value } })} />
            <label className="label" htmlFor="uit">Hisob kataklari o'lchami · {ui.tile}px</label>
            <input id="uit" type="range" min={34} max={60} step={2} value={ui.tile} onChange={(e) => updateSettings({ ui: { ...ui, tile: +e.target.value } })} />
            <p className="hint" style={{ margin: "8px 0 6px" }}>Oldindan ko'rish — o'zgarish darhol butun ilovaga qo'llanadi:</p>
            <div className="tiles">
              {app.accounts.filter((a) => !a.archived).slice(0, 5).map((a) => <Tile key={a.id} acc={a} />)}
              <Tile acc={app.accounts[0] || { id: "x", code: "N", name: "", type: "cash", currency: "UZS", aliases: [], color: "#d6e4f2", sort: 0, archived: false, updated_at: "" }} small />
            </div>
            <div className="wrap" style={{ marginTop: 10 }}>
              <button type="button" className="small" onClick={() => updateSettings({ ui: { zoom: 100, tile: 44 } })}>Standartga qaytarish</button>
            </div>
          </div>

          <div className="card">
            <h2>Ma'lumotlar</h2>
            <p className="hint" style={{ margin: "8px 0 10px" }}>Xom matn hech qachon avtomatik o'zgartirilmaydi. Eksport faylida barcha yozuvlar, hisoblar va sozlamalar bor — zaxira yoki boshqa qurilmaga ko'chirish uchun.</p>
            <div className="wrap">
              <button type="button" onClick={doExport}>↓ JSON eksport</button>
              <button type="button" onClick={() => fileRef.current?.click()}>↑ JSON import</button>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ""; }} />
            </div>
          </div>
        </section>
      )}

      <AccountDialog open={accDlg.open} onClose={() => setAccDlg({ open: false, editing: null })} editing={accDlg.editing} prefill={accDlg.prefill} accounts={app.accounts} />
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />

    </div>
  );
}
