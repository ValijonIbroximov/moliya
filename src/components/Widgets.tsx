"use client";
// Yozuv ekrani vidjetlari — ixcham kartochkalar. Profil → Ko'rinish da tanlanadi.

import { useEffect, useMemo, useState } from "react";
import type { Account, Computed, Settings } from "@/lib/types";
import { daysInMonth, monthOf, monthStart, shiftDate, today } from "@/lib/dates";
import { num, pct, short, signed } from "@/lib/format";
import { dailySeries, debts, flow } from "@/lib/stats";

export const WIDGET_DEFS: [string, string][] = [
  ["today", "Bugun (kirim/chiqim)"],
  ["week", "14 kun chiqim grafigi"],
  ["income", "14 kun kirim grafigi"],
  ["limit", "Oylik limit"],
  ["goal", "Jamg'arma maqsadi"],
  ["debt", "Qarzlar"],
  ["rate", "USD kursi (MB)"],
];
export const DEFAULT_WIDGETS = ["today", "week", "limit", "goal"];

let rateCache: { rate: number; diff: number; date: string } | null | undefined;

export default function Widgets({ computed, accounts, settings, onGo }: { computed: Computed; accounts: Account[]; settings: Settings; onGo: (t: "stats" | "accounts", anchor?: string) => void }) {
  const enabled = settings.widgets ?? DEFAULT_WIDGETS;
  const todayStr = today();
  const [rate, setRate] = useState(rateCache);
  useEffect(() => {
    if (!enabled.includes("rate") || rateCache !== undefined) return;
    fetch("/api/rates").then((r) => r.json()).then((j) => {
      const u = j?.rates?.find((x: { ccy: string }) => x.ccy === "USD");
      rateCache = u ? { rate: u.rate, diff: u.diff, date: u.date } : null;
      setRate(rateCache);
    }).catch(() => { rateCache = null; setRate(null); });
  }, [enabled]);

  const fToday = useMemo(() => flow(computed.ok, { from: todayStr, to: todayStr, label: "" }, "UZS", accounts), [computed, accounts, todayStr]);
  const days14 = useMemo(() => dailySeries(computed.ok, { from: shiftDate(todayStr, -13), to: todayStr, label: "" }, "UZS"), [computed, todayStr]);
  const sum14 = days14.reduce((s, d) => s + d.expense, 0);
  const max14 = Math.max(1, ...days14.map((d) => d.expense));
  const sumIn14 = days14.reduce((s, d) => s + d.income, 0);
  const maxIn14 = Math.max(1, ...days14.map((d) => d.income));
  const ym = monthOf(todayStr);
  const fMonth = useMemo(() => flow(computed.ok, { from: monthStart(ym), to: todayStr, label: "" }, "UZS", accounts), [computed, accounts, ym, todayStr]);
  const budget = settings.budget || 0;
  const leftDays = daysInMonth(ym) - +todayStr.slice(8, 10);
  const ds = useMemo(() => debts(computed, accounts), [computed, accounts]);
  const debtUzs = ds.filter((d) => d.cur === "UZS").reduce((s, d) => s + d.value, 0);
  const debtUsd = ds.filter((d) => d.cur === "USD").reduce((s, d) => s + d.value, 0);

  const items: { id: string; el: React.ReactNode }[] = [];

  if (enabled.includes("today"))
    items.push({ id: "today", el: (
      <button type="button" className="wtile" onClick={() => onGo("stats", "flowchart")}>
        <small>Bugun</small>
        <b><span className="amt in">+{short(fToday.income)}</span> <span className="amt out">−{short(fToday.expense)}</span></b>
        <small className="muted">{fToday.count} ta yozuv</small>
      </button>
    )});

  if (enabled.includes("week"))
    items.push({ id: "week", el: (
      <button type="button" className="wtile" onClick={() => onGo("stats", "flowchart")}>
        <small>14 kun chiqim · {short(sum14)}</small>
        <svg viewBox="0 0 140 34" width="100%" height="34" aria-label="14 kunlik chiqim grafigi">
          {(() => {
            const px = (i: number) => 3 + (i * 134) / (days14.length - 1 || 1);
            const py = (v: number) => 31 - (v / max14) * 27;
            const pts = days14.map((d, i) => `${px(i).toFixed(1)},${py(d.expense).toFixed(1)}`).join(" ");
            const li = days14.length - 1;
            return (
              <>
                <polygon points={`3,31 ${pts} ${px(li).toFixed(1)},31`} fill="var(--out)" opacity={0.1} />
                <polyline points={pts} fill="none" stroke="var(--out)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={px(li)} cy={py(days14[li]?.expense || 0)} r="2.4" fill="var(--out)" />
              </>
            );
          })()}
        </svg>
      </button>
    )});

  if (enabled.includes("income"))
    items.push({ id: "income", el: (
      <button type="button" className="wtile" onClick={() => onGo("stats", "flowchart")}>
        <small>14 kun kirim · {short(sumIn14)}</small>
        <svg viewBox="0 0 140 34" width="100%" height="34" aria-label="14 kunlik kirim grafigi">
          {(() => {
            const px = (i: number) => 3 + (i * 134) / (days14.length - 1 || 1);
            const py = (v: number) => 31 - (v / maxIn14) * 27;
            const pts = days14.map((d, i) => `${px(i).toFixed(1)},${py(d.income).toFixed(1)}`).join(" ");
            const li = days14.length - 1;
            return (
              <>
                <polygon points={`3,31 ${pts} ${px(li).toFixed(1)},31`} fill="var(--in)" opacity={0.1} />
                <polyline points={pts} fill="none" stroke="var(--in)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={px(li)} cy={py(days14[li]?.income || 0)} r="2.4" fill="var(--in)" />
              </>
            );
          })()}
        </svg>
      </button>
    )});

  if (enabled.includes("limit"))
    items.push({ id: "limit", el: (
      <button type="button" className="wtile" onClick={() => onGo("stats", "control")}>
        <small>Oylik limit{budget ? "" : " · o'rnatilmagan"}</small>
        {budget ? (
          <>
            <b className={fMonth.expense > budget ? "amt out" : ""}>{short(fMonth.expense)} / {short(budget)}</b>
            <span className="bar"><i style={{ width: `${Math.min(100, (fMonth.expense / budget) * 100)}%`, background: fMonth.expense > budget ? "var(--out)" : fMonth.expense / budget > 0.8 ? "var(--warn)" : "var(--in)" }} /></span>
            <small className="muted">{budget - fMonth.expense >= 0 ? `qoldi ${short(budget - fMonth.expense)} · ${leftDays} kunga` : `oshdi ${short(fMonth.expense - budget)}`}</small>
          </>
        ) : (
          <small className="muted">Tahlil → Nazorat da limit kiriting — shu yerda progress chiqadi</small>
        )}
      </button>
    )});

  if (enabled.includes("goal"))
    items.push({ id: "goal", el: (
      <button type="button" className="wtile" onClick={() => onGo("stats", "control")}>
        <small>{settings.goalName || "Maqsad · o'rnatilmagan"}</small>
        {settings.goalTarget ? (
          <>
            <b>{pct((settings.goalSaved / settings.goalTarget) * 100)}</b>
            <span className="bar"><i style={{ width: `${Math.min(100, (settings.goalSaved / settings.goalTarget) * 100)}%`, background: "var(--move)" }} /></span>
            <small className="muted">{short(settings.goalSaved)} / {short(settings.goalTarget)}</small>
          </>
        ) : (
          <small className="muted">Tahlil → Nazorat da maqsad kiriting</small>
        )}
      </button>
    )});

  if (enabled.includes("debt"))
    items.push({ id: "debt", el: (
      <button type="button" className="wtile" onClick={() => onGo("accounts")}>
        <small>Qarzlar (sizga)</small>
        <b className={debtUzs >= 0 ? "amt in" : "amt out"}>{signed(debtUzs)}{debtUsd !== 0 ? <span className="amt in" style={{ fontSize: 12 }}> {signed(debtUsd, "USD")}</span> : null}</b>
        <small className="muted">{ds.length} ta shaxs hisobi</small>
      </button>
    )});

  if (enabled.includes("rate"))
    items.push({ id: "rate", el: (
      <div className="wtile" role="note">
        <small>USD kursi · MB rasmiy</small>
        {rate === undefined ? <small className="muted">yuklanmoqda…</small> : rate === null ? <small className="muted">server bilan aloqa yo'q</small> : (
          <>
            <b>{num(rate.rate, false)} so'm <span className={`amt ${rate.diff >= 0 ? "in" : "out"}`} style={{ fontSize: 12 }}>{rate.diff >= 0 ? "▲" : "▼"}{num(Math.abs(rate.diff))}</span></b>
            <small className="muted">{rate.date}</small>
          </>
        )}
      </div>
    )});

  if (!items.length) return null;
  return <div className="widgets">{items.map((i) => <span key={i.id}>{i.el}</span>)}</div>;
}
