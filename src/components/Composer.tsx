"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Account, Computed, Entry, Note } from "@/lib/types";
import { createNote, deleteNote, restoreNote, setActiveNote, updateNote, upsertAccount, useApp } from "@/lib/store";
import { indexAccounts, parseNote } from "@/lib/parser";
import { compose, composeTail, decompose, lineAt, replaceLine, splitTailSimple, type LineParts } from "@/lib/lineedit";
import { humanDate, shiftDate, today as todayFn, isValidDate } from "@/lib/dates";
import { short, ledger } from "@/lib/format";
import { Amount, Badge, Tile, TypeChip, entryTitle, useToast } from "./ui";

interface Props {
  computed: Computed;
  accounts: Account[];
  note: Note | null;
  onAddAccount: (prefill?: string) => void;
  focusLine?: number | null;
}

export default function Composer({ computed, accounts, note, onAddAccount, focusLine }: Props) {
  const toast = useToast();
  const ta = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const todayStr = todayFn();
  const raw = note?.raw ?? "";
  const live = accounts.filter((a) => !a.archived).sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));
  const idx = useMemo(() => indexAccounts(accounts), [accounts]);
  const isAccount = (code: string) => !!idx.byCode.get(code.replace(/[ʻ‘’`´ʼ]/g, "'").toLowerCase());
  const accByCode = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts]);

  const noteUnitRef = useRef<1 | 1000>(note?.unit ?? 1000);
  noteUnitRef.current = note?.unit ?? 1000;
  const { lines, index: curLine } = lineAt(raw, caret);
  const parts = decompose(lines[curLine] || "", isAccount);
  const tailSplit = splitTailSimple(parts.tail);
  const curAcc = parts.account ? idx.byCode.get(parts.account.toLowerCase().replace(/[ʻ‘’`´ʼ]/g, "'")) : undefined;

  // faol yozuv satrlari (sarlavhalar bilan) + compute boyitmalari
  const previewLines = useMemo(() => (note ? parseNote(note, idx, todayStr) : []), [note, idx, todayStr]);
  const enriched = useMemo(() => {
    const m = new Map<string, Entry>();
    if (note) for (const e of computed.entries) if (e.noteId === note.id) m.set(e.key, e);
    return m;
  }, [computed, note]);

  useEffect(() => {
    if (focusLine == null || !ta.current) return;
    const ls = raw.split("\n");
    let pos = 0;
    for (let i = 0; i < Math.min(focusLine, ls.length - 1); i++) pos += ls[i].length + 1;
    pos += (ls[focusLine] || "").length;
    ta.current.focus();
    ta.current.setSelectionRange(pos, pos);
    setCaret(pos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusLine, note?.id]);

  function ensureNote(): Note {
    return note || createNote(todayStr);
  }

  function setRaw(text: string, newCaret?: number, focus = true) {
    const n = ensureNote();
    updateNote(n.id, { raw: text });
    if (newCaret !== undefined) {
      setCaret(newCaret);
      if (focus) requestAnimationFrame(() => { const el = ta.current; if (el) { el.focus(); el.setSelectionRange(newCaret, newCaret); } });
      else requestAnimationFrame(() => { const el = ta.current; if (el && document.activeElement !== el) el.setSelectionRange(newCaret, newCaret); });
    }
  }

  /** Tugma/maydondan satrni qayta yig'ish. focus=false — yordamchi maydonlardan yozilganda fokus saqlanadi.
      Maxsus satr (Jami, sana sarlavhasi) ustida bo'lsa — buzmasdan yangi satr ochiladi. */
  function applyParts(p: LineParts, focus = true) {
    const line = compose(p);
    if (parts.special && (lines[curLine] || "").trim()) {
      const base = (raw || "").replace(/\s+$/, "");
      const nr = base + "\n" + line;
      setRaw(nr, nr.length, focus);
      return;
    }
    const r = replaceLine(raw || "", curLine, line);
    setRaw(r.text, r.caret, focus);
  }

  function pickAccount(code: string) {
    if (!parts.account && !parts.op && !parts.amount && !parts.tail) {
      const r = replaceLine(raw || "", curLine, code + " ");
      setRaw(r.text, r.caret);
      return;
    }
    if (!parts.account) {
      // satr "-30 taksi" kabi — oldiga kod qo'shamiz
      const t = lines[curLine] || "";
      const line = /^\s*[+\-−=]/.test(t) ? `${code} ${t.trim()}` : `${code} -${t.trim()}`;
      const r = replaceLine(raw || "", curLine, line);
      setRaw(r.text, r.caret);
      return;
    }
    if (parts.op === "->" && parts.account === code) return;
    applyParts({ ...parts, account: code, target: parts.target === code ? "" : parts.target });
  }

  function pickTarget(code: string) {
    applyParts({ ...parts, op: "->", target: code, account: parts.account || live.find((a) => a.code !== code)?.code || "" });
  }

  const isNoteLine = /^\s*(?:#|\/\/)/.test(lines[curLine] || "");
  /** Joriy satrni eslatma satriga aylantirish / qaytarish */
  function toggleNoteLine() {
    const cur = lines[curLine] || "";
    const nl = isNoteLine ? cur.replace(/^(\s*)(?:#|\/\/)\s?/, "$1") : "# " + cur;
    const r = replaceLine(raw || "", curLine, nl);
    setRaw(r.text, r.caret);
  }

  function pickOp(op: LineParts["op"]) {
    const acc = parts.account || live[0]?.code || "";
    let target = parts.target;
    if (op === "->" && (!target || target === acc)) target = live.find((a) => a.code !== acc)?.code || "";
    const amount = parts.amount.replace(/^[+-]/, "");
    applyParts({ ...parts, account: acc, op, target: op === "->" ? target : "", amount, expected: op === "=" ? "" : parts.expected });
  }






  function setDate(d: string) {
    if (!isValidDate(d)) return;
    const n = ensureNote();
    updateNote(n.id, { note_date: d });
  }

  function newNote() {
    if (note && !note.raw.trim()) { updateNote(note.id, { note_date: todayStr }); ta.current?.focus(); return; }
    createNote(todayStr);
    setCaret(0);
    requestAnimationFrame(() => ta.current?.focus());
  }

  function removeNote() {
    if (!note) return;
    const id = note.id;
    deleteNote(id);
    toast("Yozuv o'chirildi", { label: "Qaytarish", fn: () => { restoreNote(id); setActiveNote(id); } });
  }

  function applyFix(line: number, text: string) {
    const r = replaceLine(raw, line, text);
    setRaw(r.text, r.caret);
  }

  function linkUnknown(code: string, acc: Account) {
    upsertAccount({ ...acc, aliases: [...new Set([...(acc.aliases || []), code])] });
    toast(`"${code}" endi ${acc.code} hisobiga tegishli`);
  }

  const noteDate = note?.note_date || todayStr;
  // Tez-tez takrorlanadigan xarajatlar (hisob+summa+toifa kamida 3 marta) — bir bosishda satr
  const quickLines = useMemo(() => {
    const m = new Map<string, { acc: string; amount: number; cat: string; cur: string; count: number }>();
    for (const e of computed.ok) {
      if (e.type !== "expense" || !e.category || e.pairedWith) continue;
      const k = `${e.account}|${e.amount}|${e.category}|${e.currency}`;
      const r = m.get(k) || { acc: e.account!, amount: e.amount!, cat: e.category, cur: e.currency!, count: 0 };
      r.count++; m.set(k, r);
    }
    return [...m.values()].filter((r) => r.count >= 3).sort((a, b) => b.count - a.count).slice(0, 6).map((r) => {
      const a = Math.abs(r.amount);
      const v = r.cur === "UZS" ? (noteUnitRef.current === 1000 ? String(Math.round((a / 1000) * 1000) / 1000) : String(a) + " so'm") : String(a) + "$";
      return { line: `${r.acc} -${v} ${r.cat}`, count: r.count };
    });
  }, [computed]);
  // Katta yozuvlarda (ko'p kunlik Keep matni) faqat kursor atrofidagi satrlar ko'rsatiladi — telefonda sekinlashmasin
  const WINDOW = 40;
  const nonEmpty = previewLines.filter((l) => l.status !== "empty");
  const big = nonEmpty.length > 90;
  const visible = big ? nonEmpty.filter((l) => Math.abs(l.line - curLine) <= WINDOW) : nonEmpty;
  const hiddenAbove = big ? nonEmpty.filter((l) => l.line < curLine - WINDOW).length : 0;
  const hiddenBelow = big ? nonEmpty.filter((l) => l.line > curLine + WINDOW).length : 0;
  const notOkCount = nonEmpty.filter((l) => l.status !== "ok" && l.status !== "header").length;
  const noteUnit = note?.unit ?? 1000;
  const curIsPerson = curAcc?.type === "person";

  return (
    <div className="card" id="composer">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {note && note.raw.trim() ? (noteDate === todayStr ? "Bugungi yozuv" : "Yozuv · " + humanDate(noteDate, false)) : "Tezkor yozuv"}
            {noteDate !== todayStr && <span className="chip warn" title="Operatsiyalar shu sanaga yoziladi; sana sarlavhasi bo'lgan satrlar bundan mustasno">eski sana</span>}
          </h2>
          <SaveStatus />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <input type="date" value={noteDate} onChange={(e) => setDate(e.target.value)} aria-label="Sana" title="Sana" max={shiftDate(todayStr, 1)} style={{ width: "auto", height: 44, padding: 8, fontSize: 13 }} />
          <button type="button" className="iconbtn primary" onClick={newNote} aria-label="Yangi yozuv" title="Yangi yozuv">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
      </div>

      <div className="tiles row1" style={{ marginTop: 14 }}>
        {live.map((a) => <Tile key={a.id} acc={a} on={parts.account === a.code} onClick={() => pickAccount(a.code)} />)}
        <button type="button" className="tile add" onClick={() => onAddAccount()} aria-label="Yangi hisob">+</button>
      </div>

      <div style={{ marginTop: 12 }} className="segment ops" role="group" aria-label="Amal turi">
        {([
          ["-", curIsPerson ? "Qarz kamaydi" : "Chiqim", "out", <svg key="o" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>],
          ["+", curIsPerson ? "Qarz oshdi" : "Kirim", "in", <svg key="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>],
          ["->", "O'tkazma", "move", <svg key="m" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>],
          ["=", "Qoldiq", "snap", <svg key="s" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 9.5h12M6 14.5h12"/></svg>],
        ] as const).map(([op, label, cls, icon]) => (
          <button key={op} type="button" className={parts.op === op ? `on ${cls}` : ""} onClick={() => pickOp(op)}>{icon}{label}</button>
        ))}
        <button type="button" className={isNoteLine ? "on snap" : ""} onClick={toggleNoteLine} title="Hisobga kirmaydigan izoh satri (# bilan boshlanadi)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 3.5l4 4L8 20l-5 1 1-5z"/></svg>Eslatma
        </button>
      </div>
      {parts.op === "->" && (
        <>
          <label className="label">Qaysi hisobga</label>
          <div className="tiles row1">
            {live.filter((a) => a.code !== parts.account).map((a) => <Tile key={a.id} acc={a} small on={parts.target === a.code} onClick={() => pickTarget(a.code)} />)}
          </div>
        </>
      )}

      <textarea
        ref={ta}
        className="raw"
        value={raw}
        placeholder={"K -30 taksi\nN -24-12 obed"}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="Aqlli matn"
        style={{ marginTop: 12 }}
        onChange={(e) => { setRaw(e.target.value); setCaret(e.target.selectionStart); }}
        onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
        onKeyUp={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
        onClick={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
      />

      {quickLines.length > 0 && (
        <div className="sugg" style={{ marginTop: 6 }} aria-label="Tez-tez ishlatiladigan">
          <small style={{ alignSelf: "center" }}>Tez-tez:</small>
          {quickLines.map((q) => (
            <button key={q.line} type="button" title={`${q.count} marta ishlatilgan`} onClick={() => {
              const cur = (lines[curLine] || "").trim();
              if (!cur) { const r = replaceLine(raw || "", curLine, q.line); setRaw(r.text, r.caret, false); }
              else { const base = (raw || "").replace(/\s+$/, ""); const nr = base + "\n" + q.line; setRaw(nr, nr.length, false); }
            }}>{q.line} <span className="muted">×{q.count}</span></button>
          ))}
        </div>
      )}

      {/* Jonli tahlil */}
      <div className="ledger">
        {big && (
          <p className="hint" style={{ marginBottom: 6 }}>
            {nonEmpty.length} satr · {notOkCount ? <span className="danger">{notOkCount} tasi tekshirishni kutmoqda</span> : "hammasi o'qildi"} · kursor atrofidagi {visible.length} satr ko'rsatilmoqda{hiddenAbove ? ` (yuqorida ${hiddenAbove}` : ""}{hiddenBelow ? `${hiddenAbove ? ", " : " ("}pastda ${hiddenBelow}` : ""}{hiddenAbove || hiddenBelow ? ")" : ""}. Hammasi «Tarix» va «Tahlil → Tekshirish kerak» da.
          </p>
        )}
        {nonEmpty.length === 0 ? null : (
          visible.map((l) => {
            if (l.status === "header") return <div key={l.key} className="lrow" style={{ gridTemplateColumns: "1fr" }}><small>Sana sarlavhasi → {humanDate(l.date, true, true)}</small></div>;
            if (l.status === "note") return <div key={l.key} className={`lrow${l.line === curLine ? " cur" : ""}`} style={{ gridTemplateColumns: "1fr" }}><small style={{ fontStyle: "italic" }}>✎ {l.comment || "(bo'sh eslatma)"} <span className="chip snap">eslatma · hisobga kirmaydi</span></small></div>;
            const e = enriched.get(l.key) || l;
            const acc = e.account ? accByCode.get(e.account) : undefined;
            const isCur = l.line === curLine;
            return (
              <div key={l.key} className={`lrow${isCur ? " cur" : ""}`} onClick={() => { const r = replaceLine(raw, l.line, lines[l.line] ?? ""); setCaret(r.caret); ta.current?.focus(); ta.current?.setSelectionRange(r.caret, r.caret); }}>
                <Badge acc={acc} code={e.unknownCode || e.account} />
                <div className="main">
                  <b>
                    {e.status === "ok" ? (
                      entryTitle(e)
                    ) : (
                      <span className={e.status === "pending" ? "" : "danger"}>{e.reason}</span>
                    )}
                  </b>
                  <small>
                    <TypeChip e={e} />
                    {e.status === "ok" && e.diff ? <span className="danger"> tafovut {e.diff > 0 ? "+" : ""}{ledger(e.diff, e.currency)}</span> : null}
                    {e.status === "ok" && e.pairedWith ? " · bir marta hisoblanadi" : ""}
                    {l.date !== noteDate ? " · " + humanDate(l.date, false) : ""}
                    {e.status !== "ok" ? " · hisobga qo'shilmaydi" : ""}
                  </small>
                  {e.fixes && e.fixes.length > 0 && (
                    <div className="fixes">{e.fixes.map((f) => <button key={f.label} type="button" onClick={(ev) => { ev.stopPropagation(); applyFix(l.line, f.line); }}>{f.label}</button>)}</div>
                  )}
                  {e.status === "unknown_account" && e.unknownCode && (
                    <div className="fixes" onClick={(ev) => ev.stopPropagation()}>
                      <button type="button" onClick={() => onAddAccount(e.unknownCode)}>+ "{e.unknownCode}" hisobini yaratish</button>
                      <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>yoki bog'lash:</span>
                      {live.slice(0, 7).map((a) => <button key={a.id} type="button" onClick={() => linkUnknown(e.unknownCode!, a)}>{a.code}</button>)}
                    </div>
                  )}
                </div>
                <div className="right">
                  <Amount e={e} />
                  {e.status === "ok" && e.balanceAfter !== undefined && e.type !== "snapshot" && (
                    <span className="bal" title="Shu satrdan keyingi qoldiq">= {ledger(e.balanceAfter, e.currency)}{e.expected !== undefined && !e.diff ? <span style={{ color: "var(--in)" }}> ✓</span> : null}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
        <div className="wrap">
          {note && note.raw.trim() && <button type="button" className="small danger" onClick={removeNote}>O'chirish</button>}
          {noteUnit === 1 && <span className="chip" title="Bu yozuvda 1 = 1 so'm (Profil → Ma'lumotlar'da o'zgartiriladi)">1 = 1 so'm</span>}
        </div>
        {noteDate !== todayStr && note?.raw.trim() ? <small>Bu yozuv {humanDate(noteDate, false)} uchun. Bugungi uchun «+ Yangi yozuv».</small> : <small>Chala satr ham saqlanadi.</small>}
      </div>

      <details className="help">
        <summary>Qanday yozsam bo'ladi?</summary>
        <p style={{ marginTop: 8 }}>
          <code>K -2 samokat</code> — chiqim · <code>C +10000 oylik</code> — kirim · <code>N -24-12 obed</code> — jami 36<br />
          <code>N -47 = 3447 do'kon</code> — «= 3447» yozilgan qoldiq, hisob bilan solishtiriladi<br />
          <code>N = 212</code> — haqiqiy qoldiq (kirim emas; farq «tafovut» sifatida ko'rsatiladi)<br />
          <code>C {"->"} K 100</code> yoki <code>C-K 100</code> — o'tkazma · <code>Uy -1000 N ga</code> / <code>N +1000 Uydan</code> — ikkala tomon yozilsa ham bir marta hisoblanadi<br />
          <code>J +50</code> — Javohirning qarzi oshdi · <code>K +2100 J</code> — J qaytardi (K ga tushdi) · <code>J = -18</code> — siz qarzdorsiz<br />
          <code>07.11</code> — sana sarlavhasi, keyingi satrlarga qo'llanadi (bir necha kunlik matnni bitta qo'yish mumkin)<br />
          Summalar odatda ming so'mda: <code>-30</code> = 30 000. To'liq so'm: <code>-30000 so'm</code>, dollar: <code>-50$</code>, kasr: <code>-2.5</code>. Birlik noaniq bo'lsa (1 000 000+) savol beriladi, taxmin qilinmaydi.<br />
          Toifa va izoh: <code>N -38 do'kon, non va sut</code> (vergul bilan). <code>?</code> belgisi — «tekshirish kerak».
        </p>
      </details>
    </div>
  );
}

function SaveStatus() {
  const app = useApp();
  const t = app.lastSync ? new Date(app.lastSync).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" }) : "";
  const map: Record<string, string> = {
    idle: "Tayyor",
    saving: "Saqlanmoqda…",
    local: "Saqlandi · faqat shu qurilma",
    cloud: "Saqlandi · bulut" + (t ? " " + t : ""),
    offline: "Internet yo'q · qurilmada saqlandi, keyin yuboriladi",
    error: "Bulutga saqlanmadi — qurilmada turibdi",
    guest: "Mehmon · faqat shu qurilmada saqlanadi",
  };
  return <span className={`status ${app.saveStatus}`} role="status" title={app.saveError || ""}><i />{map[app.saveStatus]}</span>;
}
