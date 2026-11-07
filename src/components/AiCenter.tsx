"use client";
import { useEffect, useMemo, useState } from "react";
import type { Account, AiResult, Computed, Settings } from "@/lib/types";
import { getAccessToken, updateSettings, useApp } from "@/lib/store";
import { buildReport, reportAsText, AI_QUESTION_DEFAULT } from "@/lib/report";
import { today } from "@/lib/dates";
import { money, num, short } from "@/lib/format";
import { totals } from "@/lib/stats";
import { useToast } from "./ui";

type Provider = "openai" | "anthropic" | "gemini";

const PROVIDERS: Record<Provider, { name: string; site: string; keyUrl: string; keyLabel: string; account: string; accountOk: false; sources: { nom: string; url: string }[] }> = {
  openai: {
    name: "ChatGPT (OpenAI)", site: "https://chatgpt.com/", keyUrl: "https://platform.openai.com/api-keys", keyLabel: "OpenAI API key (sk-…)",
    account: "«Sign in with ChatGPT» rasmiy mavjud, lekin ikki shart bilan: (1) veb-saytlar uchun faqat tanlangan hamkorlarga cheklangan sinov, OpenAI vakili orqali client ID beriladi va u faqat identifikatsiya (ism, email) beradi — obuna hisobidan AI ishlatish emas; (2) obunadan foydalanish (token sharing) faqat ochiq kodli LOKAL dasturlar uchun: callback 127.0.0.1 bo'lishi va tokenlar foydalanuvchi qurilmasida saqlanishi shart. Vercel'dagi veb-ilova bu shartlarga mos kelmaydi. Shuning uchun bu yerda «akkaunt bilan ulandi» holati yo'q.",
    accountOk: false,
    sources: [
      { nom: "OpenAI — Sign in with ChatGPT: website", url: "https://developers.openai.com/siwc/website" },
      { nom: "OpenAI — token sharing (open-source clients)", url: "https://developers.openai.com/siwc/token-sharing-open-source/sign-in" },
      { nom: "OpenAI — Sign in with ChatGPT terms", url: "https://openai.com/policies/sign-in-with-chatgpt-terms/" },
    ],
  },
  anthropic: {
    name: "Claude (Anthropic)", site: "https://claude.ai/", keyUrl: "https://console.anthropic.com/settings/keys", keyLabel: "Anthropic API key (sk-ant-…)",
    account: "Anthropic uchinchi tomon ilovalarga claude.ai login taklif qilishni va Free/Pro/Max obuna hisobidan so'rov yuborishni taqiqlaydi (2026-yil fevralidan rasmiy hujjatda, serverda ham bloklanadi). Yagona rasmiy yo'l — console.anthropic.com API kaliti (alohida to'lov).",
    accountOk: false,
    sources: [
      { nom: "Claude Code docs — Legal and compliance", url: "https://code.claude.com/docs/en/legal-and-compliance" },
      { nom: "Anthropic Console — API keys", url: "https://console.anthropic.com/settings/keys" },
    ],
  },
  gemini: {
    name: "Gemini (Google)", site: "https://gemini.google.com/", keyUrl: "https://aistudio.google.com/apikey", keyLabel: "Gemini API key (AIza…)",
    account: "Google AI Pro/Ultra obunasini uchinchi tomon ilovada ishlatish uchun rasmiy dastur yo'q; Google: «API va tashqi ilovalar alohida hisoblanadi». Rasmiy yo'l — Google AI Studio API kaliti (bepul tarif mavjud).",
    accountOk: false,
    sources: [
      { nom: "Google AI plans — AI Studio UI only", url: "https://ai.google.dev/gemini-api/docs/google-ai-plans" },
      { nom: "Google AI Studio — API key", url: "https://aistudio.google.com/apikey" },
    ],
  },
};
const CHECKED = "2026-11-07";

interface Rates { ok: boolean; source: string; url: string; fetched_at: string; rates: { ccy: string; nom: string; nominal: number; rate: number; diff: number; date: string }[] }

export default function AiCenter({ computed, accounts, settings }: { computed: Computed; accounts: Account[]; settings: Settings }) {
  const app = useApp();
  const toast = useToast();
  const [provider, setProvider] = useState<Provider>(settings.provider || "openai");
  const [question, setQuestion] = useState(AI_QUESTION_DEFAULT);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const todayStr = today();
  const t = totals(computed, accounts, "UZS");
  const [depAmount, setDepAmount] = useState<number>(0);
  const [depRate, setDepRate] = useState<string>("");
  const [depMonths, setDepMonths] = useState<number>(12);
  const [depCap, setDepCap] = useState<boolean>(true);

  useEffect(() => { setKey(localStorage.getItem("moliya:aikey:" + provider) || ""); }, [provider]);
  useEffect(() => { fetch("/api/rates").then((r) => r.json()).then((j) => { if (j.ok) setRates(j); }).catch(() => {}); }, []);
  useEffect(() => { if (!depAmount && t.home > 0) setDepAmount(t.home); }, [t.home, depAmount]);

  const usd = rates?.rates.find((r) => r.ccy === "USD");
  const report = useMemo(() => buildReport(computed, accounts, settings, todayStr, usd ? { usd: usd.rate, eur: rates?.rates.find((r) => r.ccy === "EUR")?.rate, sana: usd.date, manba: "cbu.uz" } : undefined), [computed, accounts, settings, todayStr, usd, rates]);
  const text = useMemo(() => reportAsText(report, question), [report, question]);
  const last = settings.lastAi as AiResult | null | undefined;

  function saveKey(v: string) {
    setKey(v);
    if (v.trim()) localStorage.setItem("moliya:aikey:" + provider, v.trim()); else localStorage.removeItem("moliya:aikey:" + provider);
  }

  async function run() {
    setBusy(true); setErr(null);
    try {
      const token = await getAccessToken();
      const r = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: JSON.stringify({ provider, question, report, apiKey: key.trim() || undefined }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Noma'lum xato");
      const res = j.result as { xulosa?: string; takliflar?: AiResult["takliflar"]; kamchiliklar?: string; manbalar_qidiruvdan?: { nom: string; url: string }[] };
      const ai: AiResult = {
        provider: j.provider, model: j.model, at: j.at,
        xulosa: String(res.xulosa || ""),
        takliflar: Array.isArray(res.takliflar) ? res.takliflar.map((s) => ({ ...s, manbalar: Array.isArray(s.manbalar) ? s.manbalar : [] })) : [],
        kamchiliklar: res.kamchiliklar ? String(res.kamchiliklar) : undefined,
        raw: res.manbalar_qidiruvdan?.length ? JSON.stringify(res.manbalar_qidiruvdan) : undefined,
      };
      updateSettings({ lastAi: ai, provider });
      toast(`Tahlil tayyor (${j.model}${j.keySource === "server" ? ", server kaliti" : ""})`);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }

  async function copyReport() {
    try { await navigator.clipboard.writeText(text); toast("Hisobot nusxalandi — AI suhbatiga joylang"); }
    catch { toast("Nusxalab bo'lmadi — matnni belgilab Ctrl+C bosing"); }
  }

  const p = PROVIDERS[provider];
  const searchSources: { nom: string; url: string }[] = last?.raw ? (() => { try { return JSON.parse(last.raw!); } catch { return []; } })() : [];
  const profit = (() => {
    const r = parseFloat(depRate.replace(",", ".")) / 100;
    if (!depAmount || !r || !depMonths) return null;
    if (depCap) return depAmount * (Math.pow(1 + r / 12, depMonths) - 1);
    return depAmount * r * (depMonths / 12);
  })();

  return (
    <div className="stack">
      <div className="card">
        <div className="row"><h2>AI akkauntiga ulanish — haqiqiy holat</h2><span className="chip warn">tekshirilgan {CHECKED}</span></div>
        <p className="hint">Uchta provayderning rasmiy hujjatlari tekshirildi. «Akkauntga kirish» va «obuna hisobidan AI ishlatish» — boshqa-boshqa narsa. Quyida ikkalasi ham alohida ko'rsatilgan; «ulandi» holati taqlid qilinmaydi.</p>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginTop: 12 }}>
          {(Object.keys(PROVIDERS) as Provider[]).map((k) => (
            <button key={k} type="button" className={`provider${provider === k ? " on" : ""}`} onClick={() => { setProvider(k); updateSettings({ provider: k }); }}>
              <b>{PROVIDERS[k].name}</b>
              <span className="chip bad" style={{ width: "fit-content" }}>Akkaunt/obuna orqali: yo'q</span>
              <span className="chip ok" style={{ width: "fit-content" }}>Rasmiy API kaliti: ha</span>
              <span className="chip" style={{ width: "fit-content" }}>Qo'lda hisobot: ha (vaqtinchalik)</span>
            </button>
          ))}
        </div>
        <div className="insight info" style={{ gridTemplateColumns: "1fr" }}>
          <div>
            <b>{p.name}: nima uchun akkaunt orqali ulanmaydi</b>
            <p>{p.account}</p>
            <div className="srcs">{p.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">{s.nom} ↗</a>)}</div>
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <div className="row"><h2>1-yo'l · Rasmiy API orqali avtomatik tahlil</h2><span className="chip ok">ishlaydi</span></div>
          <p className="hint">Server (Vercel) provayderning rasmiy API'siga web-qidiruv bilan murojaat qiladi: bank stavkalari, kurs va uy narxlari internetdan tekshiriladi, har taklifga manba va sana qo'shiladi. Bu obuna emas — API hisobidan to'lanadi. Kalit shu brauzerda saqlanadi (bazaga yozilmaydi); ilova egasi kalitni Vercel env'ga qo'ysa, maydonni bo'sh qoldirish mumkin.</p>
          <label className="label" htmlFor="aikey">{p.keyLabel} <a href={p.keyUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 400 }}>kalit olish ↗</a></label>
          <input id="aikey" type="password" value={key} onChange={(e) => saveKey(e.target.value)} placeholder="Bo'sh qoldirilsa — serverdagi kalit (agar sozlangan bo'lsa)" autoComplete="off" />
          <label className="label" htmlFor="q">Nimani tahlil qilsin?</label>
          <textarea id="q" rows={4} value={question} onChange={(e) => setQuestion(e.target.value)} />
          <div className="wrap" style={{ marginTop: 12 }}>
            <button type="button" className="primary" onClick={run} disabled={busy}>{busy ? "Tahlil qilinmoqda… (20–60 s)" : "Tahlil qilish"}</button>
            {!app.user && <small>Server kaliti uchun tizimga kirish kerak; o'z kalitingiz bilan mehmon rejimida ham ishlaydi.</small>}
          </div>
          {err && <div className="insight bad" style={{ gridTemplateColumns: "1fr" }}><div><b>Tahlil bajarilmadi</b><p>{err}</p></div></div>}
        </div>

        <div className="card">
          <div className="row"><h2>2-yo'l · Qo'lda uzatish</h2><span className="chip warn">vaqtinchalik muqobil</span></div>
          <p className="hint">Hisobot (faqat yig'ma raqamlar, xom matn emas) nusxalanadi, siz uni o'z {p.name.split(" ")[0]} suhbatingizga joylaysiz. Bu avtomatik integratsiya emas: javob ilovaga qaytmaydi.</p>
          <textarea readOnly rows={9} value={text} style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", marginTop: 8 }} aria-label="Hisobot matni" />
          <div className="wrap" style={{ marginTop: 10 }}>
            <button type="button" onClick={copyReport}>Hisobotni nusxalash</button>
            <a href={p.site} target="_blank" rel="noopener noreferrer"><button type="button">{p.name.split(" ")[0]}'ni ochish ↗</button></a>
          </div>
        </div>
      </div>

      {last && (
        <div className="card">
          <div className="row" style={{ flexWrap: "wrap" }}>
            <h2>AI takliflari</h2>
            <small>{last.provider} · {last.model} · {new Date(last.at).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })}</small>
          </div>
          <p style={{ marginTop: 10, fontSize: 14.5 }}>{last.xulosa}</p>
          {last.takliflar.map((s, i) => (
            <div key={i} className="insight info" style={{ gridTemplateColumns: "1fr" }}>
              <div>
                <div className="row"><b>{s.sarlavha}</b><span className="chip">{s.turi}{s.ishonch ? ` · ishonch: ${s.ishonch}` : ""}</span></div>
                <dl className="kv" style={{ marginTop: 6 }}>
                  {s.sabab && <><dt>Sabab</dt><dd>{s.sabab}</dd></>}
                  {s.summa && <><dt>Summa</dt><dd><b>{s.summa}</b></dd></>}
                  {s.harakat && <><dt>Harakat</dt><dd>{s.harakat}</dd></>}
                  {s.shartlar && <><dt>Shartlar</dt><dd>{s.shartlar}</dd></>}
                  {s.farazlar && <><dt>Farazlar</dt><dd>{s.farazlar}</dd></>}
                </dl>
                {s.manbalar?.length ? <div className="srcs">{s.manbalar.map((m, j) => m.url ? <a key={j} href={m.url} target="_blank" rel="noopener noreferrer">{m.nom || m.url}{m.tekshirilgan ? ` · ${m.tekshirilgan}` : ""} ↗</a> : <span key={j} className="chip">{m.nom}</span>)}</div> : <small style={{ display: "block", marginTop: 6, color: "var(--warn)" }}>Manba ko'rsatilmagan — tashqi raqamlarni o'zingiz tekshiring.</small>}
              </div>
            </div>
          ))}
          {last.kamchiliklar && <p className="hint" style={{ marginTop: 10 }}><b>Ma'lumot cheklovlari:</b> {last.kamchiliklar}</p>}
          {searchSources.length > 0 && <details className="help"><summary>Qidiruvda ochilgan manbalar ({searchSources.length})</summary><div className="srcs">{searchSources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">{s.nom} ↗</a>)}</div></details>}
        </div>
      )}

      <div className="grid">
        <div className="card">
          <div className="row"><h2>Rasmiy valyuta kursi</h2><span className="chip ok">Markaziy bank</span></div>
          {!rates ? <p className="hint">Yuklanmoqda yoki server bilan aloqa yo'q (mustaqil HTML rejimida bu bo'lim ishlamaydi).</p> : (
            <>
              <table className="table" style={{ marginTop: 8 }}>
                <thead><tr><th>Valyuta</th><th className="r">Kurs (so'm)</th><th className="r">O'zgarish</th></tr></thead>
                <tbody>{rates.rates.map((r) => <tr key={r.ccy}><td>{r.ccy} <small>{r.nom}</small></td><td className="r"><b>{num(r.rate)}</b>{r.nominal !== 1 ? <small> / {r.nominal}</small> : null}</td><td className={`r amt ${r.diff >= 0 ? "in" : "out"}`}>{r.diff >= 0 ? "+" : ""}{num(r.diff)}</td></tr>)}</tbody>
              </table>
              <p className="hint">Manba: <a href={rates.url} target="_blank" rel="noopener noreferrer">{rates.source}</a> · kurs sanasi {rates.rates[0]?.date} · olingan {new Date(rates.fetched_at).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })}. Bank ilovalaridagi sotib olish/sotish kurslari bundan farq qiladi — AI tahlilida so'rang.</p>
            </>
          )}
        </div>
        <div className="card">
          <div className="row"><h2>Omonat kalkulyatori</h2><span className="chip">faraz</span></div>
          <p className="hint">Stavkani bankning rasmiy saytidan tekshirib kiriting (AI tahlili manba bilan beradi). Bu hisob — faraz, taklif emas.</p>
          <div className="fields">
            <div><label className="label" htmlFor="da">Summa · so'm</label><input id="da" inputMode="numeric" value={depAmount || ""} onChange={(e) => setDepAmount(Number(e.target.value.replace(/\D/g, "")) || 0)} placeholder={String(t.home || 5000000)} /></div>
            <div><label className="label" htmlFor="dr">Yillik stavka · %</label><input id="dr" inputMode="decimal" value={depRate} onChange={(e) => setDepRate(e.target.value)} placeholder="masalan 20" /></div>
            <div><label className="label" htmlFor="dm">Muddat · oy</label><input id="dm" inputMode="numeric" value={depMonths || ""} onChange={(e) => setDepMonths(Number(e.target.value.replace(/\D/g, "")) || 0)} /></div>
            <div><label className="label">Foiz hisoblash</label><select value={depCap ? "1" : "0"} onChange={(e) => setDepCap(e.target.value === "1")}><option value="1">Oylik kapitalizatsiya</option><option value="0">Oddiy foiz</option></select></div>
          </div>
          {profit !== null ? (
            <div className="insight good" style={{ gridTemplateColumns: "1fr", marginTop: 12 }}>
              <div><b>Taxminiy foyda: {money(Math.round(profit))}</b><p>{short(depAmount)} × {depRate}% × {depMonths} oy{depCap ? ", oylik kapitalizatsiya" : ""}. Oyiga o'rtacha ≈ {short(profit / depMonths)}. Jismoniy shaxslar omonat foizi bo'yicha soliq va muddatidan oldin yechishdagi shartlarni bank bilan aniqlang.</p></div>
            </div>
          ) : <p className="hint" style={{ marginTop: 10 }}>Summa, stavka va muddatni kiriting.</p>}
        </div>
      </div>
    </div>
  );
}
