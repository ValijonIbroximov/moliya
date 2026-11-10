"use client";
import { useEffect, useState } from "react";
import type { Account, Computed, Currency } from "@/lib/types";
import { CURRENCIES } from "@/lib/types";
import { deleteAccount, updateSettings, upsertAccount, useApp } from "@/lib/store";
import { money, short, signed } from "@/lib/format";
import { sentToAccount } from "@/lib/stats";
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
  const prefs = useApp().settings.accountPrefs || {};
  const live = accounts.filter((a) => !a.archived).sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));
  const archived = accounts.filter((a) => a.archived);

  /** Tartibni o'zgartirish: qo'shni bilan o'rin almashadi — Yozuv bo'limidagi kataklar ham shu tartibda chiqadi */
  function move(a: Account, dir: -1 | 1) {
    const i = live.findIndex((x) => x.id === a.id);
    const j = i + dir;
    if (j < 0 || j >= live.length) return;
    const b = live[j];
    upsertAccount({ ...a, sort: j });
    upsertAccount({ ...b, sort: i });
  }

  return (
    <div className="stack">
      <div className="row">
        <p className="muted" style={{ fontSize: 13 }}>↑↓ — tartib (Yozuvdagi kataklar shu tartibda) · «=» — qoldiq yozish. Qarzlar jami pulga qo'shilmaydi.</p>
        <button type="button" className="primary" onClick={onAdd} style={{ flexShrink: 0 }}>+ Hisob</button>
      </div>
      <div className="stack" style={{ gap: 7 }}>
        {live.map((a, idx) => {
          const row = computed.balances[a.code] || {};
          const cells = Object.entries(row).filter(([, b]) => b && (b.known || b.value !== 0)) as [Currency, { value: number; known: boolean; lastSnapshot?: string }][];
          const main = row[a.currency];
          return (
            <div key={a.id} className="card accrow">
              <Badge acc={a} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <b style={{ display: "block", fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.name}>{a.name}</b>
                <small style={{ fontSize: 11 }}>
                  {ACC_TYPE_LABEL[a.type]}
                  {prefs[a.id]?.hideHome ? <span className="muted"> · bosh sahifada yashirin</span> : null}
                  {prefs[a.id]?.excludeTotal ? <span className="muted"> · jamiga qo'shilmaydi</span> : null}
                  {main && !main.known ? <span style={{ color: "var(--warn)" }}> · qoldiq yozilmagan</span> : main?.lastSnapshot ? ` · ✓ ${humanDate(main.lastSnapshot, false)}` : ""}
                </small>
                {a.type === "person" && prefs[a.id]?.excludeTotal && (() => {
                  const sent = sentToAccount(computed, a);
                  return sent.length ? (
                    <small style={{ fontSize: 11, display: "block", color: "var(--move)" }} title="Toifasida shu hisob nomi yozilgan chiqimlar yig'indisi (butun tarix)">
                      Yuborilgan jami: {sent.map((x) => short(x.value, x.cur)).join(" | ")}
                    </small>
                  ) : null;
                })()}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                {cells.length === 0 && <b style={{ fontSize: 15 }}>—</b>}
                {cells.map(([cur, b]) => (
                  <b key={cur} style={{ display: "block", fontSize: cur === a.currency ? 15.5 : 13, letterSpacing: -.3, lineHeight: 1.25 }} className={a.type === "person" ? (b.value >= 0 ? "amt in" : "amt out") : undefined} title={a.type === "person" ? (b.value >= 0 ? "sizga qarzdor" : "siz qarzdorsiz") : b.known ? "tasdiqlangan" : "faqat harakat yig'indisi"}>
                    {b.known ? money(a.type === "person" ? Math.abs(b.value) : b.value, cur) : signed(b.value, cur) + " ·?"}
                  </b>
                ))}
              </div>
              <div className="accbtns">
                <button type="button" className="ghost small" onClick={() => move(a, -1)} disabled={idx === 0} aria-label="Yuqoriga">↑</button>
                <button type="button" className="ghost small" onClick={() => move(a, 1)} disabled={idx === live.length - 1} aria-label="Pastga">↓</button>
                <button type="button" className="ghost small" onClick={() => onWriteBalance(a.code)} aria-label="Qoldiq yozish" title="Qoldiq yozish (=)">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 9.5h12M6 14.5h12"/></svg>
                </button>
                <button type="button" className="ghost small" onClick={() => onEdit(a)} aria-label="Tahrirlash" title="Tahrirlash">✎</button>
              </div>
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
  const [hideHome, setHideHome] = useState(false);
  const [exclTotal, setExclTotal] = useState(false);
  const prefs = useApp().settings.accountPrefs || {};
  useEffect(() => {
    if (!open) return;
    setCode(editing?.code || prefill || "");
    setName(editing?.name || "");
    setType(editing?.type || (prefill && (/\s(aka|opa|aya|uka)$/i.test(prefill) || prefill.length > 2) ? "person" : "cash"));
    setCurrency(editing?.currency || "UZS");
    setAliases(editing?.aliases?.join(", ") || "");
    setArchived(editing?.archived || false);
    const pr = editing ? prefs[editing.id] : undefined;
    setHideHome(pr?.hideHome || false);
    setExclTotal(pr?.excludeTotal || false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, prefill]);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const c = code.replace(/\s+/g, " ").trim();
    if (!/^[\p{L}][\p{L}\d_'ʻ‘’]{0,11}(?:\s[\p{L}][\p{L}\d_'ʻ‘’]{0,11}){0,2}$/u.test(c)) { toast("Qisqartma harf bilan boshlansin (3 so'zgacha), masalan: Mirzabek aka"); return; }
    const dup = accounts.find((a) => a.id !== editing?.id && (a.code.toLowerCase() === c.toLowerCase() || (a.aliases || []).some((x) => x.toLowerCase() === c.toLowerCase())));
    if (dup) { toast(`"${c}" allaqachon ${dup.code} hisobida ishlatilgan`); return; }
    const al = aliases.split(/[,\n]+/).map((x) => x.replace(/\s+/g, " ").trim()).filter((x) => x && x.toLowerCase() !== c.toLowerCase());
    // Qisqartma o'zgarsa, eskisi avtomatik "boshqa nom" bo'lib qoladi — eski yozuvlar tarixi uzilmaydi
    const renamed = editing && editing.code.toLowerCase() !== c.toLowerCase();
    if (renamed && !al.some((x) => x.toLowerCase() === editing.code.toLowerCase())) al.push(editing.code);
    const saved = upsertAccount({ id: editing?.id, code: c, name: name.trim() || c, type, currency, aliases: al, archived, ...(editing ? {} : { sort: accounts.length }) });
    const next = { ...prefs };
    if (hideHome || exclTotal) next[saved.id] = { ...(hideHome ? { hideHome: true } : {}), ...(exclTotal ? { excludeTotal: true } : {}) };
    else delete next[saved.id];
    if (JSON.stringify(next[saved.id] || null) !== JSON.stringify(prefs[saved.id] || null)) updateSettings({ accountPrefs: next });
    toast(renamed ? `Qisqartma ${editing.code} → ${c}. Eskisi boshqa nom sifatida qoldi — tarix buzilmaydi` : editing ? "Hisob yangilandi" : `Hisob qo'shildi: ${c}`);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Hisobni tahrirlash" : "Yangi hisob"}>
      <form onSubmit={save}>
        <label className="label" htmlFor="acode">Qisqartma</label>
        <input id="acode" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Masalan: D, Azam, Omonat" maxLength={12} required autoComplete="off" />
        <p className="hint">Matnda shu qisqartma bilan yoziladi: «{code || "D"} -50». Katta-kichik harf farqi yo'q.{editing ? " Qisqartmani o'zgartirsangiz, eskisi «boshqa nomlar»da avtomatik qoladi — eski yozuvlar tanilaveradi." : ""}</p>
        <label className="label" htmlFor="aname">Nomi</label>
        <input id="aname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Hisob yoki shaxs nomi" maxLength={80} />
        <div className="fields">
          <div>
            <label className="label" htmlFor="atype">Turi</label>
            <select id="atype" value={type} onChange={(e) => setType(e.target.value as Account["type"])}>
              <option value="cash">Naqd</option><option value="card">Karta</option><option value="home">Uyda saqlanayotgan</option><option value="person">Shaxs / qarz</option><option value="other">Boshqa / vaqtinchalik</option><option value="report">Qayd / safar hisoboti (jami pulga qo'shilmaydi)</option>
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
        <label className="label" style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={hideHome} onChange={(e) => setHideHome(e.target.checked)} style={{ width: "auto" }} /> Bosh sahifadagi qoldiq qatorida ko'rsatilmasin</label>
        <label className="label" style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={exclTotal} onChange={(e) => setExclTotal(e.target.checked)} style={{ width: "auto" }} /> Umumiy (tasdiqlangan) pulga qo'shilmasin</label>
        {editing && <label className="label" style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} style={{ width: "auto" }} /> Arxivga olish (yozuvlar saqlanadi, kataklarda ko'rinmaydi)</label>}
        <button className="primary" style={{ marginTop: 16, width: "100%" }}>{editing ? "Saqlash" : "Hisob qo'shish"}</button>
        {editing && (
          <button
            type="button"
            className="danger"
            style={{ marginTop: 8, width: "100%" }}
            onClick={() => {
              if (!window.confirm(`«${editing.code}${editing.name && editing.name !== editing.code ? " · " + editing.name : ""}» hisobi butunlay o'chirilsinmi?\n\nYozuvlar (xom matn) o'zgarmaydi, lekin bu qisqartma endi tanilmay, satrlari «chala» ro'yxatiga tushishi mumkin. Tarix kerak bo'lsa, o'chirish o'rniga «Arxivga olish» ni tanlang.`)) return;
              deleteAccount(editing.id);
              toast(`Hisob o'chirildi: ${editing.code}`);
              onClose();
            }}
          >
            🗑 Hisobni o'chirish
          </button>
        )}
      </form>
    </Modal>
  );
}
