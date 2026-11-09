"use client";
import { useState } from "react";
import { short, money } from "@/lib/format";
import type { Currency } from "@/lib/types";

export const CAT_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

export interface BarGroup { label: string; title?: string; a: number; b: number }

/** Ikki qatorli ustunlar (kirim/chiqim). Bir o'q, ingichka belgilar, hover tooltip. */
export function GroupedBars({ data, cur = "UZS", aLabel = "Kirim", bLabel = "Chiqim", height = 190, mode = "bar" }: { data: BarGroup[]; cur?: Currency; aLabel?: string; bLabel?: string; height?: number; mode?: "bar" | "line" }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height, padL = 8, padR = 8, padT = 26, padB = 26;
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  const n = Math.max(1, data.length);
  const slot = (W - padL - padR) / n;
  const bw = Math.min(22, Math.max(6, (slot - 10) / 2));
  const plotH = H - padT - padB;
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const ticks = [0, 0.5, 1].map((t) => max * t);
  const tip = hover !== null ? data[hover] : null;
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={data.map((d) => `${d.label}: ${aLabel} ${money(d.a, cur)}, ${bLabel} ${money(d.b, cur)}`).join("; ")} style={{ display: "block", overflow: "visible" }} onMouseLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={W - padR} y={y(t) - 4} fontSize={10} fill="var(--muted)" textAnchor="end">{i === 0 ? "" : short(t, cur)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + slot * i + slot / 2;
          const on = hover === i;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} onClick={() => setHover(on ? null : i)} style={{ cursor: "pointer" }}>
              <rect x={padL + slot * i} y={padT} width={slot} height={plotH + padB} fill={on ? "var(--surface-2)" : "transparent"} />
              {mode === "bar" && <>
                <rect x={cx - bw - 1} y={y(d.a)} width={bw} height={Math.max(0, y(0) - y(d.a))} fill="#1f7a5c" rx={3} opacity={hover === null || on ? 1 : .55} />
                <rect x={cx + 1} y={y(d.b)} width={bw} height={Math.max(0, y(0) - y(d.b))} fill="#b8432f" rx={3} opacity={hover === null || on ? 1 : .55} />
              </>}
              <text x={cx} y={H - 8} fontSize={10.5} fill="var(--ink-2)" textAnchor="middle">{d.label}</text>
            </g>
          );
        })}
        {mode === "line" && (() => {
          const cx = (i: number) => padL + slot * i + slot / 2;
          const ptsA = data.map((d, i) => `${cx(i).toFixed(1)},${y(d.a).toFixed(1)}`).join(" ");
          const ptsB = data.map((d, i) => `${cx(i).toFixed(1)},${y(d.b).toFixed(1)}`).join(" ");
          return (
            <g pointerEvents="none">
              <polygon points={`${cx(0).toFixed(1)},${y(0)} ${ptsB} ${cx(data.length - 1).toFixed(1)},${y(0)}`} fill="#b8432f" opacity={0.07} />
              <polyline points={ptsA} fill="none" stroke="#1f7a5c" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
              <polyline points={ptsB} fill="none" stroke="#b8432f" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
              {data.map((d, i) => (
                <g key={i}>
                  <circle cx={cx(i)} cy={y(d.a)} r={hover === i ? 4.2 : 2.6} fill="#1f7a5c" />
                  <circle cx={cx(i)} cy={y(d.b)} r={hover === i ? 4.2 : 2.6} fill="#b8432f" />
                </g>
              ))}
            </g>
          );
        })()}
        <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="var(--line-2)" strokeWidth={1} />
      </svg>
      <div className="wrap" style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, gap: 14 }}>
        <span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: "#1f7a5c", marginRight: 5 }} />{aLabel}</span>
        <span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: "#b8432f", marginRight: 5 }} />{bLabel}</span>
        {tip && <span style={{ marginLeft: "auto", color: "var(--ink)", fontWeight: 600 }}>{tip.title || tip.label}: <span style={{ color: "#1f7a5c" }}>+{short(tip.a, cur)}</span> · <span style={{ color: "#b8432f" }}>−{short(tip.b, cur)}</span></span>}
      </div>
    </div>
  );
}

/** Toifalar ulushi — konus gradient + ro'yxat (to'g'ridan-to'g'ri yorliqlar) */
export function Donut({ rows, total, cur = "UZS", onPick }: { rows: { category: string; amount: number; share: number; count: number }[]; total: number; cur?: Currency; onPick?: (category: string) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const [pulseKey, setPulseKey] = useState(0);
  const top = rows.slice(0, 7);
  const other = rows.slice(7).reduce((s, r) => s + r.amount, 0);
  const segs = [...top.map((r, i) => ({ label: r.category, v: r.amount, c: CAT_COLORS[i] })), ...(other ? [{ label: "boshqa", v: other, c: "#9aa5b1" }] : [])];
  let acc = 0;
  const stops = segs.map((s) => { const from = acc; acc += (s.v / (total || 1)) * 100; return `${s.c} ${from}% ${acc}%`; });
  /** Diagramma segmentiga bosilganda — pastdagi mos qatorni ajratib ko'rsatamiz */
  function pickSegment(ev: React.MouseEvent<HTMLDivElement>) {
    const r = ev.currentTarget.getBoundingClientRect();
    const dx = ev.clientX - (r.left + r.width / 2);
    const dy = ev.clientY - (r.top + r.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist > r.width / 2 || dist < 40) return; // halqa tashqarisi yoki ichki teshik
    let ang = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0° = tepa, soat yo'nalishida
    if (ang < 0) ang += 360;
    const share = (ang / 360) * 100;
    let a2 = 0;
    for (const s of segs) {
      a2 += (s.v / (total || 1)) * 100;
      if (share < a2) {
        setSel(s.label); setPulseKey((k) => k + 1);
        setTimeout(() => document.querySelector(".catrow.pulse")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 30);
        return;
      }
    }
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
        <div onClick={pickSegment} style={{ width: 128, height: 128, borderRadius: "50%", background: `conic-gradient(${stops.join(",")})`, display: "grid", placeItems: "center", flexShrink: 0, cursor: "pointer" }} role="img" aria-label={segs.map((s) => `${s.label} ${money(s.v, cur)}`).join(", ")} title="Segmentga bosing — pastdagi qatori yonadi">
          <div style={{ width: 86, height: 86, borderRadius: "50%", background: "var(--surface)", display: "grid", placeContent: "center", textAlign: "center" }}>
            <small style={{ fontSize: 10 }}>jami chiqim</small>
            <b style={{ fontSize: 14 }}>{short(total, cur)}</b>
          </div>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          {segs[0] && <><small>Eng katta ulush</small><h3 style={{ textTransform: "capitalize" }}>{segs[0].label}</h3><div style={{ fontSize: 26, fontWeight: 750, letterSpacing: -1 }}>{Math.round((segs[0].v / (total || 1)) * 100)}<small>%</small></div><small>{money(segs[0].v, cur)}</small></>}
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        {segs.map((s, i) => (
          <div
            key={s.label + (sel === s.label ? ":" + pulseKey : "")}
            className={"catrow" + (sel === s.label ? " pulse" : "") + (onPick && s.label !== "boshqa" ? " click" : "")}
            role={onPick && s.label !== "boshqa" ? "button" : undefined}
            title={onPick && s.label !== "boshqa" ? "Tarixda shu toifa chiqimlarini ko'rish" : undefined}
            onClick={() => { if (onPick && s.label !== "boshqa") onPick(s.label); }}
          >
            <div className="row">
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: s.c, flexShrink: 0 }} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}{i < top.length ? <small> · {top[i].count} ta</small> : null}</span></span>
              <b style={{ whiteSpace: "nowrap" }}>{short(s.v, cur)} <small>{Math.round((s.v / (total || 1)) * 100)}%</small></b>
            </div>
            <div className="bar"><i style={{ width: `${(s.v / (total || 1)) * 100}%`, background: s.c }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
