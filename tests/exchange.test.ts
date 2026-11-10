// Regressiya: valyuta ayirboshlash (so'm -> $) kirim/chiqim emas, transfer bo'lishi kerak
import { describe, expect, it } from "vitest";
import { compute } from "@/lib/compute";
import { flow, monthSummary } from "@/lib/stats";
import type { Account, Note, Settings } from "@/lib/types";

const mk = (code: string, type: Account["type"], cur: "UZS" | "USD" = "UZS"): Account =>
  ({ id: code, code, name: code, type, currency: cur, aliases: [], color: "#fff", sort: 0, archived: false, updated_at: "" });
const accs = [mk("C", "card"), mk("Uy", "home"), mk("K", "card")];
const raw = "C +10000 Oylik\nC -3583803 so'm 300$ sotib olindi\nC = 6416197 so'm\nUy = 0$\nUy +300$ C dan dollar qilindi";
const note: Note = { id: "n1", raw, note_date: "2026-11-05", unit: 1000, deleted: false, created_at: "", updated_at: "" };
const st = { confirmedPairs: [], rejectedPairs: [], updated_at: "" } as unknown as Settings;

describe("valyuta ayirboshlash", () => {
  const c = compute([note], accs, st, "2026-11-10");
  it("ikkala tomon transfer (ayirboshlash)", () => {
    const minus = c.ok.find((e) => e.amount === -3583803)!;
    const plus = c.ok.find((e) => e.currency === "USD" && e.amount === 300)!;
    expect(minus.type).toBe("transfer");
    expect(plus.type).toBe("transfer");
    expect(minus.pairedWith).toBe(plus.key);
    expect(plus.category).toBe("ayirboshlash");
  });
  it("oylik kirim faqat 10 mln, chiqim 0", () => {
    const f = flow(c.ok, { from: "2026-11-01", to: "2026-11-30", label: "11" }, "UZS", accs);
    expect(f.income).toBe(10000000);
    expect(f.expense).toBe(0);
    const fu = flow(c.ok, { from: "2026-11-01", to: "2026-11-30", label: "11" }, "USD", accs);
    expect(fu.income).toBe(0);
  });
  it("monthSummary: jami = 10 mln + 300$ kurs bilan", () => {
    const m = monthSummary(c, accs, "2026-11-10", undefined, 12000);
    expect(m.income).toBe(10000000);           // ayirboshlash oylikka qo'shilmadi
    expect(m.qoldi).toBe(10000000 - 3583803 + 300 * 12000); // C qoldig'i + Uy $ kurs bilan
    expect(m.sarflandi).toBe(0);
  });
  it("balanslar: C kamaydi, Uy 300$", () => {
    expect(c.balances["C"]["UZS"]!.value).toBe(10000000 - 3583803);
    expect(c.balances["Uy"]["USD"]!.value).toBe(300);
  });
});
