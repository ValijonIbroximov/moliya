// Regressiya: konvertga (shaxs + jamiga qo'shilmaydi) yo'nalgan minus satr — chiqim, qarz emas
import { describe, expect, it } from "vitest";
import { compute } from "@/lib/compute";
import { flow, sentToAccount } from "@/lib/stats";
import type { Account, Note, Settings } from "@/lib/types";

const mk = (code: string, type: Account["type"]): Account =>
  ({ id: code, code, name: code, type, currency: "UZS", aliases: [], color: "#fff", sort: 0, archived: false, updated_at: "" });
const accs = [mk("N", "cash"), mk("Uy", "home"), mk("Sirdaryo", "person"), mk("J", "person")];
const st = { confirmedPairs: [], rejectedPairs: [], accountPrefs: { Sirdaryo: { excludeTotal: true, hideHome: true } }, updated_at: "" } as unknown as Settings;
const note = (raw: string): Note => ({ id: "n1", raw, note_date: "2026-11-10", unit: 1000, deleted: false, created_at: "", updated_at: "" });

describe("konvert (Sirdaryo)", () => {
  const c = compute([note("N -20000 Uy ga\nSirdaryo = 20000\nUy -20000 sirdaryoga\nSirdaryo = 0\nUy -5000 sirdaryoga qo'shimcha")], accs, st, "2026-11-10");
  it("yuborish chiqim bo'ladi, toifasi sirdaryo", () => {
    const sends = c.ok.filter((e) => e.type === "expense");
    expect(sends.length).toBe(2);
    expect(sends[0].category).toBe("sirdaryo");
  });
  it("konvert balansi faqat = bilan boshqariladi", () => {
    expect(c.balances["Sirdaryo"]["UZS"]!.value).toBe(0);
  });
  it("flow: chiqim 25 mln, qarz emas", () => {
    const f = flow(c.ok, { from: "2026-11-01", to: "2026-11-30", label: "11" }, "UZS", accs);
    expect(f.expense).toBe(25000000);
    expect(f.debtGiven).toBe(0);
  });
  it("yuborilgan jami 25 mln", () => {
    const sent = sentToAccount(c, accs[2]);
    expect(sent).toEqual([{ cur: "UZS", value: 25000000 }]);
  });
  it("oddiy shaxsga berilgan qarz o'zgarmaydi", () => {
    const c2 = compute([note("N -50 J ga")], accs, st, "2026-11-10");
    const e = c2.ok[0];
    expect(e.type).toBe("debt");
  });
});
