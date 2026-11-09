// Nazorat: qoidaga asoslangan aniq xulosalar (sabab + summa + keyingi harakat).
// Bu AI emas — faqat sizning yozuvlaringizdagi raqamlar.

import type { Account, Computed, Settings } from "./types";
import { daysBetween, daysInMonth, monthEnd, monthOf, monthStart, shiftDate, shiftMonth } from "./dates";
import { byCategory, debts, flow, monthlySeries, periodFor, totals } from "./stats";
import { money, short, pct, num, signed } from "./format";

export interface Insight {
  id: string;
  icon: string; // emoji
  title: string; // qisqa yorliq (summasiz)
  metric?: string; // asosiy raqam — rangli ko'rsatiladi
  metricCls?: "in" | "out" | "warn" | "move";
  text: string;
  action?: string;
  severity: "info" | "good" | "warn" | "bad";
  go?: "editor" | "history" | "stats" | "accounts" | "ai";
}

export function buildInsights(c: Computed, accounts: Account[], settings: Settings, todayStr: string): Insight[] {
  const out: Insight[] = [];
  const ok = c.ok;
  const ym = monthOf(todayStr);
  const dim = daysInMonth(ym);
  const dayOfMonth = +todayStr.slice(8, 10);
  const daysLeft = dim - dayOfMonth;

  const todayP = { from: todayStr, to: todayStr, label: "Bugun" };
  const last30 = { from: shiftDate(todayStr, -30), to: shiftDate(todayStr, -1), label: "Oldingi 30 kun" };
  const fToday = flow(ok, todayP, "UZS", accounts);
  const f30 = flow(ok, last30, "UZS", accounts);
  const activeDays30 = new Set(ok.filter((e) => e.type === "expense" && e.currency === "UZS" && e.date >= last30.from && e.date <= last30.to).map((e) => e.date)).size;
  const avgDaily = f30.expense / 30;

  // 1. Bugungi chiqim odatdagiga nisbatan
  if (fToday.expense > 0 && f30.expense > 0) {
    const diff = fToday.expense - avgDaily;
    const ratio = avgDaily ? fToday.expense / avgDaily : 0;
    const topToday = byCategory(ok, todayP, "UZS")[0];
    const projected = fToday.expense + avgDaily * daysLeft + flow(ok, { from: monthStart(ym), to: shiftDate(todayStr, -1), label: "" }, "UZS", accounts).expense;
    out.push({
      id: "today-expense",
      icon: "💸",
      severity: ratio >= 2 ? "bad" : ratio >= 1.3 ? "warn" : "good",
      title: diff > 0 ? "Bugun odatdagidan ko'p sarflandi" : "Bugun odatdagidan kam sarflandi",
      metric: (diff > 0 ? "+" : "−") + short(Math.abs(diff)),
      metricCls: diff > 0 ? "out" : "in",
      text: `Bugungi chiqim ${money(fToday.expense)}; oxirgi 30 kundagi kunlik o'rtacha ${money(Math.round(avgDaily))} (${activeDays30} kunda yozuv bor).${topToday ? ` Eng kattasi: ${topToday.category} — ${money(topToday.amount)}.` : ""}`,
      action: diff > 0
        ? `Shu sur'at davom etsa oy oxirida chiqim ≈ ${short(projected)} bo'ladi. ${topToday ? `"${topToday.category}" toifasini ertaga cheklab ko'ring.` : ""}`
        : `Shu sur'atda oy oxiridagi taxminiy chiqim ≈ ${short(projected)}.`,
      go: "stats",
    });
  } else if (fToday.expense === 0 && f30.expense > 0) {
    out.push({
      id: "today-none",
      icon: "💤",
      severity: "info",
      title: "Bugun hali chiqim yozilmagan",
      text: `Odatdagi kunlik o'rtacha ${money(Math.round(avgDaily))}. Agar xarajat bo'lgan bo'lsa — bir satr yozing: masalan, "N -24 obed".`,
      go: "editor",
    });
  }

  // 2. Bugungi kirim
  if (fToday.income > 0) {
    out.push({
      id: "today-income",
      icon: "💰",
      severity: "good",
      title: "Bugun kirim bo'ldi",
      metric: "+" + short(fToday.income),
      metricCls: "in",
      text: `Oxirgi 30 kundagi jami kirim ${money(f30.income)}.`,
      action: fToday.income >= 1_000_000 ? "Katta kirimning bir qismini darhol ajratib qo'ysangiz (Uy yoki omonat), sarflab yuborish xavfi kamayadi." : undefined,
    });
  }

  // 3. Oylik prognoz va limit
  const monthSoFar = flow(ok, { from: monthStart(ym), to: todayStr, label: "" }, "UZS", accounts);
  const prevM = shiftMonth(ym, -1);
  const prevMonth = flow(ok, { from: monthStart(prevM), to: monthEnd(prevM), label: "" }, "UZS", accounts);
  if (monthSoFar.expense > 0 && dayOfMonth >= 3) {
    const pace = monthSoFar.expense / dayOfMonth;
    const projected = pace * dim;
    const vsPrev = prevMonth.expense ? projected / prevMonth.expense - 1 : null;
    const budget = settings.budget || 0;
    let sev: Insight["severity"] = "info";
    let action: string | undefined;
    if (budget) {
      const left = budget - monthSoFar.expense;
      if (left < 0) { sev = "bad"; action = `Limit ${money(-left)} ga oshib ketdi. Qolgan ${daysLeft} kunda faqat zarur xarajatlar.`; }
      else {
        const perDay = daysLeft > 0 ? left / daysLeft : left;
        sev = projected > budget ? "warn" : "good";
        action = `Limitgacha ${money(left)} qoldi — kuniga o'rtacha ${money(Math.round(perDay))} sarflash mumkin.`;
      }
    } else action = "Oylik limit qo'ysangiz, qolgan kunlar uchun kunlik imkoniyat avtomatik hisoblanadi.";
    out.push({
      id: "month-projection",
      icon: "📅",
      severity: sev,
      title: "Oy oxiri chiqim prognozi" + (budget ? ` (limit ${short(budget)})` : ""),
      metric: "≈" + short(projected),
      metricCls: sev === "good" ? "in" : sev === "info" ? "move" : "out",
      text: `${dayOfMonth} kunda ${money(monthSoFar.expense)} sarflandi, kunlik sur'at ${money(Math.round(pace))}.${vsPrev !== null ? ` O'tgan oyga nisbatan ${vsPrev >= 0 ? "+" : ""}${pct(vsPrev * 100)} (o'tgan oy: ${short(prevMonth.expense)}).` : " O'tgan oy ma'lumoti yo'q."}`,
      action,
      go: "stats",
    });
  }

  // 4. Jamg'arish sur'ati va maqsad
  const ms = monthlySeries(ok, "UZS", todayStr, 4).slice(0, 3); // o'tgan 3 to'liq oy
  const fullMonths = ms.filter((m) => m.income > 0 || m.expense > 0);
  const avgNet = fullMonths.length ? fullMonths.reduce((s, m) => s + m.net, 0) / fullMonths.length : 0;
  if (settings.goalTarget > 0) {
    const remaining = Math.max(0, settings.goalTarget - settings.goalSaved);
    const planMonthly = settings.goalMonthly || 0;
    const paceMonthly = Math.max(0, avgNet);
    const parts: string[] = [];
    if (planMonthly) parts.push(`rejangiz bo'yicha (${short(planMonthly)}/oy) ≈ ${Math.ceil(remaining / planMonthly)} oy`);
    if (paceMonthly > 0) parts.push(`haqiqiy sur'at bo'yicha (o'rtacha sof ${short(paceMonthly)}/oy) ≈ ${Math.ceil(remaining / paceMonthly)} oy`);
    out.push({
      id: "goal",
      icon: "🎯",
      severity: remaining === 0 ? "good" : paceMonthly > 0 && planMonthly && paceMonthly < planMonthly ? "warn" : "info",
      title: remaining === 0 ? `Maqsadga yetildi: ${settings.goalName || "maqsad"}` : `${settings.goalName || "Maqsad"} — yana kerak:`,
      metric: remaining === 0 ? "100%" : short(remaining),
      metricCls: remaining === 0 ? "in" : "move",
      text: `${pct(settings.goalTarget ? (settings.goalSaved / settings.goalTarget) * 100 : 0)} yig'ilgan (${money(settings.goalSaved)} / ${money(settings.goalTarget)}). ${parts.length ? "Muddat: " + parts.join("; ") + "." : "Oylik reja kiriting yoki 1–2 oy yozuv to'plang — muddat hisoblanadi."}`,
      action: paceMonthly > 0 && planMonthly && paceMonthly < planMonthly
        ? `Haqiqiy sur'at rejadan ${short(planMonthly - paceMonthly)}/oy kam. Yo chiqimni shu miqdorga qisqartiring, yo muddatni uzaytiring.`
        : avgNet < 0 ? `Oxirgi oylarda chiqim kirimdan ${short(-avgNet)}/oy ko'p — bu sur'atda jamg'arma o'smaydi.` : undefined,
    });
  } else if (fullMonths.length >= 1) {
    out.push({
      id: "net-pace",
      icon: "🎯",
      severity: avgNet > 0 ? "good" : "warn",
      title: avgNet > 0 ? "Pul ortib bormoqda" : "Pul kamayib bormoqda",
      metric: signed(avgNet) + "/oy",
      metricCls: avgNet > 0 ? "in" : "out",
      text: `Oxirgi ${fullMonths.length} to'liq oy bo'yicha kirim − chiqim. Maqsad (masalan, uy uchun boshlang'ich to'lov) kiritsangiz, qachon yetishingiz hisoblanadi.`,
      go: "stats",
    });
  }

  // 5. Qarzlar
  const ds = debts(c, accounts);
  for (const d of ds) {
    if (!d.known && d.value === 0) continue;
    const amtTxt = (v: number) => (d.cur === "UZS" ? num(v / 1000) : num(v) + "$");
    out.push({
      id: "debt-" + d.account.code + "-" + d.cur,
      icon: "🤝",
      severity: d.value < 0 ? "warn" : "info",
      title: d.value >= 0 ? `${d.account.name} — sizga qarzdor:` : `${d.account.name} — siz qarzdorsiz:`,
      metric: short(Math.abs(d.value), d.cur),
      metricCls: d.value >= 0 ? "in" : "out",
      text: `${d.known ? "Qoldiq tasdiqlangan" : "Boshlang'ich qoldiq yozilmagan — faqat harakatlar yig'indisi"}. Bu summa mavjud pulga qo'shilmagan.`,
      action: d.value > 0 ? `Qaytganda: "N +${amtTxt(d.value)} ${d.account.code}" deb yozing.` : d.value < 0 ? `Qaytarganda: "N -${amtTxt(-d.value)} ${d.account.code}" deb yozing.` : undefined,
      go: "accounts",
    });
  }

  // 6. Ma'lumot sifati
  const pend = c.issues.filter((i) => ["pending", "unknown_account", "unclear"].includes(i.kind)).length;
  const diffs = c.issues.filter((i) => i.kind === "snapshot_diff" || i.kind === "expected_mismatch");
  const pairs = c.issues.filter((i) => i.kind === "possible_pair").length;
  const t = totals(c, accounts, "UZS");
  if (pend || diffs.length || pairs || t.known < t.all) {
    const diffSum = diffs.reduce((s, i) => s + (i.amount || 0), 0);
    out.push({
      id: "quality",
      icon: "🔍",
      severity: pend || pairs ? "warn" : "info",
      title: `Tekshirish: ${pend} chala · ${diffs.length} tafovut · ${pairs} juftlik`,
      metric: String(pend + diffs.length + pairs) + " ta",
      metricCls: "warn",
      text: `${t.known}/${t.all} hisobning qoldig'i tasdiqlangan.${diffs.length ? ` Tafovutlar yig'indisi ${diffSum >= 0 ? "+" : ""}${short(diffSum)} — bu kirim/chiqimga qo'shilmagan.` : ""} Chala satrlar hisobga kirmaydi, shuning uchun prognozlar haqiqiy xarajatdan kam ko'rsatishi mumkin.`,
      action: pend ? "Chala satrlarni to'ldiring — har biri 10 soniya." : t.known < t.all ? `Qoldig'i noma'lum hisoblar uchun "K = 1085" kabi yozing.` : undefined,
      go: "history",
    });
  }

  // 7. Bo'sh turgan pul
  if (t.home > 0) {
    out.push({
      id: "idle",
      icon: "🏦",
      severity: "info",
      title: "Uyda foizsiz turibdi:",
      metric: short(t.home),
      metricCls: "move",
      text: `Bu pul foiz keltirmayapti. Bank omonatlari stavkasi va shartlari tez o'zgaradi — AI markazida rasmiy manbalar bilan tekshiring, keyin omonat kalkulyatorida foydani hisoblang.`,
      action: "AI markazi → «Omonat takliflarini tekshir».",
      go: "ai",
    });
  }

  return out;
}

export { daysBetween };
