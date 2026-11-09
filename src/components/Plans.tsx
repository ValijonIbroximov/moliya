"use client";
// Rejalar va eslatmalar: muddatli to'lovlar (kvartira — har oy 17-sanagacha, 500$ + 384 ming),
// vaqtinchalik eslatmalar (pochta puli, uydagilarga jo'natish). Statistikaga ta'sir qilmaydi.

import { useEffect, useMemo, useState } from "react";
import type { Account, Plan, Settings } from "@/lib/types";
import { updateSettings, uid } from "@/lib/store";
import { daysBetween, daysInMonth, monthOf, shiftMonth, today } from "@/lib/dates";
import { num, short } from "@/lib/format";
import { Modal, useToast } from "./ui";

interface Props {
  settings: Settings;
  accounts: Account[];
  onInsert: (lines: string[]) => void;
}

export interface PlanDue {
  plan: Plan;
  due: string | null; // YYYY-MM-DD
  daysLeft: number | null;
  doneThisCycle: boolean;
}

export function planDue(p: Plan, todayStr: string): PlanDue {
  if (!p.day) return { plan: p, due: null, daysLeft: null, doneThisCycle: false };
  const ym = monthOf(todayStr);
  const doneThisCycle = p.lastDone === ym;
  const targetYm = doneThisCycle && p.recurring ? shiftMonth(ym, 1) : ym;
  const day = Math.min(p.day, daysInMonth(targetYm));
  let due = `${targetYm}-${String(day).padStart(2, "0")}`;
  // muddati o'tgan bo'lsa ham shu oyda ko'rsatamiz (kechikdi deb)
  if (!p.recurring && doneThisCycle) return { plan: p, due, daysLeft: null, doneThisCycle: true };
  const daysLeft = daysBetween(todayStr, due);
  return { plan: p, due, daysLeft, doneThisCycle };
}

export default function Plans({ settings, accounts, onInsert }: Props) {
  const toast = useToast();
  const [dlg, setDlg] = useState<{ open: boolean; editing: Plan | null }>({ open: false, editing: null });
  const [usdRate, setUsdRate] = useState<number | null>(null);
  const todayStr = today();
  const plans = settings.plans || [];

  useEffect(() => {
    fetch("/api/rates").then((r) => r.json()).then((j) => {
      const u = j?.rates?.find((x: { ccy: string }) => x.ccy === "USD");
      if (u) setUsdRate(u.rate);
    }).catch(() => {});
  }, []);

  const rows = useMemo(() => {
    return plans.map((p) => planDue(p, todayStr)).sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
  }, [plans, todayStr]);

  function save(list: Plan[]) {
    updateSettings({ plans: list });
  }
  function markDone(p: Plan) {
    if (!p.recurring) { save(plans.filter((x) => x.id !== p.id)); toast(`"${p.name}" bajarildi — ro'yxatdan olib tashlandi`); return; }
    save(plans.map((x) => (x.id === p.id ? { ...x, lastDone: monthOf(todayStr) } : x)));
    toast(`"${p.name}" shu oy uchun bajarildi deb belgilandi`);
  }
  function insert(p: Plan) {
    const acc = p.account || "K";
    const lines: string[] = [];
    if (p.usd > 0) lines.push(`${acc} -${num(p.usd)}$ ${p.name}`);
    if (p.uzs > 0) lines.push(`${acc} -${num(p.uzs / 1000)} ${p.name}`);
    if (!lines.length) lines.push(`${acc} - ${p.name}`);
    onInsert(lines);
  }

  const amountText = (p: Plan) => {
    const parts: string[] = [];
    if (p.usd > 0) parts.push(num(p.usd) + " $");
    if (p.uzs > 0) parts.push(short(p.uzs));
    let t = parts.join(" + ") || "—";
    if (p.usd > 0 && usdRate) t += ` ≈ ${short(p.usd * usdRate + p.uzs)} (kurs ${num(usdRate, false)})`;
    return t;
  };

  return (
    <div className="card">
      <div className="row">
        <h2>Rejalar va eslatmalar</h2>
        <button type="button" className="small" onClick={() => setDlg({ open: true, editing: null })}>+ Qo'shish</button>
      </div>
      {rows.length === 0 && <p className="hint">Muddatli to'lovlar (masalan, kvartira — har oy 17-sanagacha, 500 $ + 384 ming) va bir martalik eslatmalar (pochta puli, uyga jo'natish) shu yerda turadi. Statistikaga aralashmaydi, vaqti kelganda ko'zga tashlanadi.</p>}
      {rows.map(({ plan: p, daysLeft, doneThisCycle }) => {
        const state = doneThisCycle && p.recurring ? "ok" : daysLeft === null ? "" : daysLeft < 0 ? "bad" : daysLeft <= 5 ? "warn" : "";
        const label = doneThisCycle && p.recurring ? "shu oy to'landi ✓" : daysLeft === null ? "muddatsiz" : daysLeft < 0 ? `${-daysLeft} kun kechikdi` : daysLeft === 0 ? "bugun!" : `${daysLeft} kun qoldi`;
        return (
          <div key={p.id} className="row" style={{ padding: "9px 0", borderBottom: "1px solid var(--line)", alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <b style={{ fontSize: 14 }}>{p.name}</b>{" "}
              <span className={`chip ${state}`}>{p.day ? (p.recurring ? `har oy ${p.day}-sana · ` : "") + label : "eslatma"}</span>
              <small style={{ display: "block" }}>{amountText(p)}{p.account ? ` · ${p.account} dan` : ""}</small>
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button type="button" className="ghost small" title="Yozuvga qo'shish" onClick={() => insert(p)}>Yozish</button>
              <button type="button" className="ghost small" title={p.recurring ? "Shu oy bajarildi" : "Bajarildi — olib tashlash"} onClick={() => markDone(p)}>✓</button>
              <button type="button" className="ghost small" onClick={() => setDlg({ open: true, editing: p })} aria-label="Tahrirlash">✎</button>
            </div>
          </div>
        );
      })}
      <PlanDialog open={dlg.open} editing={dlg.editing} accounts={accounts} onClose={() => setDlg({ open: false, editing: null })}
        onSave={(p) => { const i = plans.findIndex((x) => x.id === p.id); save(i >= 0 ? plans.map((x) => (x.id === p.id ? p : x)) : [...plans, p]); setDlg({ open: false, editing: null }); }}
        onDelete={(id) => { save(plans.filter((x) => x.id !== id)); setDlg({ open: false, editing: null }); }} />
    </div>
  );
}

function PlanDialog({ open, editing, accounts, onClose, onSave, onDelete }: { open: boolean; editing: Plan | null; accounts: Account[]; onClose: () => void; onSave: (p: Plan) => void; onDelete: (id: string) => void }) {
  const [name, setName] = useState("");
  const [uzs, setUzs] = useState("");
  const [usd, setUsd] = useState("");
  const [day, setDay] = useState(0);
  const [recurring, setRecurring] = useState(true);
  const [account, setAccount] = useState("");
  useEffect(() => {
    if (!open) return;
    setName(editing?.name || "");
    setUzs(editing?.uzs ? String(editing.uzs) : "");
    setUsd(editing?.usd ? String(editing.usd) : "");
    setDay(editing?.day ?? 17);
    setRecurring(editing?.recurring ?? true);
    setAccount(editing?.account || "");
  }, [open, editing]);
  return (
    <Modal open={open} onClose={onClose} title={editing ? "Rejani tahrirlash" : "Yangi reja / eslatma"}>
      <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; onSave({ id: editing?.id || uid(), name: name.trim(), uzs: Math.max(0, +uzs.replace(/\D/g, "") || 0), usd: Math.max(0, parseFloat(usd.replace(",", ".")) || 0), day: Math.min(31, Math.max(0, day)), recurring, account: account || undefined, lastDone: editing?.lastDone }); }}>
        <label className="label" htmlFor="pname">Nomi</label>
        <input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Kvartira puli / Pochta puli Alisherga / Uyga jo'natish" required maxLength={60} />
        <div className="fields">
          <div><label className="label" htmlFor="puzs">Summa · so'm</label><input id="puzs" inputMode="numeric" value={uzs} onChange={(e) => setUzs(e.target.value)} placeholder="384000" /></div>
          <div><label className="label" htmlFor="pusd">Summa · $</label><input id="pusd" inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} placeholder="500" /></div>
          <div>
            <label className="label" htmlFor="pday">Oyning kuni (muddati)</label>
            <select id="pday" value={day} onChange={(e) => setDay(+e.target.value)}>
              <option value={0}>Kunsiz (oddiy eslatma)</option>
              {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}-sanagacha</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="pacc">Qaysi hisobdan</label>
            <select id="pacc" value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">—</option>
              {accounts.filter((a) => !a.archived && a.type !== "person" && a.type !== "report").map((a) => <option key={a.id} value={a.code}>{a.code} · {a.name}</option>)}
            </select>
          </div>
        </div>
        <label className="label" style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 500 }}>
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} style={{ width: "auto" }} /> Har oy takrorlanadi
        </label>
        <p className="hint">«✓» bosilganda: takroriy reja shu oy uchun bajarildi deb belgilanadi, bir martalik eslatma ro'yxatdan chiqadi. «Yozish» — to'lov satrini yozuvga qo'yib beradi (dollar va so'm alohida satr bo'ladi).</p>
        <div className="row" style={{ marginTop: 14 }}>
          {editing ? <button type="button" className="danger" onClick={() => onDelete(editing.id)}>O'chirish</button> : <span />}
          <button className="primary">{editing ? "Saqlash" : "Qo'shish"}</button>
        </div>
      </form>
    </Modal>
  );
}
