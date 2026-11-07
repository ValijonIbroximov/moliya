"use client";
import { useEffect, useState } from "react";
import type { Account, Computed, Currency } from "@/lib/types";
import { CURRENCIES } from "@/lib/types";
import { upsertAccount } from "@/lib/store";
import { money, signed } from "@/lib/format";
import { humanDate } from "@/lib/dates";
import { ACC_TYPE_LABEL, Badge, Modal, useToast } from "./ui";

interface Props {
  computed: Computed;
  accounts: Account[];
  onWriteBalance: (code: string) => void;
  onEdit: (a: Account) => void;
  onAdd: () => void;
}

export default function Accounts({ computed, accounts, onWriteBalance, onEdit, onAdd }: Props) {
  const live = accounts.filter((a) => !a.archived).sort((a, b) => a.sort - b.sort);
  const archived = accounts.filter((a) => a.archived);
  return (
    <div className="stack">
      <div className="row">
        <p className="muted" style={{ fontSize: 13.5 }}>Qoldiqni yozish uchun hisobni bosing. Dollar alohida, qarzlar pul qoldig'idan tashqarida.</p>
        <button type="button" className="primary" onClick={onAdd}>+ Hisob</button>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
        {live.map((a) => {
          const row = computed.balances[a.code] || {};
          const cells = Object.entries(row).filter(([, b]) => b && (b.known || b.value !== 0)) as [Currency, { value: number; known: boolean; lastSnapshot?: string }][];
          const main = row[a.currency];
          return (
            <div key={a.id} className="card" style={{ padding: 14 }}>
              <div className="row">
                <span style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}><Badge acc={a} /><span style={{ minWidth: 0 }}><b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</b><small>{ACC_TYPE_LABEL[a.type]} · {a.currency}{a.aliases?.length ? " · " + a.aliases.join(", ") : ""}</small></span></span>
                <button type="button" className="ghost small" onClick={() => onEdit(a)} aria-label="Tahrirlash">✎</button>
              </div>
              <div style={{ marginTop: 12 }}>
                {cells.length === 0 && <div><div style={{ fontSize: 22, fontWeight: 750 }}>—</div><small>Boshlang'ich qoldiq yozilmagan</small></div>}
                {cells.map(([cur, b]) => (
                  <div key={cur} style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: cur === a.currency ? 22 : 16, fontWeight: 750, letterSpacing: -.5 }} className={a.type === "person" ? (b.value >= 0 ? "amt in" : "amt out") : ""}>
                      {b.known ? money(a.type === "person" ? Math.abs(b.value) : b.value, cur) : signed(b.value, cur) + " (harakat)"}
                    </div>
                    <small>{a.type === "person" ? (b.value >= 0 ? "sizga qarzdor" : "siz qarzdorsiz") : b.known ? "tasdiqlangan" + (b.lastSnapshot ? " · " + humanDate(b.lastSnapshot, false) : "") : "qoldiq noma'lum — faqat yozilgan harakat"}</small>
                  </div>
                ))}
                {!main?.known && <small style={{ display: "block", color: "var(--warn)" }}>«{a.code} = …» deb yozsangiz qoldiq tasdiqlanadi.</small>}
              </div>
              <button type="button" className="small" style={{ marginTop: 10, width: "100%" }} onClick={() => onWriteBalance(a.code)}>= Qoldiq yozish</button>
            </div>
          );
        })}
      </div>
      {archived.length > 0 && (
        <div className="card flat">
          <h3>Arxivdagi hisoblar</h3>
          <div className="wrap" style={{ marginTop: 8 }}>{archived.map((a) => <button key={a.id} type="button" className="small" onClick={() => onEdit(a)}>{a.code} · {a.name}</button>)}</div>
        </div>
      )}
    </div>
  );
}

export function AccountDialog({ open, onClose, editing, prefill, accounts }: { open: boolean; onClose: () => void; editing: Account | null; prefill?: string; accounts: Account[] }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<Account["type"]>("cash");
  const [currency, setCurrency] = useState<Currency>("UZS");
  const [aliases, setAliases] = useState("");
  const [archived, setArchived] = useState(false);
  useEffect(() => {
    if (!open) return;
    setCode(editing?.code || prefill || "");
    setName(editing?.name || "");
    setType(editing?.type || (prefill && prefill.length > 2 ? "person" : "cash"));
    setCurrency(editing?.currency || "UZS");
    setAliases(editing?.aliases?.join(", ") || "");
    setArchived(editing?.archived || false);
  }, [open, editing, prefill]);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim();
    if (!/^[\p{L}][\p{L}\d_'ʻ‘’]{0,11}$/u.test(c)) { toast("Qisqartma harf bilan boshlansin, 1–12 belgi, bo'shliqsiz"); return; }
    const dup = accounts.find((a) => a.id !== editing?.id && (a.code.toLowerCase() === c.toLowerCase() || (a.aliases || []).some((x) => x.toLowerCase() === c.toLowerCase())));
    if (dup) { toast(`"${c}" allaqachon ${dup.code} hisobida ishlatilgan`); return; }
    const al = aliases.split(/[,\s]+/).map((x) => x.trim()).filter((x) => x && x.toLowerCase() !== c.toLowerCase());
    upsertAccount({ id: editing?.id, code: c, name: name.trim() || c, type, currency, aliases: al, archived, ...(editing ? {} : { sort: accounts.length }) });
    toast(editing ? "Hisob yangilandi" : `Hisob qo'shildi: ${c}`);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Hisobni tahrirlash" : "Yangi hisob"}>
      <form onSubmit={save}>
        <label className="label" htmlFor="acode">Qisqartma</label>
        <input id="acode" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Masalan: D, Azam, Omonat" maxLength={12} required autoComplete="off" />
        <p className="hint">Matnda shu qisqartma bilan yoziladi: «{code || "D"} -50». Katta-kichik harf farqi yo'q.</p>
        <label className="label" htmlFor="aname">Nomi</label>
        <input id="aname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Hisob yoki shaxs nomi" maxLength={80} />
        <div className="fields">
          <div>
            <label className="label" htmlFor="atype">Turi</label>
            <select id="atype" value={type} onChange={(e) => setType(e.target.value as Account["type"])}>
              <option value="cash">Naqd</option><option value="card">Karta</option><option value="home">Uyda saqlanayotgan</option><option value="person">Shaxs / qarz</option><option value="other">Boshqa / vaqtinchalik</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="acur">Standart valyuta</label>
            <select id="acur" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
        </div>
        <label className="label" htmlFor="aal">Boshqa nomlari <span className="muted" style={{ fontWeight: 400 }}>· vergul bilan</span></label>
        <input id="aal" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="naqd, cash" autoComplete="off" />
        <p className="hint">«Uydan», «naqddan» kabi so'zlar shu nomlar orqali tanib olinadi. Shaxs hisobida musbat qoldiq — u sizga qarzdor, manfiy — siz qarzdorsiz. Satrda «$» yozilsa, shu hisobning dollar qoldig'i alohida yuritiladi.</p>
        {editing && <label className="label" style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} style={{ width: "auto" }} /> Arxivga olish (yozuvlar saqlanadi, kataklarda ko'rinmaydi)</label>}
        <button className="primary" style={{ marginTop: 16, width: "100%" }}>{editing ? "Saqlash" : "Hisob qo'shish"}</button>
      </form>
    </Modal>
  );
}
