import type { Metadata, Viewport } from "next";
import "./globals.css";
import { THEME_BOOT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Moliya AI — yozing, qolganini kuzating",
  description: "O'zbek tilidagi shaxsiy moliya kundaligi: tez yozuv, avtomatik saqlash, aniq statistika va AI takliflari.",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Moliya" },
};

export const viewport: Viewport = {
  themeColor: "#eef1f3",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        {children}
      </body>
    </html>
  );
}
