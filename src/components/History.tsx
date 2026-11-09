"use client";
import { useMemo, useState } from "react";
import type { Account, Computed, Entry, Note } from "@/lib/types";
import { deleteNote, updateNote } from "@/lib/store";
import { humanDate, today } from "@/lib/dates";
import { short } from "@/lib/format";
import { Amount, Badge, Modal, Tile, TypeChip, entryTitle, useToast } from "./ui";

interface Props {
  cat?: string | null;
  onClearCat?: () => void;
  computed: Computed;
  accounts: Account[];
  notes: Note[];
  onOpen: (noteId: string, line: number) => void;
}

const TYPES: [string, string][] = [["all", "Barcha turlar"], ["expense", "Chiqim"], ["income", "Kirim"], ["transfer", "O'tkazma"], ["debt", "Qarz"], ["snapshot", "Qoldiq"]];
const STATES: [string, string][] = [["all", "Barcha holatlar"], ["ok", "Aniq"], ["pending", "Chala"], ["unknown_account", "Noma'lum hisob"], ["unclear", "Noaniq"], ["uncertain", "? belgili"], ["diff", "Tafovutli"], ["nocat", "Toifasiz"]];

export default function History({ computed, accounts, notes, onOpen, cat, onClearCat }: Props) {
  const [q, setQ] = useState("");
  const [acc, setAcc] = useState<string>("");
  const [type, setType] = useState("all");
  const [state, setState] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showRange, setShowRange] = useState(false);
  const [limit, setLimit] = useState(120);
  const [manage, setManage] = useState(false);
  const accByCode = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts]);
  const todayStr = today();

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const out: Entry[] = [];
    for (let i = computed.entries.length - 1; i >= 0; i--) {
      const e = computed.entries[i];
      if (acc && e.account !== acc && e.counterparty !== acc && e.unknownCode !== acc) continue;
      if (type !== "all" && e.type !== type) continue;
      if (from && e.date < from) continue;
      if (to && e.date > to) continue;
      if (cat && !(e.type === "expense" && (e.category || "toifasiz") === cat)) continue;
      if (state !== "all") {
        if (state === "uncertain" && !e.uncertain) continue;
        else if (state === "diff" && !e.diff) continue;
        else if (state === "nocat" && !(e.status === "ok" && (e.type === "income" || e.type === "expense") && !e.category)) continue;
        else if (!["uncertain", "diff", "nocat"].includes(state) && e.status !== state) continue;
      }
      if (ql && ![e.raw, e.category, e.comment, e.reason].join(" ").toLowerCase().includes(ql)) continue;
      out.push(e);
    }
    return out;
  }, [computed, q, acc, type, state, cat, from, to]);

  const groups = useMemo(() => {
    const g: { date: string; items: Entry[]; out: number; inc: number }[] = [];
    for (const e of rows.slice(0, limit)) {
      let last = g[g.length - 1];
      if (!last || last.date !== e.date) { last = { date: e.date, items: [], out: 0, inc: 0 }; g.push(last); }
      last.items.push(e);
      if (e.status === "ok" && !e.disabled && e.currency === "UZS") { if (e.type === "expense") last.out += -e.amount!; if (e.type === "income") last.inc += e.amount!; }
    }
    return g;
  }, [rows, limit]);

  return (
    <div className="card">
      <div className="histhead">
        <div className="row">
          <h2>Tarix</h2>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, minWidth: 0 }}>
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tur" style={{ width: "auto", fontSize: 12.5, padding: "7px 6px" }}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <select value={state} onChange={(e) => setState(e.target.value)} aria-label="Holat" style={{ width: "auto", fontSize: 12.5, padding: "7px 6px" }}>{STATES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <button type="button" className="iconbtn ghost" style={{ width: 36, height: 36, minHeight: 36 }} onClick={() => setManage(true)} aria-label="Tarixni boshqarish" title="Tarixni boshqarish: o'chirish / faolsizlantirish">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 3.5l4 4L8 20l-5 1 1-5z"/></svg>
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8 }}>
          <input placeholder="Toifa, izoh yoki matndan izlash…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Qidirish" style={{ flex: 1, minWidth: 0 }} />
          <button type="button" className={"iconbtn ghost" + (from || to ? " on" : "")} style={{ width: 36, height: 36, minHeight: 36, ...(from || to ? { background: "var(--move-bg)", color: "var(--move)" } : {}) }} onClick={() => setShowRange((v) => !v)} aria-label="Sana oralig'i" title="Sana oralig'i bo'yicha ko'rish">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>
          </button>
          <button type="button" className="iconbtn ghost" style={{ width: 36, height: 36, minHeight: 36, opacity: q ? 1 : .4 }} onClick={() => setQ("")} disabled={!q} aria-label="Qidiruvni tozalash" title="Qidiruv matnini tozalash">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        {showRange && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="Boshlanish sanasi" style={{ width: "auto", fontSize: 13, padding: 8 }} />
            <span className="muted">—</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="Tugash sanasi" style={{ width: "auto", fontSize: 13, padding: 8 }} />
            {(from || to) && <button type="button" className="ghost small" onClick={() => { setFrom(""); setTo(""); }}>✕ tozalash</button>}
          </div>
        )}
        {cat && (
          <div className="wrap" style={{ marginTop: 8 }}>
            <button type="button" className="chip warn" onClick={onClearCat} title="Filtrni olib tashlash">Toifa: {cat} · faqat chiqimlar ✕</button>
          </div>
        )}
        <div className="tiles row1" style={{ marginTop: 10 }}>
          {accounts.filter((a) => !a.archived).sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code)).map((a) => <Tile key={a.id} acc={a} small on={acc === a.code} onClick={() => setAcc(acc === a.code ? "" : a.code)} />)}
        </div>
      </div>
      <p className="hint">{rows.length} ta satr{acc ? ` · ${acc}` : ""}. Satrga bosib tahrirlang — dublikat yaratilmaydi.</p>

      {groups.length === 0 && <div className="empty"><b>Hech narsa topilmadi</b>Filtrni o'zgartiring yoki yangi yozuv kiriting.</div>}
      {groups.map((g) => (
        <div key={g.date}>
          <div className="dayhead">
            <span>{g.date === todayStr ? "Bugun · " : ""}{humanDate(g.date, true, g.date.slice(0, 4) !== todayStr.slice(0, 4))}</span>
            <small>{g.out ? <span className="amt out">−{short(g.out)}</span> : null}{g.out && g.inc ? " · " : ""}{g.inc ? <span className="amt in">+{short(g.inc)}</span> : null}</small>
          </div>
          {g.items.map((e) => {
            const a = e.account ? accByCode.get(e.account) : undefined;
            return (
              <div key={e.key} className="entry" style={e.disabled ? { opacity: .45 } : undefined} onClick={() => onOpen(e.noteId, e.line)} role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === "Enter") onOpen(e.noteId, e.line); }}>
                <Badge acc={a} code={e.unknownCode || e.account} />
                <div className="main">
                  <b>{entryTitle(e)}</b>
                  <small>
                    <TypeChip e={e} />{e.disabled ? <span className="chip">o'chiq</span> : null} {e.status !== "ok" ? e.reason : <span className="mono">{e.raw.length > 48 ? e.raw.slice(0, 48) + "…" : e.raw}</span>}
                    {e.diff ? <span className="danger"> · tafovut {e.diff > 0 ? "+" : ""}{short(e.diff, e.currency)}</span> : null}
                    {e.pairedWith && !e.pairPrimary ? " · juft (hisoblanmaydi)" : ""}
                  </small>
                </div>
                <div className="right">
                  <Amount e={e} />
                  {e.status === "ok" && e.balanceAfter !== undefined && <small style={{ display: "block" }}>= {short(e.balanceAfter, e.currency)}</small>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {rows.length > limit && <button type="button" style={{ width: "100%", marginTop: 12 }} onClick={() => setLimit(limit + 200)}>Yana ko'rsatish ({rows.length - limit})</button>}
      <ManageDialog open={manage} onClose={() => setManage(false)} notes={notes} />
    </div>
  );
}


/** Tarixni boshqarish: muddat bo'yicha o'chirish (eksport bilan) yoki faolsizlantirish/faollashtirish */
function ManageDialog({ open, onClose, notes }: { open: boolean; onClose: () => void; notes: Note[] }) {
  const toast = useToast();
  const live = notes.filter((n) => !n.deleted);
  const dates = live.map((n) => n.note_date).sort();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const f = from || dates[0] || "";
  const t = to || dates[dates.length - 1] || "";
  const sel = live.filter((n) => n.note_date >= f && n.note_date <= t);
  const selOn = sel.filter((n) => !n.disabled);
  const selOff = sel.filter((n) => n.disabled);

  function exportNotes(list: Note[], name: string) {
    const blob = new Blob([JSON.stringify({ version: 1, exported_at: new Date().toISOString(), notes: list }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function doDelete() {
    if (!sel.length) return;
    if (!confirm(`${sel.length} ta yozuv (${f} — ${t}) o'chirilsinmi? Avval nusxasi JSON fayl sifatida yuklab olinadi — keyin import orqali qaytarish mumkin.`)) return;
    exportNotes(sel, `moliya-ochirilgan-${f}_${t}.json`);
    for (const n of sel) deleteNote(n.id);
    toast(`${sel.length} ta yozuv o'chirildi (nusxasi yuklab olindi)`);
    onClose();
  }
  function setDisabled(v: boolean) {
    const list = v ? selOn : selOff;
    if (!list.length) return;
    for (const n of list) updateNote(n.id, { disabled: v });
    toast(v ? `${list.length} ta yozuv faolsizlantirildi — ko'rinadi, lekin hisoblanmaydi` : `${list.length} ta yozuv qayta faollashtirildi`);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Tarixni boshqarish">
      <p className="hint" style={{ marginTop: -6 }}>Muddat yozuv sanasi bo'yicha tanlanadi. Bitta kun uchun ikkala sanani bir xil qiling; butun tarix uchun tegmasdan qoldiring.</p>
      <div className="fields">
        <div><label className="label" htmlFor="mf">Boshlanishi</label><input id="mf" type="date" value={f} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label" htmlFor="mt">Tugashi</label><input id="mt" type="date" value={t} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <p className="hint" style={{ marginTop: 10 }}>Tanlandi: <b>{sel.length} ta yozuv</b>{selOff.length ? ` (shundan ${selOff.length} tasi faolsiz)` : ""}.</p>
      <div className="stack" style={{ gap: 8, marginTop: 10 }}>
        <button type="button" onClick={() => setDisabled(true)} disabled={!selOn.length}>⏸ Faolsizlantirish ({selOn.length}) — ko'rinadi, hisoblanmaydi</button>
        <button type="button" onClick={() => setDisabled(false)} disabled={!selOff.length}>▶ Faollashtirish ({selOff.length})</button>
        <button type="button" className="danger" onClick={doDelete} disabled={!sel.length}>🗑 O'chirish ({sel.length}) — avval JSON nusxasi yuklab olinadi</button>
      </div>
      <p className="hint" style={{ marginTop: 10 }}>O'chirilgan yozuvlarni qaytarish: Profil → JSON import → yuklab olingan fayl.</p>
    </Modal>
  );
}