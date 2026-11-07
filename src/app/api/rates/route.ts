// O'zbekiston Markaziy banki rasmiy kurslari (ochiq JSON API), 1 soat kesh.
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 3600;

const SRC = "https://cbu.uz/uz/arkhiv-kursov-valyut/json/";

interface CbuRow { Ccy: string; CcyNm_UZ: string; Nominal: string; Rate: string; Diff: string; Date: string }

export async function GET() {
  try {
    const r = await fetch(SRC, { next: { revalidate: 3600 }, headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("CBU " + r.status);
    const rows = (await r.json()) as CbuRow[];
    const want = ["USD", "EUR", "RUB", "KZT", "TRY"];
    const out = rows
      .filter((x) => want.includes(x.Ccy))
      .map((x) => ({ ccy: x.Ccy, nom: x.CcyNm_UZ, nominal: +x.Nominal, rate: +x.Rate, diff: +x.Diff, date: x.Date }))
      .sort((a, b) => want.indexOf(a.ccy) - want.indexOf(b.ccy));
    return NextResponse.json({ ok: true, source: "O'zbekiston Respublikasi Markaziy banki", url: "https://cbu.uz/uz/arkhiv-kursov-valyut/", fetched_at: new Date().toISOString(), rates: out }, { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
