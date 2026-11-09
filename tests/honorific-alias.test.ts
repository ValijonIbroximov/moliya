// Regressiya: taxallus orqali tanilgan hisobdan keyingi "aka/opa" so'zi satrni buzmasin
import { describe, expect, it } from "vitest";
import { indexAccounts, parseNote } from "@/lib/parser";
import type { Account, Note } from "@/lib/types";

const mk = (code: string, aliases: string[] = [], type: Account["type"] = "person"): Account =>
  ({ id: code, code, name: code, type, currency: "UZS", aliases, color: "#fff", sort: 0, archived: false, updated_at: "" });
const idx = indexAccounts([mk("N", [], "cash"), mk("NI", ["Nurislom"]), mk("Mirzabek aka")]);
const note = (raw: string): Note => ({ id: "n1", raw, note_date: "2026-08-16", unit: 1000, deleted: false, created_at: "", updated_at: "" });

describe("hurmat so'zi (aka/opa) tanilgan hisobdan keyin", () => {
  it("taxallus + aka + qoldiq: Nurislom aka=200", () => {
    const [e] = parseNote(note("Nurislom aka=200"), idx, "2026-11-09");
    expect(e.status).toBe("ok");
    expect(e.account).toBe("NI");
    expect(e.type).toBe("snapshot");
    expect(e.amount).toBe(200000);
  });
  it("taxallus + aka + chiqim: Nurislom aka -50", () => {
    const [e] = parseNote(note("Nurislom aka -50"), idx, "2026-11-09");
    expect(e.status).toBe("ok");
    expect(e.account).toBe("NI");
    expect(e.amount).toBe(-50000);
  });
  it("ko'p so'zli kod avvalgidek ishlaydi: Mirzabek aka=450", () => {
    const [e] = parseNote(note("Mirzabek aka=450"), idx, "2026-11-09");
    expect(e.status).toBe("ok");
    expect(e.account).toBe("Mirzabek aka");
    expect(e.amount).toBe(450000);
  });
});
