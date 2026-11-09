"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Account, Computed, Entry, Note } from "@/lib/types";
import { createNote, deleteNote, restoreNote, setActiveNote, updateNote, upsertAccount, useApp } from "@/lib/store";
import { indexAccounts, parseNote } from "@/lib/parser";
import { compose, composeTail, decompose, lineAt, replaceLine, splitTailSimple, type LineParts } from "@/lib/lineedit";
import { humanDate, shiftDate, today as todayFn, isValidDate } from "@/lib/dates";
import { short, ledger } from "@/lib/format";
import { Amount, Badge, Tile, TypeChip, useToast } from "./ui";

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
  const [catDraft, setCatDraft] = useState<string | null>(null);
  const [comDraft, setComDraft] = useState<string | null>(null);
  const [amtDraft, setAmtDraft] = useState<string | null>(null);
  const todayStr = todayFn();
  const raw = note?.raw ?? "";
  const live = accounts.filter((a) => !a.archived);
  const idx = useMemo(() => indexAccounts(accounts), [accounts]);
  const isAccount = (code: string) => !!idx.byCode.get(code.replace(/[ʻ‘’`´ʼ]/g, "'").toLowerCase());
  const accByCode = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts]);

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

  /** Tugma/maydondan satrni qayta yig'ish. focus=false — yordamchi maydonlardan yozilganda fokus saqlanadi */
  function applyParts(p: LineParts, focus = true) {
    const line = compose(p);
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

  function pickOp(op: LineParts["op"]) {
    const acc = parts.account || live[0]?.code || "";
    let target = parts.target;
    if (op === "->" && (!target || target === acc)) target = live.find((a) => a.code !== acc)?.code || "";
    const amount = parts.amount.replace(/^[+-]/, "");
    applyParts({ ...parts, account: acc, op, target: op === "->" ? target : "", amount, expected: op === "=" ? "" : parts.expected });
  }

  function setAmount(v: string) {
    setAmtDraft(v);
    const clean = v.replace(/[^\d+\-.,$ ]/g, "");
    const acc = parts.account || live[0]?.code || "";
    applyParts({ ...parts, account: acc, op: parts.op || "-", amount: clean }, false);
  }

  function setUnit(u: string) {
    applyParts({ ...parts, account: parts.account || live[0]?.code || "", op: parts.op || "-", unit: u });
  }

  function setCategory(v: string) {
    setCatDraft(v);
    applyParts({ ...parts, account: parts.account || live[0]?.code || "", tail: composeTail(v, tailSplit.comment) }, false);
  }
  function setComment(v: string) {
    setComDraft(v);
    applyParts({ ...parts, account: parts.account || live[0]?.code || "", tail: composeTail(tailSplit.category, v) }, false);
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

  const catValue = catDraft ?? tailSplit.category;
  const comValue = comDraft ?? tailSplit.comment;
  const amtValue = amtDraft ?? parts.amount;
  const catSugg = useMemo(() => {
    const q = catValue.trim().toLowerCase();
    const list = computed.knownCategories.filter((c) => c !== q && (!q || c.includes(q)));
    list.sort((a, b) => (q && a.startsWith(q) ? 0 : 1) - (q && b.startsWith(q) ? 0 : 1));
    return list.slice(0, 7);
  }, [catValue, computed.knownCategories]);
  const comSugg = useMemo(() => {
    const q = comValue.trim().toLowerCase();
    return computed.comments.filter((c) => c.toLowerCase() !== q && (!q || c.toLowerCase().includes(q))).slice(0, 5);
  }, [comValue, computed.comments]);

  const noteDate = note?.note_date || todayStr;
  // Katta yozuvlarda (ko'p kunlik Keep matni) faqat kursor atrofidagi satrlar ko'rsatiladi — telefonda sekinlashmasin
  const WINDOW = 40;
  const nonEmpty = previewLines.filter((l) => l.status !== "empty");
  const big = nonEmpty.length > 90;
  const visible = big ? nonEmpty.filter((l) => Math.abs(l.line - curLine) <= WINDOW) : nonEmpty;
  const hiddenAbove = big ? nonEmpty.filter((l) => l.line < curLine - WINDOW).length : 0;
  const hiddenBelow = big ? nonEmpty.filter((l) => l.line > curLine + WINDOW).length : 0;
  const notOkCount = nonEmpty.filter((l) => l.status !== "ok" && l.status !== "header").length;
  const dateTiles = Array.from({ length: 6 }, (_, i) => shiftDate(todayStr, -i));
  const unitSel = parts.unit.trim().toLowerCase();
  const unitValue = unitSel === "so'm" || unitSel === "som" || unitSel === "sum" || unitSel === "uzs" ? "som" : unitSel === "ming" || unitSel === "k" ? "ming" : unitSel === "$" || unitSel === "usd" ? "usd" : unitSel === "€" || unitSel === "eur" ? "eur" : "";
  const noteUnit = note?.unit ?? 1000;
  const curIsPerson = curAcc?.type === "person";

  return (
    <div className="card" id="composer">
      <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
        <h2>{note && note.raw.trim() ? (noteDate === todayStr ? "Bugungi yozuv" : "Yozuv · " + humanDate(noteDate, false)) : "Tezkor yozuv"}</h2>
        <SaveStatus />
      </div>

      <label className="label">Sana</label>
      <div className="dates">
        {dateTiles.map((d, i) => (
          <button key={d} type="button" className={d === noteDate ? "on" : ""} onClick={() => setDate(d)} aria-label={humanDate(d)}>
            {+d.slice(8, 10)}<small>{i === 0 ? "bugun" : i === 1 ? "kecha" : d.slice(5, 7) + "-oy"}</small>
          </button>
        ))}
        <input type="date" value={noteDate} onChange={(e) => setDate(e.target.value)} aria-label="Boshqa sana" max={shiftDate(todayStr, 1)} />
      </div>

      <label className="label">Hisob {curAcc ? <span className="muted" style={{ fontWeight: 400 }}>· {curAcc.name}</span> : <span className="muted" style={{ fontWeight: 400 }}>· matndan ham aniqlanadi</span>}</label>
      <div className="tiles">
        {live.map((a) => <Tile key={a.id} acc={a} on={parts.account === a.code} onClick={() => pickAccount(a.code)} />)}
        <button type="button" className="tile add" onClick={() => onAddAccount()} aria-label="Yangi hisob">+</button>
      </div>

      <div style={{ marginTop: 12 }} className="segment" role="group" aria-label="Amal turi">
        {([["-", curIsPerson ? "− Qarz kamaydi" : "− Chiqim", "out"], ["+", curIsPerson ? "+ Qarz oshdi" : "+ Kirim", "in"], ["->", "→ O'tkazma", "move"], ["=", "= Qoldiq", "snap"]] as const).map(([op, label, cls]) => (
          <button key={op} type="button" className={parts.op === op ? `on ${cls}` : ""} onClick={() => pickOp(op)}>{label}</button>
        ))}
      </div>
      {parts.op === "->" && (
        <>
          <label className="label">Qaysi hisobga</label>
          <div className="tiles">
            {live.filter((a) => a.code !== parts.account).map((a) => <Tile key={a.id} acc={a} small on={parts.target === a.code} onClick={() => pickTarget(a.code)} />)}
          </div>
        </>
      )}

      <textarea
        ref={ta}
        className="raw"
        value={raw}
        placeholder={"K -30 taksi\nN -24-12 obed\nC +10000 = 10000 oylik"}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="Aqlli matn"
        style={{ marginTop: 12 }}
        onChange={(e) => { setCatDraft(null); setComDraft(null); setAmtDraft(null); setRaw(e.target.value); setCaret(e.target.selectionStart); }}
        onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
        onKeyUp={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
        onClick={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
      />

      <div className="fields" style={{ marginTop: 10 }}>
        <div>
          <label className="label" htmlFor="amt">Summa {unitValue ? "" : noteUnit === 1000 && (!curAcc || curAcc.currency === "UZS") ? "· ming so'm" : ""}</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input id="amt" inputMode="decimal" autoComplete="off" placeholder="30" value={amtValue} onChange={(e) => setAmount(e.target.value)} onBlur={() => setAmtDraft(null)} />
            <select aria-label="Birlik" value={unitValue} onChange={(e) => setUnit({ "": "", ming: " ming", som: " so'm", usd: "$", eur: " €" }[e.target.value] || "")} style={{ width: 104, padding: "8px 4px", fontSize: 13 }}>
              <option value="">{noteUnit === 1000 ? "ming" : "so'm"}</option>
              <option value="ming">ming</option>
              <option value="som">so'm</option>
              <option value="usd">$</option>
              <option value="eur">€</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="cat">Toifa</label>
          <input id="cat" autoComplete="off" placeholder="taksi, obed…" value={catValue} onChange={(e) => setCategory(e.target.value)} onBlur={() => setCatDraft(null)} />
          <div className="sugg">{catSugg.map((c) => <button key={c} type="button" onClick={() => setCategory(c)}>{c}</button>)}</div>
        </div>
      </div>
      <label className="label" htmlFor="com">Izoh <span className="muted" style={{ fontWeight: 400 }}>· ixtiyoriy</span></label>
      <input id="com" autoComplete="off" placeholder="Kimga, nima uchun…" value={comValue} onChange={(e) => setComment(e.target.value)} onBlur={() => setComDraft(null)} />
      {comSugg.length > 0 && <div className="sugg">{comSugg.map((c) => <button key={c} type="button" onClick={() => setComment(c)}>{c}</button>)}</div>}

      {/* Jonli tahlil */}
      <div className="ledger">
        {big && (
          <p className="hint" style={{ marginBottom: 6 }}>
            {nonEmpty.length} satr · {notOkCount ? <span className="danger">{notOkCount} tasi tekshirishni kutmoqda</span> : "hammasi o'qildi"} · kursor atrofidagi {visible.length} satr ko'rsatilmoqda{hiddenAbove ? ` (yuqorida ${hiddenAbove}` : ""}{hiddenBelow ? `${hiddenAbove ? ", " : " ("}pastda ${hiddenBelow}` : ""}{hiddenAbove || hiddenBelow ? ")" : ""}. Hammasi «Tarix» va «Tahlil → Tekshirish kerak» da.
          </p>
        )}
        {nonEmpty.length === 0 ? (
          <p className="hint">Yozishni boshlang — har satr darhol tahlil qilinadi va saqlanadi. Saqlash tugmasi yo'q.</p>
        ) : (
          visible.map((l) => {
            if (l.status === "header") return <div key={l.key} className="lrow" style={{ gridTemplateColumns: "1fr" }}><small>Sana sarlavhasi → {humanDate(l.date, true, true)}</small></div>;
            const e = enriched.get(l.key) || l;
            const acc = e.account ? accByCode.get(e.account) : undefined;
            const isCur = l.line === curLine;
            return (
              <div key={l.key} className={`lrow${isCur ? " cur" : ""}`} onClick={() => { const r = replaceLine(raw, l.line, lines[l.line] ?? ""); setCaret(r.caret); ta.current?.focus(); ta.current?.setSelectionRange(r.caret, r.caret); }}>
                <Badge acc={acc} code={e.unknownCode || e.account} />
                <div className="main">
                  <b>
                    {e.status === "ok" ? (
                      <>{e.type === "transfer" || e.type === "debt" ? `${e.account} → ${e.counterparty || "?"}` : e.category || "toifasiz"}{e.comment ? <span className="muted" style={{ fontWeight: 400 }}> · {e.comment}</span> : null}</>
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
          <button type="button" className="small" onClick={newNote}>+ Yangi yozuv</button>
          {note && note.raw.trim() && <button type="button" className="small danger" onClick={removeNote}>O'chirish</button>}
          <select aria-label="Yozuv birligi" className="small" value={noteUnit} onChange={(e) => { const n = ensureNote(); updateNote(n.id, { unit: +e.target.value === 1 ? 1 : 1000 }); }} style={{ width: "auto" }}>
            <option value={1000}>1 = 1 000 so'm</option>
            <option value={1}>1 = 1 so'm</option>
          </select>
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
