import type { Metadata } from "next";
import { Kanit, Anuphan } from "next/font/google";
import "./globals.css";

const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["thai", "latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
});

const anuphan = Anuphan({
  variable: "--font-anuphan",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://league-manager-app.vercel.app"),
  title: {
    default: "88ArenaLeague - ระบบจัดการลีกฟุตบอล",
    template: "%s · 88ArenaLeague",
  },
  description: "ระบบจัดการลีกฟุตบอล จัดตารางแข่ง บันทึกผลสด ตารางคะแนน",
  openGraph: { siteName: "88ArenaLeague", locale: "th_TH", type: "website" },
};

export const viewport = {
  themeColor: "#101410",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${kanit.variable} ${anuphan.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
