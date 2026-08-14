import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

// Inter everywhere — display headings share the body face, only mono differs.
const display = Inter({
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "OpenGong Lite: sales call notes that cite the call",
  description:
    "Upload a sales call. Get summary, objections, intent, next steps, and a follow-up email. Every note carries a citation to the moment it came from, and the app checks every citation before it ships.",
};

// `LayoutProps<"/">` is a global Next generates into .next/types during a
// build. On a fresh clone there is no .next yet, so `npx tsc --noEmit` — the
// first thing a cloner runs — failed on an undefined name. Typing the props
// here keeps the typecheck honest before the first build.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
