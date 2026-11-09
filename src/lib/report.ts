// AI uchun hisobot: faqat yig'ma raqamlar (xom matn yuborilmaydi)

import type { Account, Computed, Settings } from "./types";
import { monthEnd, monthOf, monthStart, shiftDate, shiftMonth } from "./dates";
import { byCategory, debts, flow, monthlySeries, totals } from "./stats";
import { buildInsights } from "./insights";

export interface Report {
  tayyorlandi: string;
  vaqt_zonasi: string;
  bugun: string;
  valyuta: string;
  birlik: string;
  hisoblar: { kod: string; nom: string; tur: string; valyuta: string; qoldiq: number | null; tasdiqlangan: boolean; oxirgi_tasdiq?: string }[];
  jami: { mavjud_pul: number; uyda: number; naqd_va_karta: number; tasdiqlangan_hisoblar: string };
  qarzlar: { kim: string; summa: number; valyuta: string; izoh: string }[];
  oqim: Record<string, { kirim: number; chiqim: number; sof: number; kunlik_ortacha_chiqim: number; yozuvlar: number; davr: string }>;
  toifalar_30_kun: { toifa: string; summa: number; ulush: string; soni: number }[];
  oylar: { oy: string; kirim: number; chiqim: number; sof: number }[];
  bugungi: { kirim: number; chiqim: number };
  sifat: { chala_satrlar: number; tafovutlar_soni: number; tafovutlar_yigindisi: number; ehtimoliy_juftliklar: number; izoh: string };
  limit_va_maqsad: { oylik_limit: number; maqsad: string; kerak: number; yigilgan: number; oyiga_reja: number };
  mahalliy_xulosalar: string[];
  kurs?: { usd: number; eur?: number; sana: string; manba: string };
}

export function buildReport(c: Computed, accounts: Account[], settings: Settings, todayStr: string, rate?: Report["kurs"]): Report {
  const ym = monthOf(todayStr);
  const prev = shiftMonth(ym, -1);
  const p30 = { from: shiftDate(todayStr, -29), to: todayStr, label: "30 kun" };
  const pm = { from: monthStart(ym), to: todayStr, label: "joriy oy" };
  const pp = { from: monthStart(prev), to: monthEnd(prev), label: "o'tgan oy" };
  const f30 = flow(c.ok, p30, "UZS", accounts);
  const fm = flow(c.ok, pm, "UZS", accounts);
  const fp = flow(c.ok, pp, "UZS", accounts);
  const t = totals(c, accounts, "UZS", settings.accountPrefs);
  const mk = (f: typeof f30, davr: string) => ({ kirim: f.income, chiqim: f.expense, sof: f.net, kunlik_ortacha_chiqim: Math.round(f.expense / f.days), yozuvlar: f.count, davr });
  const diffs = c.issues.filter((i) => i.kind === "snapshot_diff" || i.kind === "expected_mismatch");
  const pend = c.issues.filter((i) => ["pending", "unknown_account", "unclear"].includes(i.kind)).length;
  return {
    tayyorlandi: new Date().toISOString(),
    vaqt_zonasi: "Asia/Tashkent",
    bugun: todayStr,
    valyuta: "UZS (so'm); USD alohida ko'rsatilgan bo'lsa — kurssiz aralashtirilmaydi",
    birlik: "barcha summalar to'liq so'mda",
    hisoblar: accounts.filter((a) => !a.archived).map((a) => {
      const b = c.balances[a.code]?.[a.currency];
      return { kod: a.code, nom: a.name, tur: a.type, valyuta: a.currency, qoldiq: b?.known ? b.value : null, tasdiqlangan: !!b?.known, oxirgi_tasdiq: b?.lastSnapshot };
    }),
    jami: { mavjud_pul: t.total, uyda: t.home, naqd_va_karta: t.active, tasdiqlangan_hisoblar: `${t.known}/${t.all}` },
    qarzlar: debts(c, accounts).map((d) => ({ kim: d.account.name, summa: d.value, valyuta: d.cur, izoh: d.value >= 0 ? "menga qarzdor" : "men qarzdorman" })),
    oqim: { oxirgi_30_kun: mk(f30, `${p30.from} — ${p30.to}`), joriy_oy: mk(fm, `${pm.from} — ${pm.to}`), otgan_oy: mk(fp, `${pp.from} — ${pp.to}`) },
    toifalar_30_kun: byCategory(c.ok, p30, "UZS").slice(0, 12).map((r) => ({ toifa: r.category, summa: r.amount, ulush: Math.round(r.share * 100) + "%", soni: r.count })),
    oylar: monthlySeries(c.ok, "UZS", todayStr, 6).map((m) => ({ oy: m.ym, kirim: m.income, chiqim: m.expense, sof: m.net })),
    bugungi: (() => { const f = flow(c.ok, { from: todayStr, to: todayStr, label: "" }, "UZS", accounts); return { kirim: f.income, chiqim: f.expense }; })(),
    sifat: {
      chala_satrlar: pend,
      tafovutlar_soni: diffs.length,
      tafovutlar_yigindisi: diffs.reduce((s, i) => s + (i.amount || 0), 0),
      ehtimoliy_juftliklar: c.issues.filter((i) => i.kind === "possible_pair").length,
      izoh: "Chala satrlar hisobga kirmagan; haqiqiy xarajat yuqoriroq bo'lishi mumkin. Tafovutlar kirim/chiqimga qo'shilmagan.",
    },
    limit_va_maqsad: { oylik_limit: settings.budget, maqsad: settings.goalName, kerak: settings.goalTarget, yigilgan: settings.goalSaved, oyiga_reja: settings.goalMonthly },
    mahalliy_xulosalar: buildInsights(c, accounts, settings, todayStr).map((i) => `${i.title}. ${i.text}`),
    kurs: rate,
  };
}

export const AI_QUESTION_DEFAULT =
  "Mening moliyaviy holatimni tahlil qil. 1) Bo'sh turgan pulni qaysi O'zbekiston bankidagi qaysi muddatli omonatga qo'yish mumkin — bugungi rasmiy stavkalarni banklarning rasmiy saytlaridan tekshir va foydani hisobla. 2) Xarajatlarim qayerda odatdagidan ko'p, nimani qisqartirish mumkin. 3) Shu jamg'arish sur'atida uy uchun boshlang'ich to'lovga qachon yetaman — Toshkentdagi ikki xonali uylarning joriy narxini manba bilan ayt. 4) Pulni ko'paytirish variantlari va ularning shartlari. 5) Dollar kursidagi muhim o'zgarishlar.";

export function reportAsText(r: Report, question: string): string {
  return `${question}

QOIDALAR: O'zbek tilida javob ber. Faqat quyidagi raqamlarga tayan; ma'lumot to'liq bo'lmasligi mumkin (chala satrlar hisobga kirmagan). Qarz, o'tkazma, qoldiq tuzatishi va kirimni aralashtirma. Valyutalarni kurssiz jamlama. Har taklif uchun: sabab, aniq summa, keyingi harakat, shartlar, farazlar, rasmiy manba URL va tekshirilgan sana. Stavka, kurs yoki uy narxini o'ylab topma — internetdan tekshira olmasang, shuni ayt.

MA'LUMOTLAR (JSON):
${JSON.stringify(r, null, 2)}`;
}
