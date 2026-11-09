// Regressiya: hisob qisqartmasi satr boshida katta-kichik harfdan qat'i nazar tanilsin (Uy=uy=uY, NI=ni=Ni=nI, N=n)
import { describe, expect, it } from "vitest";
import { indexAccounts, parseNote } from "@/lib/parser";
import type { Account, Note } from "@/lib/types";
const mk = (code: string, type: Account["type"] = "cash"): Account => ({ id: code, code, name: code, type, currency: "UZS", aliases: [], color: "#fff", sort: 0, archived: false, updated_at: "" });
const idx = indexAccounts([mk("Uy", "home"), mk("NI", "person"), mk("N")]);
const note = (raw: string): Note => ({ id: "n1", raw, note_date: "2026-11-09", unit: 1000, deleted: false, created_at: "", updated_at: "" });
describe("katta-kichik harf", () => {
  const cases: [string, string][] = [["uy -100", "Uy"], ["uY = 300", "Uy"], ["UY +10", "Uy"], ["ni=200", "NI"], ["nI -5", "NI"], ["Ni -1", "NI"], ["n -30 taksi", "N"]];
  for (const [line, code] of cases) it(`${line} -> ${code}`, () => {
    const [e] = parseNote(note(line), idx, "2026-11-09");
    expect(e.status).toBe("ok");
    expect(e.account).toBe(code);
  });
});
