import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description =
  "Private AI vision with 365 automatic object classes, open-vocabulary search, and device-local learning.";

export const metadata: Metadata = {
  title: "SceneLens — Real-time AI visual assistance",
  description,
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "SceneLens AI Vision",
    description,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "SceneLens AI Vision",
    description,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
