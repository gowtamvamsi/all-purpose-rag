"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAppStore } from "@/store/useAppStore";
import { Database, FileText, MessageSquare, Compass, ArrowRight, ShieldCheck } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const { token, initAuth } = useAppStore();

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    if (token) {
      router.push("/dashboard");
    }
  }, [token, router]);

  return (
    <div className="flex flex-col min-h-screen text-slate-100 selection:bg-purple-500 selection:text-white">
      {/* Navbar */}
      <header className="px-6 lg:px-12 h-16 flex items-center justify-between border-b border-slate-800/60 backdrop-blur-md sticky top-0 z-50 bg-slate-950/40">
        <Link className="flex items-center justify-center space-x-2" href="#">
          <Compass className="h-6 w-6 text-purple-500 animate-spin-slow" />
          <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-slate-200 to-purple-400 bg-clip-text text-transparent">
            OmniBase
          </span>
        </Link>
        <nav className="flex gap-4 sm:gap-6 items-center">
          <Link className="text-sm font-semibold text-slate-300 hover:text-white transition-colors" href="/login">
            Sign In
          </Link>
          <Link 
            className="text-sm font-bold bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-md shadow-lg shadow-purple-500/25 transition-all text-white hover:scale-105 active:scale-95" 
            href="/signup"
          >
            Get Started
          </Link>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="w-full py-16 md:py-24 lg:py-32 xl:py-40 flex items-center justify-center">
          <div className="container px-4 md:px-6 flex flex-col items-center text-center space-y-8">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-xs font-semibold text-purple-400">
              <span>OmniBase Platform 1.0 is officially live</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
            
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight max-w-4xl">
              Your All-Purpose{" "}
              <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
                RAG Knowledge Base
              </span>
            </h1>
            
            <p className="max-w-[700px] text-slate-400 md:text-xl font-medium leading-relaxed">
              Upload PDFs, Word docs, images, CSVs, and more. Generate isolated projects and chat with your files using streams and full citations.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link 
                className="inline-flex items-center justify-center text-base font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 px-8 py-3 rounded-lg shadow-xl shadow-purple-500/10 transition-all hover:scale-105 active:scale-95 text-white" 
                href="/signup"
              >
                Start for Free
              </Link>
              <Link 
                className="inline-flex items-center justify-center text-base font-semibold border border-slate-700 hover:border-slate-500 bg-slate-900/40 hover:bg-slate-900/80 px-8 py-3 rounded-lg transition-all" 
                href="/login"
              >
                Sign In
              </Link>
            </div>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="w-full py-16 md:py-24 border-t border-slate-800/40 bg-slate-950/20 flex justify-center">
          <div className="container px-4 md:px-6">
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              <div className="glass-panel p-8 rounded-xl flex flex-col space-y-4">
                <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg w-fit">
                  <Database className="h-6 w-6 text-purple-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-100">Isolated Projects</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Keep your data separate. Create distinct projects for different clients, courses, or codebases. Document retrieval never leaks across boundaries.
                </p>
              </div>

              <div className="glass-panel p-8 rounded-xl flex flex-col space-y-4">
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg w-fit">
                  <FileText className="h-6 w-6 text-blue-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-100">Multi-Format Ingestion</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Extracts raw text automatically from PDFs, Microsoft Word (.docx), PowerPoint (.pptx), spreadsheets (.csv), text, markdown, and scanned images.
                </p>
              </div>

              <div className="glass-panel p-8 rounded-xl flex flex-col space-y-4">
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg w-fit">
                  <MessageSquare className="h-6 w-6 text-green-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-100">Streamed QA + Sources</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Watch responses render token-by-token. Every answer compiles specific cited references to document names, slide sheets, or page offsets.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-6 w-full border-t border-slate-800/40 px-6 lg:px-12 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500">
        <p>© 2026 OmniBase. Developed for Antigravity RAG.</p>
        <div className="flex gap-4 sm:gap-6 mt-4 sm:mt-0">
          <Link className="hover:text-slate-300 transition-colors" href="#">Terms of Service</Link>
          <Link className="hover:text-slate-300 transition-colors" href="#">Privacy Policy</Link>
        </div>
      </footer>
    </div>
  );
}
