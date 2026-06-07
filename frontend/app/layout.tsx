import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import GridWorkerController from "@/app/components/GridWorkerController";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "OmniBase - Local RAG Platform",
  description: "Offline-first, multi-tenant local RAG query platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-950 text-slate-100`}
      >
        {children}
        <GridWorkerController />
      </body>
    </html>
  );
}
