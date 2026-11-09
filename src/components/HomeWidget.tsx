"use client";
// To'liq ekranli vidjet ko'rinishlari — telefonning bosh ekraniga alohida ikonka sifatida qo'shish uchun.

import { useEffect, useMemo, useState } from "react";
import { initApp, useApp } from "@/lib/store";
import { compute } from "@/lib/compute";
import { daysInMonth, humanDate, monthOf, monthStart, shiftDate, today } from "@/lib/dates";
import { money, num, pct, short, signed } from "@/lib/format";
import { dailySeries, debts, flow, totals } from "@/lib/stats";

type V = "balans" | "bugun" | "limit" | "maqsad" | "qarz" | "kurs";
const VARIANTS: [V, string, string][] = [
  ["balans", "Balans", "💼"],
  ["bugun", "Bugun", "⚡"],
  ["limit", "Limit", "📅"],
  ["maqsad", "Maqsad", "🎯"],
  ["qarz", "Qarzlar", "🤝"],
  ["kurs", "Kurs", "💵"],
];
const GRAD: Record<V, string> = {
  balans: "linear-gradient(150deg,#16212b 0%,#2a3d4f 55%,#1f3a33 100%)",
  bugun: "linear-gradient(150deg,#12271d 0%,#1f7a5c 90%)",
  limit: "linear-gradient(150deg,#241b33 0%,#5a4fa8 95%)",
  maqsad: "linear-gradient(150deg,#1c2740 0%,#2f5fa8 95%)",
  qarz: "linear-gradient(150deg,#2e2008 0%,#9a6a12 95%)",
  kurs: "linear-gradient(150deg,#0e2b2e 0%,#2a8f9d 95%)",
};

export default function HomeWidget() {
  const app = useApp();
  const [v, setV] = useState<V>("balans");
  const [rate, setRate] = useState<{ rate: number; diff: number; date: string } | null | undefined>(undefined);
  const todayStr = today();

  useEffect(() => {
    void initApp();
    const q = new URLSearchParams(location.search).get("v") as V | null;
    if (q && VARIANTS.some(([id]) => id === q)) setV(q);
  }, []);
  useEffect(() => {
    if (v !== "kurs" || rate !== undefined) return;
    fetch("/api/rates").then((r) => r.json()).then((j) => {
      const u = j?.rates?.find((x: { ccy: string }) => x.ccy === "USD");
      setRate(u ? { rate: u.rate, diff: u.diff, date: u.date } : null);
    }).catch(() => setRate(null));
  }, [v, rate]);
  useEffect(() => { document.title = "Moliya · " + (VARIANTS.find(([id]) => id === v)?.[1] || "Vidjet"); }, [v]);

  const c = useMemo(() => compute(app.notes, app.accounts, app.settings, todayStr), [app.notes, app.accounts, app.settings, todayStr]);
  const t = totals(c, app.accounts, "UZS");
  const tUsd = totals(c, app.accounts, "USD");
  const fToday = flow(c.ok, { from: todayStr, to: todayStr, label: "" }, "UZS", app.accounts);
  const ym = monthOf(todayStr);
  const fMonth = flow(c.ok, { from: monthStart(ym), to: todayStr, label: "" }, "UZS", app.accounts);
  const days14 = dailySeries(c.ok, { from: shiftDate(todayStr, -13), to: todayStr, label: "" }, "UZS");
  const max14 = Math.max(1, ...days14.map((d) => d.expense));
  const ds = debts(c, app.accounts);
  const s = app.settings;
  const budget = s.budget || 0;
  const open = () => { location.href = "/"; };
  const accs = app.accounts.filter((a) => !a.archived && a.type !== "person" && a.type !== "report").sort((a, b) => a.sort - b.sort).slice(0, 5);

  return (
    <div className="hw" style={{ background: GRAD[v] }}>
      <button type="button" className="hwcard" onClick={open} aria-label="Ilovani ochish">
        <div className="hwhead">
          <span className="hwbrand"><span className="hwmark">m</span> Moliya</span>
          <small>{humanDate(todayStr, false)}</small>
        </div>

        {v === "balans" && (
          <>
            <small className="hwl">Tasdiqlangan pul · {t.known}/{t.all}</small>
            <div className="hwbig">{t.known ? money(t.total) : "—"}</div>
            {tUsd.total !== 0 && <div className="hwmid">+ {money(tUsd.total, "USD")}</div>}
            <div className="hwrows">
              {accs.map((a) => {
                const b = c.balances[a.code]?.[a.currency];
                return <div key={a.id} className="hwrow"><span>{a.code}</span><b>{b?.known ? short(b.value) : "—"}</b></div>;
              })}
            </div>
          </>
        )}

        {v === "bugun" && (
          <>
            <small className="hwl">Bugungi harakat · {fToday.count} ta yozuv</small>
            <div className="hwbig" style={{ color: "#aef3cf" }}>+{short(fToday.income)}</div>
            <div className="hwbig" style={{ color: "#ffc2b0" }}>−{short(fToday.expense)}</div>
            <svg viewBox="0 0 140 30" width="100%" height="34" style={{ marginTop: 10 }}>
              {days14.map((d, i) => <rect key={d.date} x={i * 10 + 1} y={28 - Math.max(2, (d.expense / max14) * 26)} width={7} height={Math.max(2, (d.expense / max14) * 26)} rx={1.5} fill={d.date === todayStr ? "#ffc2b0" : "rgba(255,255,255,.35)"} />)}
            </svg>
            <small className="hwl">oxirgi 14 kun chiqimi</small>
          </>
        )}

        {v === "limit" && (
          <>
            <small className="hwl">Oylik chiqim limiti</small>
            {budget ? (
              <>
                <div className="hwbig">{short(fMonth.expense)} <span style={{ fontSize: 18, opacity: .8 }}>/ {short(budget)}</span></div>
                <div className="hwbar"><i style={{ width: `${Math.min(100, (fMonth.expense / budget) * 100)}%`, background: fMonth.expense > budget ? "#ff9c82" : "#aef3cf" }} /></div>
                <div className="hwmid">{budget - fMonth.expense >= 0 ? `Qoldi ${short(budget - fMonth.expense)} · ${daysInMonth(ym) - +todayStr.slice(8, 10)} kun` : `Limitdan oshdi: ${short(fMonth.expense - budget)}`}</div>
              </>
            ) : (
              <div className="hwmid">Limit o'rnatilmagan — ilovada Tahlil → Nazorat bo'limida kiriting</div>
            )}
          </>
        )}

        {v === "maqsad" && (
          <>
            <small className="hwl">{s.goalName || "Jamg'arma maqsadi"}</small>
            {s.goalTarget ? (
              <>
                <div className="hwbig">{pct((s.goalSaved / s.goalTarget) * 100)}</div>
                <div className="hwbar"><i style={{ width: `${Math.min(100, (s.goalSaved / s.goalTarget) * 100)}%`, background: "#cfe0ff" }} /></div>
                <div className="hwmid">{short(s.goalSaved)} / {short(s.goalTarget)}</div>
              </>
            ) : (
              <div className="hwmid">Maqsad o'rnatilmagan — ilovada Tahlil → Nazorat bo'limida kiriting</div>
            )}
          </>
        )}

        {v === "qarz" && (
          <>
            <small className="hwl">Qarzlar</small>
            {ds.length === 0 && <div className="hwmid">Shaxs hisoblarida harakat yo'q</div>}
            <div className="hwrows">
              {ds.slice(0, 6).map((d) => (
                <div key={d.account.id + d.cur} className="hwrow">
                  <span>{d.account.code}{d.value >= 0 ? " sizga" : " siz"}</span>
                  <b style={{ color: d.value >= 0 ? "#ffe9a8" : "#ffc2b0" }}>{short(Math.abs(d.value), d.cur)}</b>
                </div>
              ))}
            </div>
          </>
        )}

        {v === "kurs" && (
          <>
            <small className="hwl">USD kursi · Markaziy bank</small>
            {rate === undefined ? <div className="hwmid">Yuklanmoqda…</div> : rate === null ? <div className="hwmid">Internet yo'q</div> : (
              <>
                <div className="hwbig">{num(rate.rate, false)} <span style={{ fontSize: 18 }}>so'm</span></div>
                <div className="hwmid" style={{ color: rate.diff >= 0 ? "#aef3cf" : "#ffc2b0" }}>{rate.diff >= 0 ? "▲" : "▼"} {num(Math.abs(rate.diff))} so'm · {rate.date}</div>
              </>
            )}
          </>
        )}
        <small className="hwopen">Ilovani ochish →</small>
      </button>

      <div className="hwpick" role="tablist" aria-label="Vidjet turi">
        {VARIANTS.map(([id, name, emo]) => (
          <button key={id} type="button" role="tab" aria-selected={v === id} className={v === id ? "on" : ""} onClick={() => { setV(id); history.replaceState(null, "", "/w?v=" + id); }}>{emo} {name}</button>
        ))}
      </div>
      <p className="hwhint">Shu vidjetni telefon bosh ekraniga chiqarish: brauzer menyusi → <b>Bosh ekranga qo'shish</b>. Har bir tur alohida ikonka bo'ladi va bosilganda darhol shu ko'rinish ochiladi.</p>
    </div>
  );
}
