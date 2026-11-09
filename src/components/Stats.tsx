"use client";
import { useMemo, useState } from "react";
import type { Account, Computed, Currency, Issue, Settings } from "@/lib/types";
import { updateSettings, upsertAccount } from "@/lib/store";
import { humanDate, today } from "@/lib/dates";
import { money, pct, short, signed } from "@/lib/format";
import { bucketize, byCategory, dailySeries, debts, flow, monthlySeries, periodFor, previousPeriod, totals } from "@/lib/stats";
import { buildInsights } from "@/lib/insights";
import { monthNameUz, monthShortUz } from "@/lib/dates";
import { Donut, GroupedBars } from "./charts";
import { Badge, useToast } from "./ui";

interface Props {
  computed: Computed;
  accounts: Account[];
  settings: Settings;
  onOpen: (noteId: string, line: number) => void;
  onGo: (tab: "editor" | "history" | "stats" | "accounts" | "ai") => void;
  onCategory?: (category: string) => void;
  onAddAccount: (prefill?: string) => void;
}

export default function Stats({ computed, accounts, settings, onOpen, onGo, onAddAccount, onCategory }: Props) {
  const [periodKind, setPeriodKind] = useState("30");
  const [cur, setCur] = useState<Currency>("UZS");
  const [chartMode, setChartMode] = useState<"bar" | "line">(() => { try { return localStorage.getItem("moliya:chartmode") === "line" ? "line" : "bar"; } catch { return "bar"; } });
  function pickMode(m: "bar" | "line") { setChartMode(m); try { localStorage.setItem("moliya:chartmode", m); } catch { /* bo'sh */ } }
  const toast = useToast();
  const todayStr = today();
  const period = periodFor(periodKind, todayStr);
  const prev = previousPeriod(period);
  const accByCode = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts]);
  const currencies = useMemo(() => { const s = new Set<Currency>(["UZS"]); for (const e of computed.ok) s.add(e.currency!); return [...s]; }, [computed]);

  const f = flow(computed.ok, period, cur, accounts);
  const fp = flow(computed.ok, prev, cur, accounts);
  const cats = byCategory(computed.ok, period, cur);
  const daily = dailySeries(computed.ok, period, cur);
  const buckets = bucketize(daily, f.days <= 14 ? f.days : f.days <= 35 ? 10 : 12);
  const months = monthlySeries(computed.ok, cur, todayStr, 6);
  const t = totals(computed, accounts, cur, settings.accountPrefs);
  const ds = debts(computed, accounts);
  const diffs = computed.issues.filter((i) => (i.kind === "snapshot_diff" || i.kind === "expected_mismatch") && i.currency === cur);
  const insights = useMemo(() => buildInsights(computed, accounts, settings, todayStr), [computed, accounts, settings, todayStr]);
  const review = computed.issues.filter((i) => i.kind !== "snapshot_diff" && i.kind !== "expected_mismatch");
  const activeDays = daily.filter((d) => d.expense > 0 || d.income > 0).length;

  const delta = (a: number, b: number) => (b ? ((a - b) / b) * 100 : null);
  const cmp = (a: number, b: number, goodWhenUp: boolean) => {
    const d = delta(a, b);
    if (d === null) return <span className="d">oldingi davrda yozuv yo'q</span>;
    const up = d >= 0;
    return <span className="d" style={{ color: up === goodWhenUp ? "var(--in)" : "var(--out)" }}>{up ? "▲" : "▼"} {pct(Math.abs(d))} oldingi davrga nisbatan ({short(b, cur)})</span>;
  };

  function confirmPair(i: Issue, yes: boolean) {
    const sig = i.pairSig!;
    if (yes) updateSettings({ confirmedPairs: [...new Set([...settings.confirmedPairs, sig])] });
    else updateSettings({ rejectedPairs: [...new Set([...settings.rejectedPairs, sig])] });
    toast(yes ? "Bitta o'tkazma sifatida hisoblandi" : "Alohida yozuvlar sifatida qoldirildi");
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="row" style={{ flexWrap: "wrap" }}>
          <div>
            <h2>{period.label}</h2>
            <small>{humanDate(period.from, false)} — {humanDate(period.to, false)} · {f.days} kun, {activeDays} kunda yozuv bor · {cur}</small>
          </div>
          {currencies.length > 1 && <select value={cur} onChange={(e) => setCur(e.target.value as Currency)} aria-label="Valyuta" style={{ width: "auto" }}>{currencies.map((c) => <option key={c}>{c}</option>)}</select>}
        </div>
        <div className="pchips" role="tablist" aria-label="Davr">
          {([["7", "7 kun"], ["30", "30 kun"], ["month", "Joriy oy"], ["prev", "O'tgan oy"], ["90", "90 kun"], ["year", "Yil"]] as const).map(([v, l]) => (
            <button key={v} type="button" role="tab" aria-selected={periodKind === v} className={periodKind === v ? "on" : ""} onClick={() => setPeriodKind(v)}>{l}</button>
          ))}
        </div>
        <div className="kpis" style={{ marginTop: 14 }}>
          <div className="kpi"><small>Kirim</small><div className="v amt in">+{short(f.income, cur)}</div>{cmp(f.income, fp.income, true)}</div>
          <div className="kpi"><small>Chiqim</small><div className="v amt out">−{short(f.expense, cur)}</div>{cmp(f.expense, fp.expense, false)}</div>
          <div className="kpi"><small>Kirim − chiqim</small><div className={`v amt ${f.net >= 0 ? "in" : "out"}`}>{signed(f.net, cur)}</div><span className="d">bu qoldiq emas — davrdagi pul oqimi</span></div>
          <div className="kpi"><small>Kunlik o'rtacha chiqim</small><div className="v">{short(f.expense / f.days, cur)}</div><span className="d">{f.count} ta yozuv · yozuvli kunlar bo'yicha {activeDays ? short(f.expense / activeDays, cur) : "—"}</span></div>
        </div>
        <p className="hint">O'tkazmalar ({short(f.transfers, cur)}), qarz harakati (berildi {short(f.debtGiven, cur)}, qaytdi {short(f.debtReturned, cur)}) va qoldiq tafovutlari (+{short(f.diffPlus, cur)} / −{short(f.diffMinus, cur)}) kirim-chiqimga qo'shilmagan.</p>
      </div>

      <div className="grid">
        <div className="card" id="flowchart">
          <div className="row"><h2>Kirim va chiqim</h2><span style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
            <span className="segment" role="group" aria-label="Grafik turi" style={{ padding: 2 }}>
              <button type="button" className={chartMode === "bar" ? "on" : ""} style={{ padding: "3px 8px", minHeight: 0 }} onClick={() => pickMode("bar")} title="Ustunli">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="4" y="11" width="4" height="9" rx="1"/><rect x="10" y="5" width="4" height="15" rx="1"/><rect x="16" y="8" width="4" height="12" rx="1"/></svg>
              </button>
              <button type="button" className={chartMode === "line" ? "on" : ""} style={{ padding: "3px 8px", minHeight: 0 }} onClick={() => pickMode("line")} title="Siniq chiziqli">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l5-6 4 3 6-8"/></svg>
              </button>
            </span>
            <span className="chip">{cur}</span>
          </span></div>
          <p className="hint" style={{ marginBottom: 8 }}>{buckets.length} oraliq · bosib ko'ring</p>
          {f.income + f.expense > 0 ? <GroupedBars data={buckets.map((b) => ({ label: b.label, title: `${humanDate(b.from, false)} — ${humanDate(b.to, false)}`, a: b.income, b: b.expense }))} cur={cur} mode={chartMode} /> : <div className="empty"><b>Bu davrda yozuv yo'q</b>Kirim yoki chiqim yozilsa grafik paydo bo'ladi.</div>}
        </div>
        <div className="card">
          <h2>Xarajat tarkibi</h2>
          <p className="hint" style={{ marginBottom: 8 }}>{period.label} · faqat chiqimlar</p>
          {cats.length ? <Donut rows={cats} total={f.expense} cur={cur} onPick={onCategory} /> : <div className="empty"><b>Xarajat yo'q</b>Toifalar yozuvlardan hosil bo'ladi.</div>}
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <div className="row"><h2>Oylar kesimida</h2><span className="chip">6 oy · {cur}</span></div>
          <p className="hint" style={{ marginBottom: 8 }}>Har oy jami kirim va chiqim</p>
          <GroupedBars data={months.map((m) => ({ label: monthShortUz(m.ym), title: monthNameUz(m.ym), a: m.income, b: m.expense }))} cur={cur} height={170} mode={chartMode} />
          <div className="tablewrap"><table className="table" style={{ marginTop: 8 }}>
            <thead><tr><th>Oy</th><th className="r">Kirim</th><th className="r">Chiqim</th><th className="r">Sof</th></tr></thead>
            <tbody>{months.map((m) => <tr key={m.ym}><td>{monthNameUz(m.ym)}</td><td className="r amt in">{m.income ? "+" + short(m.income, cur) : "—"}</td><td className="r amt out">{m.expense ? "−" + short(m.expense, cur) : "—"}</td><td className={`r amt ${m.net >= 0 ? "in" : "out"}`}>{m.income || m.expense ? signed(m.net, cur) : "—"}</td></tr>)}</tbody>
          </table></div>
        </div>
        <div className="stack">
          <div className="card">
            <div className="row"><h2>Hisoblar qoldig'i</h2><span className="chip">{t.known}/{t.all} tasdiqlangan</span></div>
            <p className="hint">Jami {money(t.total, cur)} · uyda {short(t.home, cur)} · naqd+karta {short(t.active, cur)}. Qarzlar qo'shilmagan.</p>
            <table className="table" style={{ marginTop: 6 }}>
              <tbody>
                {accounts.filter((a) => !a.archived && a.type !== "person").map((a) => {
                  const b = computed.balances[a.code]?.[cur];
                  if (!b || (!b.known && b.value === 0)) return null;
                  return <tr key={a.id}><td style={{ width: 48 }}><Badge acc={a} /></td><td>{a.name}<br /><small>{b.known ? `oxirgi tasdiq ${b.lastSnapshot ? humanDate(b.lastSnapshot, false) : "yozilgan qoldiq orqali"}` : "boshlang'ich qoldiq yozilmagan"}</small></td><td className="r"><b>{b.known ? money(b.value, cur) : "— (" + signed(b.value, cur) + " harakat)"}</b></td></tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2>Qarzlar</h2>
            {ds.length === 0 ? <p className="hint">Shaxs hisoblarida harakat yo'q.</p> : ds.map((d) => (
              <div key={d.account.id + d.cur} className="row" style={{ marginTop: 10 }}>
                <span style={{ display: "flex", gap: 10, alignItems: "center" }}><Badge acc={d.account} /><span>{d.account.name}<br /><small>{d.value >= 0 ? "sizga qarzdor" : "siz qarzdorsiz"}{d.known ? "" : " · tasdiqlanmagan"}</small></span></span>
                <b className={`amt ${d.value >= 0 ? "in" : "out"}`}>{money(Math.abs(d.value), d.cur)}</b>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="row"><h2>Qoldiq tafovutlari</h2><span className={`chip ${diffs.length ? "warn" : "ok"}`}>{diffs.length} ta</span></div>
            <p className="hint">Yozilgan qoldiq hisobga mos kelmagan joylar. Avtomatik ravishda xarajat yoki kirim deb belgilanmaydi.</p>
            {diffs.slice(0, 12).map((i) => (
              <div key={i.entry.key} className="entry" onClick={() => onOpen(i.entry.noteId, i.entry.line)}>
                <Badge acc={accByCode.get(i.entry.account!)} />
                <div className="main"><b className="mono">{i.entry.raw}</b><small>{humanDate(i.entry.date, false)} · {i.kind === "snapshot_diff" ? "qoldiq yozuvi" : "yozilgan qoldiq (=)"}</small></div>
                <b className={`amt ${i.amount! > 0 ? "in" : "out"}`}>{signed(i.amount!, i.currency)}</b>
              </div>
            ))}
            {diffs.length > 0 && <p className="hint">Yig'indi: {signed(diffs.reduce((s, i) => s + (i.amount || 0), 0), cur)}. Musbat — hisobda kutilganidan ko'p pul (yozilmagan kirim yoki xato), manfiy — kam (yozilmagan xarajat).</p>}
          </div>
        </div>
      </div>

      <div className="card" id="control">
        <div className="row"><h2>Nazorat</h2><span className="chip">yozuvlaringiz asosida · AI emas</span></div>
        {insights.length === 0 && <p className="hint">Bir necha kun yozuv to'plansa, bu yerda aniq xulosalar paydo bo'ladi: bugungi chiqim odatdagiga nisbatan, oy oxiri prognozi, qarzlar, maqsadga yetish muddati.</p>}
        {insights.map((i) => (
          <div key={i.id} className={`insight compact ${i.severity}`}>
            <div className="ic">{i.icon}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="row" style={{ gap: 8 }}><b>{i.title}</b>{i.metric && <span className={`amt ${i.metricCls || ""}`} style={{ fontSize: 14.5, flexShrink: 0 }}>{i.metric}</span>}</div>
              <p>{i.text}</p>
              {i.action && <div className="act">→ {i.action}</div>}
              {i.go && <button type="button" className="ghost small" style={{ marginTop: 2, marginLeft: -8 }} onClick={() => onGo(i.go!)}>Ochish</button>}
            </div>
          </div>
        ))}
        <div className="fields" style={{ marginTop: 16 }}>
          <div>
            <label className="label" htmlFor="budget">Oylik chiqim chegarasi · so'm</label>
            <input id="budget" inputMode="numeric" placeholder="5000000" value={settings.budget || ""} onChange={(e) => updateSettings({ budget: Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0) })} />
          </div>
          <div>
            <label className="label" htmlFor="goalName">Jamg'arma maqsadi</label>
            <input id="goalName" placeholder="2 xonali uy — boshlang'ich to'lov" value={settings.goalName} onChange={(e) => updateSettings({ goalName: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="goalTarget">Kerakli summa · so'm</label>
            <input id="goalTarget" inputMode="numeric" placeholder="150000000" value={settings.goalTarget || ""} onChange={(e) => updateSettings({ goalTarget: Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0) })} />
          </div>
          <div>
            <label className="label" htmlFor="goalSaved">Allaqachon ajratilgan · so'm</label>
            <input id="goalSaved" inputMode="numeric" placeholder="0" value={settings.goalSaved || ""} onChange={(e) => updateSettings({ goalSaved: Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0) })} />
          </div>
          <div>
            <label className="label" htmlFor="goalMonthly">Oyiga ajratish rejasi · so'm</label>
            <input id="goalMonthly" inputMode="numeric" placeholder="2000000" value={settings.goalMonthly || ""} onChange={(e) => updateSettings({ goalMonthly: Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0) })} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row"><h2>Tekshirish kerak</h2><span className={`chip ${review.length ? "warn" : "ok"}`}>{review.length} ta</span></div>
        {review.length === 0 && <p className="hint">Chala satrlar, noma'lum hisoblar, ehtimoliy juftliklar va «?» belgili yozuvlar shu yerda ko'rinadi. Hozir hammasi tartibda.</p>}
        {review.slice(0, 40).map((i) => {
          const e = i.entry;
          return (
            <div key={i.kind + e.key} className="insight warn" style={{ gridTemplateColumns: "1fr" }}>
              <div>
                <b>{i.text}</b>
                <p className="mono">{e.raw}{i.other ? <><br />{i.other.raw}</> : null} <span className="muted">· {humanDate(e.date, false)}</span></p>
                <div className="wrap" style={{ marginTop: 8 }}>
                  {i.kind === "possible_pair" ? (
                    <>
                      <button type="button" className="small primary" onClick={() => confirmPair(i, true)}>Ha, bitta o'tkazma</button>
                      <button type="button" className="small" onClick={() => confirmPair(i, false)}>Yo'q, alohida</button>
                    </>
                  ) : null}
                  {i.kind === "unknown_account" && e.unknownCode ? (
                    <>
                      <button type="button" className="small primary" onClick={() => onAddAccount(e.unknownCode)}>"{e.unknownCode}" hisobini yaratish</button>
                      {accounts.filter((a) => !a.archived).slice(0, 7).map((a) => <button key={a.id} type="button" className="small" onClick={() => { upsertAccount({ ...a, aliases: [...new Set([...(a.aliases || []), e.unknownCode!])] }); toast(`"${e.unknownCode}" → ${a.code}`); }}>→ {a.code}</button>)}
                    </>
                  ) : null}
                  <button type="button" className="small" onClick={() => onOpen(e.noteId, e.line)}>Yozuvni ochish</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
