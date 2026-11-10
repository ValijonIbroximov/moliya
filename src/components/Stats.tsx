"use client";
import { useEffect, useMemo, useState } from "react";
import type { Account, Computed, Currency, Issue, MonthPlanItem, Settings } from "@/lib/types";
import { updateSettings, upsertAccount } from "@/lib/store";
import { humanDate, monthOf, monthStart, today } from "@/lib/dates";
import { money, num, pct, short, signed } from "@/lib/format";
import { balancesAt, bucketize, byCategory, dailySeries, debts, flow, monthlySeries, monthSummary, periodFor, previousPeriod, totals } from "@/lib/stats";
import { buildInsights } from "@/lib/insights";
import { monthNameUz, monthShortUz } from "@/lib/dates";
import { Donut, GroupedBars } from "./charts";
import { Badge, useToast, Modal } from "./ui";

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
  const ds = debts(computed, accounts, settings.accountPrefs);
    const plan: MonthPlanItem[] = settings.monthPlan || [];
  const [usd, setUsd] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/rates").then((r) => r.json()).then((j) => {
      const u = j?.rates?.find((x: { ccy: string }) => x.ccy === "USD");
      setUsd(u ? u.rate : null);
    }).catch(() => setUsd(null));
  }, []);
  const msum = monthSummary(computed, accounts, today(), settings.accountPrefs, usd);
  function setPlan(next: MonthPlanItem[]) { updateSettings({ monthPlan: next }); }
  const itemUZS = (it: MonthPlanItem) => it.currency === "UZS" ? it.amount * 1000 : usd ? it.amount * usd : 0;
  const planSum = plan.reduce((t, it) => t + itemUZS(it), 0);
  const planRem = msum.jami - planSum;
  const planDaily = planRem / 30;
  const [showReport, setShowReport] = useState(false);
  const diffs = computed.issues.filter((i) => (i.kind === "snapshot_diff" || i.kind === "expected_mismatch") && i.currency === cur);
  const insights = useMemo(() => buildInsights(computed, accounts, settings, todayStr), [computed, accounts, settings, todayStr]);
  const issueSig = (i: Issue) => `${i.kind}:${i.entry.sig || i.entry.raw.trim() + "@" + i.entry.date}`;
  const dismissed = new Set(settings.dismissedIssues || []);
  const reviewAll = computed.issues.filter((i) => i.kind !== "snapshot_diff" && i.kind !== "expected_mismatch");
  const review = reviewAll.filter((i) => !dismissed.has(issueSig(i)));
  const dismissedCount = reviewAll.length - review.length;
  const dismissIssue = (i: Issue) => updateSettings({ dismissedIssues: [...new Set([...(settings.dismissedIssues || []), issueSig(i)])] });
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
      <div className="card" id="monthplan">
        <div className="row"><h2>Bu oy</h2><span style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <button type="button" className="ghost small" onClick={() => setShowReport(true)} title="Batafsil hisobot: oy boshida qancha edi, oylik, taqsimot, kunlik chiqimlar">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-2px", marginRight: 4 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15l2 2 4-4"/></svg>
            Batafsil hisobot
          </button>
          <span className="chip">{short(msum.jami)}</span>
        </span></div>
        <p className="hint" style={{ margin: "6px 0 0" }}>Bor edi {short(msum.borEdi)} + oylik {short(msum.income)} = <b>{short(msum.jami)}</b> · qoldi {short(msum.qoldi)} · sarflandi {short(msum.sarflandi)}{msum.usdApplied ? " · $ kurs bilan" : msum.hasUsd ? ` · + ${short(msum.usdTotal, "USD")} (kurssiz)` : ""}</p>
        {plan.length > 0
          ? <p className="hint" style={{ margin: "4px 0 0" }}>Taqsimlandi {short(planSum)} · sarflash uchun qoldi <b className={planRem >= 0 ? "amt in" : "amt out"}>{short(planRem)}</b>{planRem > 0 ? <> · kuniga ~<b>{short(planDaily)}</b></> : null}</p>
          : <p className="hint" style={{ margin: "4px 0 0" }}>Taqsimot hali kiritilmagan — hisobot ichidagi ✎ bilan qo'shing.</p>}
      </div>

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

      <MonthReport open={showReport} onClose={() => setShowReport(false)} computed={computed} accounts={accounts} settings={settings} usd={usd} />

      <div className="card">
        <div className="row"><h2>Tekshirish kerak</h2><span className={`chip ${review.length ? "warn" : "ok"}`}>{review.length} ta</span></div>
        {review.length === 0 && <p className="hint">Chala satrlar, noma'lum hisoblar, ehtimoliy juftliklar va «?» belgili yozuvlar shu yerda ko'rinadi. Hozir hammasi tartibda.</p>}
        {dismissedCount > 0 && <p className="hint" style={{ margin: "4px 0 0" }}>{dismissedCount} ta e'tiborsiz qoldirilgan · <button type="button" className="ghost small" style={{ padding: "2px 8px" }} onClick={() => updateSettings({ dismissedIssues: [] })}>tiklash</button></p>}
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
                  {i.kind !== "possible_pair" && <button type="button" className="small ghost" onClick={() => { dismissIssue(i); toast("E'tiborsiz qoldirildi"); }} title="Bu ogohlantirish boshqa ko'rsatilmaydi (yozuv o'zgarmaydi)">E'tiborsiz qoldirish</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


/** "Bu oy" batafsil hisoboti: taqsimot, oy boshidagi hisoblar, kirimlar, kunlik chiqimlar, tejash */
function MonthReport({ open, onClose, computed, accounts, settings, usd }: { open: boolean; onClose: () => void; computed: Computed; accounts: Account[]; settings: Settings; usd: number | null }) {
  const [edit, setEdit] = useState(false);
  const t0 = today();
  const start = monthStart(monthOf(t0));
  const m = monthSummary(computed, accounts, t0, settings.accountPrefs, usd);
  const begin = balancesAt(computed, start);
  const counted = accounts.filter((a) => !a.archived && a.type !== "report" && a.type !== "person" && !settings.accountPrefs?.[a.id]?.excludeTotal).sort((a, b) => a.sort - b.sort);
  const dd = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
  const monthEntries = computed.ok.filter((e) => e.status === "ok" && !e.disabled && e.date >= start && e.date <= t0 && e.currency);
  const incomes = monthEntries.filter((e) => e.type === "income");
  const expenses = monthEntries.filter((e) => e.type === "expense");
  const exchanges = monthEntries.filter((e) => e.type === "transfer" && e.exchange && e.pairPrimary);
  const sumBegin = counted.reduce((s2, a) => s2 + (begin[a.code]?.UZS || 0) + (usd ? (begin[a.code]?.USD || 0) * usd : 0), 0);
  const diffBegin = Math.round(m.borEdi - sumBegin);

  // Taqsimot
  const plan: MonthPlanItem[] = settings.monthPlan || [];
  const setPlan = (next: MonthPlanItem[]) => updateSettings({ monthPlan: next });
  const itemUZS = (it: MonthPlanItem) => it.currency === "UZS" ? it.amount * 1000 : usd ? it.amount * usd : 0;
  const planSum = plan.reduce((t, it) => t + itemUZS(it), 0);
  const planRem = m.jami - planSum;
  const planDaily = planRem / 30;
  const daysPassed = Math.max(1, +t0.slice(8, 10));
  const avgDaily = m.sarflandi / daysPassed;

  // Kunlik chiqimlar
  const byDay: { date: string; uzs: number; usd: number; n: number }[] = [];
  for (const e of expenses) {
    let r = byDay[byDay.length - 1];
    if (!r || r.date !== e.date) { r = { date: e.date, uzs: 0, usd: 0, n: 0 }; byDay.push(r); }
    if (e.currency === "USD") r.usd += -e.amount!; else r.uzs += -e.amount!;
    r.n++;
  }

  const Row = ({ d, showD, acc, txt, amt, cls }: { d?: string; showD?: boolean; acc?: string; txt?: string; amt: string; cls?: string }) => (
    <div className="reprow">
      {d !== undefined && <span className="rd">{showD ? dd(d) : ""}</span>}
      {acc !== undefined && <span className="racc">{acc}</span>}
      <span className="rtxt">{txt || ""}</span>
      <span className={"ramt " + (cls || "")}>{amt}</span>
    </div>
  );
  let lastD = "";
  const withD = (d: string) => { const show = d !== lastD; lastD = d; return show; };

  return (
    <Modal open={open} onClose={onClose} title="Bu oy — hisobot" action={
      <button type="button" className={"iconbtn ghost" + (edit ? " on" : "")} style={{ width: 32, height: 32, minHeight: 32, ...(edit ? { background: "var(--move-bg)", color: "var(--move)" } : {}) }} onClick={() => setEdit((v) => !v)} aria-label="Taqsimotni tahrirlash" title="Taqsimotni tahrirlash">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 3.5l4 4L8 20l-5 1 1-5z"/></svg>
      </button>
    }>
      <div className="repstat">
        <div><small>Bor edi</small><b>{short(m.borEdi)}</b></div>
        <div><small>+ Oylik</small><b className="amt in">{short(m.income)}</b></div>
        <div><small>= Jami</small><b>{short(m.jami)}</b></div>
        <div><small>Qoldi</small><b className="amt in">{short(m.qoldi)}</b></div>
        <div><small>Sarflandi</small><b className="amt out">{short(m.sarflandi)}</b></div>
      </div>
      {m.usdApplied && <p className="hint" style={{ margin: "4px 0 0" }}>$ hisoblar CBU kursi bilan so'mga aylantirib qo'shilgan.</p>}

      <div className="repsec">
        <h3>Taqsimot <span className={`chip ${planRem >= 0 ? "ok" : "warn"}`}>{plan.length ? short(planSum) : "yo'q"}</span></h3>
        {!edit && plan.length === 0 && <p className="hint">Taqsimot kiritilmagan — yuqoridagi ✎ bilan qo'shing (Sirdaryo, Kvartira, AI obunalar…).</p>}
        {!edit && plan.map((it) => (
          <Row key={it.id} txt={it.name || "…"} amt={it.currency === "USD" ? `${num(it.amount)} $${usd ? " ≈ " + short(it.amount * usd) : ""}` : short(it.amount * 1000)} />
        ))}
        {edit && <>
          {plan.map((it) => (
            <div key={it.id} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
              <input value={it.name} placeholder="Nomi (Sirdaryo, Kvartira…)" onChange={(e) => setPlan(plan.map((x) => x.id === it.id ? { ...x, name: e.target.value } : x))} style={{ flex: 1, minWidth: 0, fontSize: 13.5, padding: "8px 10px" }} />
              <input inputMode="decimal" value={it.amount || ""} placeholder="0" onChange={(e) => { const v = Number(e.target.value.replace(/[^\d.]/g, "")) || 0; setPlan(plan.map((x) => x.id === it.id ? { ...x, amount: v } : x)); }} style={{ width: 84, fontSize: 13.5, padding: "8px 8px", textAlign: "right" }} aria-label="Summa" />
              <select value={it.currency} onChange={(e) => setPlan(plan.map((x) => x.id === it.id ? { ...x, currency: e.target.value as "UZS" | "USD" } : x))} aria-label="Valyuta" style={{ width: "auto", fontSize: 12.5, padding: "8px 4px" }}>
                <option value="UZS">ming</option>
                <option value="USD">$</option>
              </select>
              <button type="button" className="ghost small" onClick={() => setPlan(plan.filter((x) => x.id !== it.id))} aria-label="O'chirish" style={{ padding: "4px 8px" }}>✕</button>
            </div>
          ))}
          <button type="button" className="ghost small" style={{ marginTop: 8 }} onClick={() => setPlan([...plan, { id: crypto.randomUUID(), name: "", amount: 0, currency: "UZS" }])}>+ Qator qo'shish</button>
          {plan.some((it) => it.currency === "USD") && !usd && <p className="hint" style={{ margin: "6px 0 0" }}>$ qatorlar kurs yuklanmagani uchun jamiga kirmadi.</p>}
        </>}
        {plan.length > 0 && <div className="repsum"><span>Sarflash uchun qoldi</span><b className={planRem >= 0 ? "amt in" : "amt out"}>{short(planRem)}</b></div>}
        {plan.length > 0 && planRem >= 0 && (
          <div style={{ marginTop: 6 }}>
            <Row txt="Kunlik maksimal (qoldi ÷ 30)" amt={short(planDaily)} />
            <Row txt={`Shu oy o'rtacha kunlik sarf (${daysPassed} kun)`} amt={short(avgDaily)} cls={avgDaily <= planDaily ? "amt in" : "amt out"} />
          </div>
        )}
        {plan.length > 0 && planRem < 0 && (
          <p className="hint" style={{ margin: "6px 0 0" }}>⚠️ Sarflash uchun qoldi hozircha minusda. Oylikning qolgan qismi (masalan, naqd 2-qism) hali tushmagan bo'lsa, u kirishi bilan «Jami» oshadi va bu minus o'z-o'zidan yopiladi — taqsimotni o'zgartirish shart emas.</p>
        )}
        {plan.length > 0 && planRem > 0 && (
          <div style={{ marginTop: 8 }}>
            <p className="hint" style={{ margin: "0 0 2px" }}>💡 Tejash: kuniga kamroq sarflasangiz, keyingi oylikkacha ortib qoladi:</p>
            {[0.1, 0.25, 0.5].map((pr) => (
              <Row key={pr} txt={`Kuniga ~${short(planDaily * (1 - pr))} bilan (−${Math.round(pr * 100)}%)`} amt={"+" + short(planRem * pr)} cls="amt in" />
            ))}
          </div>
        )}
      </div>

      <div className="repsec">
        <h3>Oy boshida hisoblarda <span className="chip">{dd(start)}</span></h3>
        {counted.map((a) => {
          const u = begin[a.code]?.UZS || 0, d = begin[a.code]?.USD || 0;
          if (!u && !d) return null;
          return <Row key={a.id} acc={a.code} txt={a.name !== a.code ? a.name : ""} amt={[u ? money(u) : "", d ? money(d, "USD") : ""].filter(Boolean).join(" | ")} />;
        })}
        <div className="repsum"><span>Jami</span><b>{short(sumBegin)}</b></div>
        {Math.abs(diffBegin) > 1000 && <p className="hint" style={{ margin: "4px 0 0" }}>Formula bilan farq {short(diffBegin)} — qarz, tafovut yoki konvert harakatlari hisobiga.</p>}
      </div>

      <div className="repsec">
        <h3>Kirimlar <span className="chip ok">{short(m.income)} · {incomes.length} ta</span></h3>
        {incomes.length === 0 && <p className="hint">Bu oy kirim yozilmagan.</p>}
        {(lastD = "") || incomes.map((e) => <Row key={e.key} d={e.date} showD={withD(e.date)} acc={e.account} txt={e.tail || ""} amt={"+" + short(e.amount!, e.currency)} cls="amt in" />)}
      </div>

      {exchanges.length > 0 && (
        <div className="repsec">
          <h3>Ayirboshlash <span className="chip">{exchanges.length} ta</span></h3>
          {(lastD = "") || exchanges.map((e) => <Row key={e.key} d={e.date} showD={withD(e.date)} acc={e.account} txt={`→ ${e.counterparty} ga o'tkazildi`} amt={short(Math.abs(e.amount!))} />)}
        </div>
      )}

      <div className="repsec">
        <h3>Kunlik chiqimlar <span className="chip warn">{short(m.sarflandi)} · {expenses.length} ta</span></h3>
        {byDay.length === 0 && <p className="hint">Bu oy chiqim yozilmagan.</p>}
        {byDay.map((r) => <Row key={r.date} d={r.date} showD acc={`${r.n} ta`} txt="" amt={[r.uzs ? "−" + short(r.uzs) : "", r.usd ? "−" + short(r.usd, "USD") : ""].filter(Boolean).join(" | ")} cls="amt out" />)}
      </div>

      <div className="repsec">
        <h3>Hozir hisoblarda</h3>
        {counted.map((a) => {
          const row = computed.balances[a.code] || {};
          const cells = Object.entries(row).filter(([, b]) => b && (b.known || b.value !== 0));
          if (!cells.length) return null;
          return <Row key={a.id} acc={a.code} txt={a.name !== a.code ? a.name : ""} amt={cells.map(([cur, b]) => money(b!.value, cur as Currency) + (b!.known ? "" : " ·?")).join(" | ")} />;
        })}
        <div className="repsum"><span>Qoldi</span><b className="amt in">{short(m.qoldi)}</b></div>
      </div>
    </Modal>
  );
}
