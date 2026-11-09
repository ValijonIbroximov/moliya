"use client";
// Bosh ekran vidjetlari: /w?v=balans|bugun|limit|maqsad|qarz|kurs
// Har bir variantni telefonda "Bosh ekranga qo'shish" qilsangiz, alohida ikonka bo'lib,
// bosilganda shu vidjet darhol ochiladi (ma'lumot qurilmadagi yozuvlardan).

import dynamic from "next/dynamic";

const W = dynamic(() => import("@/components/HomeWidget"), { ssr: false, loading: () => null });

export default function Page() {
  return <W />;
}
