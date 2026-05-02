import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";
import Header from "@/components/layout/Header";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { RemoteActiveBanner } from "@/components/layout/RemoteActiveBanner";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "tokmato — Token Tracker",
  description:
    "番茄 token 系统：把学习产出和娱乐消费用诚实的会计单位连起来。",
  applicationName: "tokmato",
  appleWebApp: {
    capable: true,
    title: "tokmato",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "rgb(244 239 230)" },
    { media: "(prefers-color-scheme: dark)", color: "rgb(26 22 20)" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh"
      className={cn(
        instrumentSerif.variable,
        interTight.variable,
        jetbrainsMono.variable,
        "font-sans antialiased"
      )}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-paper text-ink">
        <Providers>
          <div className="page-shell">
            <RemoteActiveBanner />
            <Header />
            {children}
          </div>
          <MobileTabBar />
        </Providers>
      </body>
    </html>
  );
}
