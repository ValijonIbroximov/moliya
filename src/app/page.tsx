"use client";
import dynamic from "next/dynamic";

// Ilova to'liq brauzerda ishlaydi (localStorage) — serverda render qilinmaydi
const App = dynamic(() => import("@/components/App"), {
  ssr: false,
  loading: () => (
    <div className="shell" style={{ paddingTop: 40, textAlign: "center", color: "var(--muted)" }}>
      <div className="brand" style={{ justifyContent: "center" }}>
        <span className="mark"><span>m</span></span>
        <span className="btxt"><span className="bttl">Moliya <em>AI</em></span><small>© VALIJON IBROXIMOV</small></span>
      </div>
      <p style={{ marginTop: 10 }}>Yuklanmoqda…</p>
    </div>
  ),
});

export default function Page() {
  return <App />;
}
