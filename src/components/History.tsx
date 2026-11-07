"use client";
import { useMemo, useState } from "react";
import type { Account, Computed, Entry } from "@/lib/types";
import { humanDate, today } from "@/lib/dates";
import { short } from "@/lib/format";
import { Amount, Badge, Tile, TypeChip } from "./ui";

interface Props {
  computed: Computed;
  accounts: Account[];
  onOpen: (noteId: string, line: number) => void;
}

const TYPES: [string, string][] = [["all", "Barcha turlar"], ["expense", "Chiqim"], ["income", "Kirim"], ["transfer", "O'tkazma"], ["debt", "Qarz"], ["snapshot", "Qoldiq"]];
const STATES: [string, string][] = [["all", "Barcha holatlar"], ["ok", "Aniq"], ["pending", "Chala"], ["unknown_account", "Noma'lum hisob"], ["unclear", "Noaniq"], ["uncertain", "? belgili"], ["diff", "Tafovutli"]];

export default function History({ computed, accounts, onOpen }: Props) {
  const [q, setQ] = useState("");
  const [acc, setAcc] = useState<string>("");
  const [type, setType] = useState("all");
  const [state, setState] = useState("all");
  const [limit, setLimit] = useState(120);
  const accByCode = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts]);
  const todayStr = today();

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const out: Entry[] = [];
    for (let i = computed.entries.length - 1; i >= 0; i--) {
      const e = computed.entries[i];
      if (acc && e.account !== acc && e.counterparty !== acc && e.unknownCode !== acc) continue;
      if (type !== "all" && e.type !== type) continue;
      if (state !== "all") {
        if (state === "uncertain" && !e.uncertain) continue;
        else if (state === "diff" && !e.diff) continue;
        else if (!["uncertain", "diff"].includes(state) && e.status !== state) continue;
      }
      if (ql && ![e.raw, e.category, e.comment, e.reason].join(" ").toLowerCase().includes(ql)) continue;
      out.push(e);
    }
    return out;
  }, [computed, q, acc, type, state]);

  const groups = useMemo(() => {
    const g: { date: string; items: Entry[]; out: number; inc: number }[] = [];
    for (const e of rows.slice(0, limit)) {
      let last = g[g.length - 1];
      if (!last || last.date !== e.date) { last = { date: e.date, items: [], out: 0, inc: 0 }; g.push(last); }
      last.items.push(e);
      if (e.status === "ok" && e.currency === "UZS") { if (e.type === "expense") last.out += -e.amount!; if (e.type === "income") last.inc += e.amount!; }
    }
    return g;
  }, [rows, limit]);

  return (
    <div className="card">
      <div className="wrap">
        <input placeholder="Toifa, izoh yoki matndan izlash…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Qidirish" style={{ flex: "1 1 200px" }} />
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tur" style={{ width: "auto" }}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={state} onChange={(e) => setState(e.target.value)} aria-label="Holat" style={{ width: "auto" }}>{STATES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>
      <div className="tiles" style={{ marginTop: 10 }}>
        {accounts.filter((a) => !a.archived).map((a) => <Tile key={a.id} acc={a} small on={acc === a.code} onClick={() => setAcc(acc === a.code ? "" : a.code)} />)}
      </div>
      <p className="hint">{rows.length} ta satr{acc ? ` · ${acc}` : ""}. Satrga bosib tahrirlang — dublikat yaratilmaydi.</p>

      {groups.length === 0 && <div className="empty"><b>Hech narsa topilmadi</b>Filtrni o'zgartiring yoki yangi yozuv kiriting.</div>}
      {groups.map((g) => (
        <div key={g.date}>
          <div className="dayhead">
            <span>{g.date === todayStr ? "Bugun · " : ""}{humanDate(g.date, true, g.date.slice(0, 4) !== todayStr.slice(0, 4))}</span>
            <small>{g.out ? <span className="amt out">−{short(g.out)}</span> : null}{g.out && g.inc ? " · " : ""}{g.inc ? <span className="amt in">+{short(g.inc)}</span> : null}</small>
          </div>
          {g.items.map((e) => {
            const a = e.account ? accByCode.get(e.account) : undefined;
            return (
              <div key={e.key} className="entry" onClick={() => onOpen(e.noteId, e.line)} role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === "Enter") onOpen(e.noteId, e.line); }}>
                <Badge acc={a} code={e.unknownCode || e.account} />
                <div className="main">
                  <b>{e.status === "ok" ? (e.type === "transfer" || e.type === "debt" ? `${e.account} → ${e.counterparty || "?"}${e.comment ? " · " + e.comment : ""}` : e.type === "snapshot" ? `Qoldiq ${e.account}${e.comment ? " · " + e.comment : ""}` : (e.category || "toifasiz") + (e.comment ? " · " + e.comment : "")) : e.raw}</b>
                  <small>
                    <TypeChip e={e} /> {e.status !== "ok" ? e.reason : <span className="mono">{e.raw.length > 48 ? e.raw.slice(0, 48) + "…" : e.raw}</span>}
                    {e.diff ? <span className="danger"> · tafovut {e.diff > 0 ? "+" : ""}{short(e.diff, e.currency)}</span> : null}
                    {e.pairedWith && !e.pairPrimary ? " · juft (hisoblanmaydi)" : ""}
                  </small>
                </div>
                <div className="right">
                  <Amount e={e} />
                  {e.status === "ok" && e.balanceAfter !== undefined && <small style={{ display: "block" }}>= {short(e.balanceAfter, e.currency)}</small>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {rows.length > limit && <button type="button" style={{ width: "100%", marginTop: 12 }} onClick={() => setLimit(limit + 200)}>Yana ko'rsatish ({rows.length - limit})</button>}
    </div>
  );
}
