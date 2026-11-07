import { describe, it, expect } from "vitest";
import { parseNote, indexAccounts, parseLine, evalExpr } from "@/lib/parser";
import { compute, getCell } from "@/lib/compute";
import { defaultSettings, type Account, type Note } from "@/lib/types";
import { parseDateHeader } from "@/lib/dates";

const mk = (code: string, name: string, type: Account["type"], currency: Account["currency"] = "UZS", aliases: string[] = []): Account => ({
  id: "acc-" + code, code, name, type, currency, aliases, color: "#000", sort: 0, archived: false, updated_at: "2026-01-01T00:00:00Z",
});
const accounts: Account[] = [
  mk("Uy", "Uyda saqlanayotgan pul", "home", "UZS", ["uy"]),
  mk("N", "Naqd", "cash", "UZS", ["naqd"]),
  mk("K", "Karta 3665", "card"),
  mk("C", "Karta 3445", "card"),
  mk("J", "Javohir", "person", "UZS", ["javohir"]),
  mk("U", "Uzum Visa", "card"),
  mk("T", "TBC Visa", "card"),
];
const idx = indexAccounts(accounts);
const TODAY = "2026-11-07";
const note = (raw: string, date = TODAY, id = "n1", created = "2026-11-07T10:00:00Z", unit: 1 | 1000 = 1000): Note => ({
  id, raw, note_date: date, unit, deleted: false, created_at: created, updated_at: created,
});
const ctx = { accounts: idx, noteDate: TODAY, unit: 1000 as const, today: TODAY };

describe("evalExpr", () => {
  it("handles compound expressions", () => {
    expect(evalExpr("-24-12")).toBe(-36);
    expect(evalExpr("-52+66")).toBe(14);
    expect(evalExpr("2,5")).toBe(2.5);
    expect(evalExpr("1 000")).toBe(1000);
    expect(evalExpr("--3")).toBeNull();
  });
});

describe("date headers", () => {
  it("parses dd.mm with year inference", () => {
    expect(parseDateHeader("07.11", TODAY, TODAY)).toBe("2026-11-07");
    expect(parseDateHeader("20.08", TODAY, TODAY)).toBe("2026-08-20");
    expect(parseDateHeader("28.12", "2026-01-02", "2026-01-02")).toBe("2025-12-28");
    expect(parseDateHeader("20.08 dushanba", TODAY, TODAY)).toBe("2026-08-20");
    expect(parseDateHeader("31.02", TODAY, TODAY)).toBe("invalid");
    expect(parseDateHeader("K -2", TODAY, TODAY)).toBeNull();
    expect(parseDateHeader("2026-11-01", TODAY, TODAY)).toBe("2026-11-01");
  });
});

describe("spec examples", () => {
  const cases: [string, Partial<ReturnType<typeof parseLine>>][] = [
    ["K -2 samokat", { status: "ok", account: "K", amount: -2000, type: "expense", tail: "samokat" }],
    ["N -47 = 3447 do‘kon", { status: "ok", account: "N", amount: -47000, expected: 3447000, tail: "do'kon" }],
    ["C +10000 = 10000 oylik", { status: "ok", account: "C", amount: 10_000_000, expected: 10_000_000, type: "income" }],
    ["N -24-12 obed", { status: "ok", amount: -36000, tail: "obed" }],
    ["J -52+66 = 127", { status: "ok", account: "J", amount: 14000, expected: 127000, type: "debt" }],
    ["J = -18", { status: "ok", type: "snapshot", amount: -18000 }],
    ["C -> K 100", { status: "ok", account: "C", counterparty: "K", amount: -100000, type: "transfer", explicit: true }],
    ["C-K 100", { status: "ok", account: "C", counterparty: "K", amount: -100000, type: "transfer" }],
    ["Uy -1000 N ga", { status: "ok", account: "Uy", counterparty: "N", amount: -1_000_000, type: "transfer" }],
    ["N +1000 Uydan", { status: "ok", account: "N", counterparty: "Uy", amount: 1_000_000, type: "transfer" }],
    ["N = 212", { status: "ok", type: "snapshot", amount: 212000 }],
    ["K = 14", { status: "ok", type: "snapshot", amount: 14000 }],
    ["C = 4888", { status: "ok", type: "snapshot", amount: 4_888_000 }],
    ["07.11", { status: "header", date: "2026-11-07" }],
    ["K +2100 = 2114 J", { status: "ok", account: "K", counterparty: "J", amount: 2_100_000, type: "debt", expected: 2_114_000 }],
    ["J = 0", { status: "ok", type: "snapshot", amount: 0 }],
    ["N -50$", { status: "ok", currency: "USD", amount: -50 }],
    ["N -$50 taksi", { status: "ok", currency: "USD", amount: -50, tail: "taksi" }],
    ["N -30000 so'm non", { status: "ok", currency: "UZS", amount: -30000, unitExplicit: true }],
    ["N -30k non", { status: "ok", amount: -30000 }],
    ["N -30 kiyim", { status: "ok", amount: -30000, tail: "kiyim" }],
    ["N -1500000", { status: "unclear" }],
    ["N -1500000 so'm", { status: "ok", amount: -1_500_000 }],
    ["N -", { status: "pending" }],
    ["N", { status: "pending" }],
    ["N -24 12", { status: "unclear" }],
    ["X -20 nimadir", { status: "unknown_account", unknownCode: "X" }],
    ["-20 taksi", { status: "pending" }],
    ["K -10 = 1059 ? Kamomat", { status: "ok", uncertain: true, tail: "Kamomat" }],
    ["N -1800 = 148 uyga", { status: "ok", counterparty: "Uy", type: "transfer" }],
    ["Uy +1800 = 6200 naqddan", { status: "ok", counterparty: "N", type: "transfer" }],
    ["N -500 uy uchun kiyim", { status: "ok", type: "expense", counterparty: undefined }],
    ["N -60 = 320 rachot Javohir+ kechki ovqatga", { status: "ok", type: "expense", expected: 320000 }],
    ["C → K 100", { status: "ok", type: "transfer", counterparty: "K" }],
    ["N -12 = 80 suvga 2 ming tangadan", { status: "ok", amount: -12000, expected: 80000, tail: "suvga 2 ming tangadan" }],
  ];
  for (const [line, exp] of cases) {
    it(line, () => {
      const r = parseLine(line, ctx);
      for (const [k, v] of Object.entries(exp)) expect((r as Record<string, unknown>)[k], k).toEqual(v);
    });
  }
});

describe("compute — Keep screenshot", () => {
  const raw = `20.08
Uy +2400 = 4400
N = 432
K = 1085
K -2 = 1083 samokat
K -2 = 1081 samokat
K -4 = 1077 metro
N -4 = 428 suv
N -10 = 418 laminatsiya
N -38 = 380 do'kon
N -60 = 320 rachot Javohir+ kechki ovqatga
K -18 = 1069 virent samokat
K -10 = 1059 ? Kamomat

21.08
K -2 = 1057 Samokat
K -202 = 855 Mirzohid akaga
N +200 = 520 Mirzohid akadan
N +1012 = 1532 premya
N +450 = 1982 Mirzabek aka rachot
N +30 = 2012 Oybek Aka Xorazmdagisi
N -126 = 1886 kechki ovqat
N +60 = 1946 Javohir rachot

22.08
N = 1948 noma'lum 2
N -1800 = 148 uyga
Uy +1800 = 6200 naqddan
N -28 = 120 obed
N -30 = 90 apteka
N -12 = 80 suvga 2 ming tangadan`;

  const c = compute([note(raw, "2026-08-20")], accounts, defaultSettings(), TODAY);

  it("balances match the user's running totals", () => {
    expect(getCell(c.balances, "N", "UZS").value).toBe(80000);
    expect(getCell(c.balances, "K", "UZS").value).toBe(855000);
    expect(getCell(c.balances, "Uy", "UZS").value).toBe(6_200_000);
  });
  it("transfer pair N→Uy merged once", () => {
    const tr = c.ok.filter((e) => e.type === "transfer");
    expect(tr.length).toBe(2);
    expect(tr[0].pairedWith).toBe(tr[1].key);
    expect(tr.filter((e) => e.pairPrimary).length).toBe(1);
  });
  it("snapshot difference detected (noma'lum 2)", () => {
    const d = c.issues.filter((i) => i.kind === "snapshot_diff");
    expect(d.length).toBe(1);
    expect(d[0].amount).toBe(2000);
  });
  it("Uy +2400 = 4400 sets anchor without prior snapshot", () => {
    const uy = c.ok.find((e) => e.account === "Uy" && e.type === "income")!;
    expect(uy.balanceAfter).toBe(4_400_000);
  });
  it("finds the user's two arithmetic slips (1077-18≠1069, 90-12≠80)", () => {
    const m = c.issues.filter((i) => i.kind === "expected_mismatch");
    expect(m.map((i) => [i.entry.raw.slice(0, 12), i.amount])).toEqual([["K -18 = 1069", 10000], ["N -12 = 80 s", 2000]]);
  });
  it("categories learned: 'virent samokat' → samokat", () => {
    const e = c.ok.find((x) => x.tail === "virent samokat")!;
    expect(e.category).toBe("samokat");
    expect(c.ok.find((x) => x.tail === "Samokat")!.category).toBe("samokat");
  });
  it("uncertain line flagged", () => {
    expect(c.issues.some((i) => i.kind === "uncertain")).toBe(true);
  });
  it("dates applied from headers", () => {
    expect(c.ok.find((x) => x.tail === "apteka")!.date).toBe("2026-08-22");
    expect(c.ok.find((x) => x.tail === "metro")!.date).toBe("2026-08-20");
  });
});

describe("compute — spec sequences", () => {
  it("debt repayment K +2100 J then J = 0", () => {
    const c = compute([note("J = 2100\nK = 14\nK +2100 = 2114 J\nJ = 0")], accounts, defaultSettings(), TODAY);
    expect(getCell(c.balances, "J", "UZS").value).toBe(0);
    expect(getCell(c.balances, "K", "UZS").value).toBe(2_114_000);
    expect(c.issues.filter((i) => i.kind === "snapshot_diff" || i.kind === "expected_mismatch").length).toBe(0);
  });
  it("explicit transfer plus the other side written separately counts once", () => {
    const c = compute([note("C = 500\nK = 0\nC -> K 100\nK +100 Cdan")], accounts, defaultSettings(), TODAY);
    expect(getCell(c.balances, "C", "UZS").value).toBe(400000);
    expect(getCell(c.balances, "K", "UZS").value).toBe(100000);
  });
  it("possible pair suggested without hints, not merged", () => {
    const c = compute([note("N = 100\nK = 100\nN -50 pul\nK +50 keldi")], accounts, defaultSettings(), TODAY);
    expect(c.issues.some((i) => i.kind === "possible_pair")).toBe(true);
    expect(getCell(c.balances, "N", "UZS").value).toBe(50000);
    expect(getCell(c.balances, "K", "UZS").value).toBe(150000);
    expect(c.ok.filter((e) => e.type === "transfer").length).toBe(0);
  });
  it("confirmed pair merges", () => {
    const s = defaultSettings();
    const c0 = compute([note("N = 100\nK = 100\nN -50 pul\nK +50 keldi")], accounts, s, TODAY);
    const sig = c0.issues.find((i) => i.kind === "possible_pair")!.pairSig!;
    s.confirmedPairs = [sig];
    const c = compute([note("N = 100\nK = 100\nN -50 pul\nK +50 keldi")], accounts, s, TODAY);
    expect(c.ok.filter((e) => e.type === "transfer").length).toBe(2);
    expect(c.issues.some((i) => i.kind === "possible_pair")).toBe(false);
  });
  it("late entries are counted by operation date", () => {
    const n1 = note("N = 100\nN -10 a", "2026-11-05", "a", "2026-11-05T10:00:00Z");
    const n2 = note("N -20 b", "2026-11-04", "b", "2026-11-07T10:00:00Z"); // kech yozilgan, sanasi oldin
    const c = compute([n1, n2], accounts, defaultSettings(), TODAY);
    expect(c.ok.map((e) => e.date)).toEqual(["2026-11-04", "2026-11-05", "2026-11-05"]);
    // snapshot 05.11 keyin keladi, shuning uchun qoldiq 90
    expect(getCell(c.balances, "N", "UZS").value).toBe(90000);
  });
  it("USD kept separate from UZS", () => {
    const c = compute([note("N = 100\nN = 50$\nN -10$ taksi\nN -5 non")], accounts, defaultSettings(), TODAY);
    expect(getCell(c.balances, "N", "UZS").value).toBe(95000);
    expect(getCell(c.balances, "N", "USD").value).toBe(40);
  });
  it("pending lines do not affect balances", () => {
    const c = compute([note("N = 100\nN -\nX -5\nN -1500000")], accounts, defaultSettings(), TODAY);
    expect(getCell(c.balances, "N", "UZS").value).toBe(100000);
    expect(c.issues.filter((i) => ["pending", "unknown_account", "unclear"].includes(i.kind)).length).toBe(3);
  });
});

import { compose, decompose, lineAt, replaceLine } from "@/lib/lineedit";
describe("lineedit", () => {
  const isAcc = (c: string) => ["uy", "n", "k", "c", "j"].includes(c.toLowerCase());
  it("decompose/compose roundtrip", () => {
    const cases = ["K -30 taksi", "N -24-12 obed", "C +10000 = 10000 oylik", "N = 212", "C -> K 100 komissiya", "C-K 100", "N -50$ taksi", "N -30 so'm non", "K -2 = 1083 samokat, ikkita"];
    for (const c of cases) {
      const p = decompose(c, isAcc);
      expect(p.account, c).not.toBe("");
      const back = compose(p);
      expect(decompose(back, isAcc), c).toEqual(p);
    }
    expect(decompose("K -30 taksi", isAcc)).toEqual({ account: "K", op: "-", target: "", amount: "30", unit: "", expected: "", tail: "taksi" });
    expect(decompose("C-K 100", isAcc)).toMatchObject({ account: "C", op: "->", target: "K", amount: "100" });
    expect(decompose("-30 taksi", isAcc).account).toBe("");
    expect(compose({ ...decompose("K -30 taksi", isAcc), op: "+" })).toBe("K +30 taksi");
    expect(compose({ ...decompose("K -30 taksi", isAcc), op: "=" })).toBe("K = 30 taksi");
  });
  it("lineAt / replaceLine", () => {
    const t = "K -2\nN -3\nC -4";
    expect(lineAt(t, 0).index).toBe(0);
    expect(lineAt(t, 5).index).toBe(1);
    expect(lineAt(t, 12).index).toBe(2);
    const r = replaceLine(t, 1, "N -30 obed");
    expect(r.text).toBe("K -2\nN -30 obed\nC -4");
    expect(r.caret).toBe(15);
  });
});
