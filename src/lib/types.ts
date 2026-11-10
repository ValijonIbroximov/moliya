// Moliya AI — umumiy turlar

export type AccountType = "cash" | "card" | "home" | "person" | "other" | "report";
export type Currency = "UZS" | "USD" | "EUR" | "RUB";
export const CURRENCIES: Currency[] = ["UZS", "USD", "EUR", "RUB"];

export interface Account {
  id: string;
  code: string; // "K"
  name: string; // "Karta •••• 3665"
  type: AccountType;
  currency: Currency; // standart valyuta (satrda $ yozilsa USD bo'ladi)
  aliases: string[]; // ["naqd"]
  color: string;
  sort: number;
  archived: boolean;
  updated_at: string;
}

export interface Note {
  id: string;
  raw: string; // xom matn — o'zgarmas manba
  note_date: string; // YYYY-MM-DD, sana sarlavhasi bo'lmagan satrlar uchun
  unit: 1 | 1000; // 1 = 1 000 so'm (odatiy) yoki 1 = 1 so'm
  disabled?: boolean; // faolsizlantirilgan: ko'rinadi, lekin hisobga kirmaydi
  deleted: boolean;
  created_at: string;
  updated_at: string;
}

/** "Bu oy" taqsimoti qatori: nomi + summa (USD bo'lsa kurs bo'yicha so'mga aylantiriladi) */
export interface MonthPlanItem {
  id: string;
  name: string;
  amount: number; // ming so'm/dollar emas — oddiy birlikda (so'm yoki $)
  currency: "UZS" | "USD";
}

/** Hisobning ko'rinish sozlamalari (Settings ichida saqlanadi — jadval o'zgartirish talab qilmaydi) */
export interface AccountPref {
  hideHome?: boolean; // bosh sahifadagi qoldiq qatorida ko'rsatilmasin
  excludeTotal?: boolean; // umumiy (tasdiqlangan) pulga qo'shilmasin
}

/** Rejalashtirilgan to'lov yoki eslatma (kvartira, pochta puli...) */
export interface Plan {
  id: string;
  name: string;
  uzs: number; // so'mda (0 bo'lishi mumkin)
  usd: number; // dollarda (0 bo'lishi mumkin)
  day: number; // oyning kuni (1-31); 0 = kunsiz eslatma
  recurring: boolean; // har oy takrorlanadi
  account?: string; // qaysi hisobdan to'lanadi
  lastDone?: string; // oxirgi bajarilgan oy (YYYY-MM)
}

export interface Settings {
  budget: number; // oylik chiqim chegarasi, so'm
  goalName: string;
  goalTarget: number;
  goalSaved: number;
  goalMonthly: number;
  confirmedPairs: string[]; // "sigA~sigB"
  rejectedPairs: string[];
  provider: "openai" | "anthropic" | "gemini";
  ui?: { zoom: number; tile: number }; // interfeys masshtabi (%) va hisob katagi o'lchami (px)
  defaultUnit?: 1 | 1000; // yangi yozuvlar birligi: 1 = 1 000 so'm (odatiy) yoki 1 = 1 so'm
  accountPrefs?: Record<string, AccountPref>; // hisob id -> ko'rinish/jami sozlamalari
  monthPlan?: MonthPlanItem[]; // "Bu oy" taqsimoti (Tahlil)
  widgets?: string[]; // Yozuv ekranidagi vidjetlar
  autoAi?: boolean; // ochilganda kuniga bir marta avtomatik tahlil
  plans?: Plan[];
  lastAi?: AiResult | null;
  updated_at: string;
}

export const defaultSettings = (): Settings => ({
  budget: 0,
  goalName: "",
  goalTarget: 0,
  goalSaved: 0,
  goalMonthly: 0,
  confirmedPairs: [],
  rejectedPairs: [],
  provider: "openai",
  lastAi: null,
  updated_at: new Date(0).toISOString(),
});

export type EntryStatus =
  | "ok"
  | "pending" // hisob/amal/summa yetishmaydi
  | "unknown_account" // noma'lum qisqartma
  | "unclear" // birlik/valyuta noaniq yoki buzilgan yozuv
  | "note" // eslatma satri (# bilan) — hisobga kirmaydi, tekshiruv talab qilmaydi
  | "header" // sana sarlavhasi
  | "empty";

export type EntryType = "income" | "expense" | "transfer" | "snapshot" | "debt" | "total";

export interface QuickFix {
  label: string;
  line: string; // satrning yangi matni
}

export interface Entry {
  key: string; // noteId:line
  noteId: string;
  line: number;
  raw: string;
  date: string;
  status: EntryStatus;
  reason?: string;
  fixes?: QuickFix[];
  account?: string; // kanonik kod
  counterparty?: string; // o'tkazma ikkinchi tomoni
  explicit?: boolean; // "C -> K 100"
  sent?: boolean; // "Sirdaryo => 20000" — konvertdan jo'natish, majburiy chiqim
  amount?: number; // hisobga ta'siri (ishorali, to'liq birlikda)
  currency?: Currency;
  multiplier?: number; // qo'llangan birlik (1 yoki 1000 ...)
  unitExplicit?: boolean; // satrda birlik yozilganmi
  expected?: number; // "= 3447"
  type?: EntryType;
  category?: string;
  comment?: string;
  tail?: string;
  uncertain?: boolean; // "?" bor
  disabled?: boolean; // yozuv faolsizlantirilgan — hisobga kirmaydi
  unknownCode?: string;
  // compute() tomonidan to'ldiriladi
  pairedWith?: string; // juftlashgan satr kaliti
  pairPrimary?: boolean;
  exchange?: boolean; // valyuta ayirboshlash juftligi (har tomon o'z valyutasida) // juftlikda balansga qo'llangan tomon
  diff?: number; // qoldiq tafovuti (snapshot / kutilgan)
  balanceAfter?: number;
  sig?: string; // juftlik imzosi
}

export interface BalanceCell {
  value: number;
  known: boolean;
  lastSnapshot?: string;
}
export type Balances = Record<string, Partial<Record<Currency, BalanceCell>>>;

export type IssueKind =
  | "snapshot_diff"
  | "expected_mismatch"
  | "possible_pair"
  | "uncertain"
  | "pending"
  | "unknown_account"
  | "unclear";

export interface Issue {
  kind: IssueKind;
  entry: Entry;
  other?: Entry;
  amount?: number;
  currency?: Currency;
  text: string;
  pairSig?: string;
}

export interface Computed {
  entries: Entry[]; // barcha satrlar (sana bo'yicha tartiblangan)
  ok: Entry[];
  balances: Balances;
  issues: Issue[];
  knownCategories: string[];
  comments: string[];
}

export interface AiSource {
  nom: string;
  url: string;
  tekshirilgan?: string;
}
export interface AiSuggestion {
  sarlavha: string;
  turi: string;
  sabab: string;
  summa?: string;
  harakat: string;
  shartlar?: string;
  farazlar?: string;
  ishonch?: string;
  manbalar: AiSource[];
}
export interface AiResult {
  provider: string;
  model: string;
  at: string;
  xulosa: string;
  takliflar: AiSuggestion[];
  kamchiliklar?: string;
  raw?: string;
}
