"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Account, Currency, Entry, EntryType } from "@/lib/types";
import { short, ledger } from "@/lib/format";

export const TYPE_LABEL: Record<EntryType, string> = { income: "Kirim", expense: "Chiqim", transfer: "O'tkazma", snapshot: "Qoldiq", debt: "Qarz", total: "Jami tekshiruv" };
export const TYPE_CLS: Record<EntryType, string> = { income: "in", expense: "out", transfer: "move", snapshot: "snap", debt: "move", total: "snap" };
export const ACC_TYPE_LABEL: Record<Account["type"], string> = { cash: "naqd", card: "karta", home: "uy", person: "shaxs", other: "boshqa", report: "qayd" };

export function Badge({ acc, code }: { acc?: Account; code?: string }) {
  if (!acc && code === "Σ") return <span className="badge" style={{ ["--t" as string]: "#ebe8f8" }} title="Jami tekshiruv">Σ<small>jami</small></span>;
  if (!acc) return <span className="badge unk" title="Noma'lum hisob">{(code || "?").slice(0, 4)}<small>?</small></span>;
  return (
    <span className="badge" style={{ ["--t" as string]: acc.color }} title={`${acc.name} · ${acc.currency}`}>
      {acc.code.slice(0, 4)}
      <small>{acc.currency === "UZS" ? ACC_TYPE_LABEL[acc.type] : acc.currency}</small>
    </span>
  );
}

export function Tile({ acc, on, onClick, small }: { acc: Account; on?: boolean; onClick?: () => void; small?: boolean }) {
  return (
    <button type="button" className={`tile${on ? " on" : ""}${small ? " sm" : ""}`} style={{ ["--t" as string]: acc.color }} onClick={onClick} title={`${acc.name} · ${acc.currency}`} aria-pressed={on}>
      {acc.code.slice(0, 4)}
      <small>{acc.currency === "UZS" ? ACC_TYPE_LABEL[acc.type] : acc.currency}</small>
    </button>
  );
}

/** Ro'yxatlarda ko'rinadigan sarlavha */
export function entryTitle(e: Entry): string {
  if (e.status !== "ok") return e.raw;
  if (e.type === "total") return "Jami tekshiruv";
  if (e.type === "snapshot") return "Qoldiq " + e.account + (e.comment ? " · " + e.comment : "");
  if (e.type === "transfer" || e.type === "debt") {
    if (e.counterparty) return `${e.account} → ${e.counterparty}${e.comment ? " · " + e.comment : ""}`;
    const base = e.type === "debt" ? (e.amount! > 0 ? "qarz oshdi" : "qarz kamaydi") : "o'tkazma";
    return `${e.account} · ${e.category && e.category !== "qarz" ? e.category : base}${e.comment ? " · " + e.comment : ""}`;
  }
  return (e.category || "toifasiz") + (e.comment ? " · " + e.comment : "");
}

export function TypeChip({ e }: { e: Entry }) {
  if (e.status !== "ok") {
    const map: Record<string, [string, string]> = { pending: ["Chala", "warn"], unknown_account: ["Noma'lum hisob", "bad"], unclear: ["Noaniq", "bad"] };
    const [l, c] = map[e.status] || ["?", "warn"];
    return <span className={`chip ${c}`}>{l}</span>;
  }
  return <span className={`chip ${TYPE_CLS[e.type!]}`}>{TYPE_LABEL[e.type!]}{e.uncertain ? " ?" : ""}</span>;
}

export function Amount({ e, cur }: { e: Entry; cur?: Currency }) {
  if (e.status !== "ok") return null;
  const c = TYPE_CLS[e.type!];
  const v = e.amount!;
  let text: string;
  if (e.type === "snapshot" || e.type === "total") text = "= " + ledger(v, e.currency);
  else if (e.type === "transfer" || e.type === "debt") text = short(Math.abs(v), e.currency);
  else text = (v > 0 ? "+" : "") + short(v, e.currency);
  void cur;
  return <span className={`amt ${c}`}>{text}</span>;
}

// ---- toast ----
interface ToastItem { id: number; text: string; action?: { label: string; fn: () => void } }
const ToastCtx = createContext<(text: string, action?: ToastItem["action"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(1);
  const push = useCallback((text: string, action?: ToastItem["action"]) => {
    const id = idRef.current++;
    setItems((x) => [...x.slice(-1), { id, text, action }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), action ? 7000 : 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {items.slice(-1).map((t) => (
        <div key={t.id} className="toast" role="status">
          <span>{t.text}</span>
          {t.action && <button onClick={() => { t.action!.fn(); setItems((x) => x.filter((i) => i.id !== t.id)); }}>{t.action.label}</button>}
        </div>
      ))}
    </ToastCtx.Provider>
  );
}

// ---- dialog ----
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="row" style={{ marginBottom: 12 }}>
        <h2>{title}</h2>
        <button type="button" className="ghost" onClick={onClose} aria-label="Yopish" style={{ fontSize: 20 }}>×</button>
      </div>
      {open && children}
    </dialog>
  );
}

export const ICONS = {
  editor: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16M12 4v12M6 10l6 6 6-6"/></svg>,
  history: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h14v16H5zM8 9h8M8 13h8M8 17h5"/></svg>,
  stats: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>,
  accounts: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h18v12H3zM3 11h18M15 15h3"/></svg>,
  ai: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"/></svg>,
};
