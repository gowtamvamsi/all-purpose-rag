"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAppStore } from "@/store/useAppStore";
import { Compass, Mail, Lock, Loader2, AlertCircle } from "lucide-react";

export default function Login() {
  const router = useRouter();
  const { token, setToken, setUser, initAuth } = useAppStore();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    if (token) {
      router.push("/dashboard");
    }
  }, [token, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Incorrect email or password");
      }

      setToken(data.access_token);
      setUser(data.user);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8 selection:bg-purple-500 selection:text-white">
      <div className="w-full max-w-md space-y-8 glass-panel p-8 sm:p-10 rounded-2xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-12 -left-12 h-32 w-32 bg-purple-500/10 rounded-full blur-2xl" />
        <div className="absolute -bottom-12 -right-12 h-32 w-32 bg-indigo-500/10 rounded-full blur-2xl" />

        <div className="flex flex-col items-center justify-center text-center">
          <Link className="flex items-center space-x-2 mb-4" href="/">
            <Compass className="h-8 w-8 text-purple-500 animate-spin-slow" />
            <span className="font-extrabold text-2xl tracking-tight bg-gradient-to-r from-white via-slate-200 to-purple-400 bg-clip-text text-transparent">
              OmniBase
            </span>
          </Link>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">Welcome Back</h2>
          <p className="mt-2 text-sm text-slate-400">Sign in to query your knowledge base</p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="flex items-center space-x-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-red-400">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div className="relative">
              <label className="text-xs font-semibold text-slate-400 block mb-1.5" htmlFor="email">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-slate-950/50 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 transition-colors text-sm"
                />
              </div>
            </div>

            <div className="relative">
              <label className="text-xs font-semibold text-slate-400 block mb-1.5" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                <input
                  id="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-slate-950/50 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 transition-colors text-sm"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center py-3 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-lg font-bold text-sm text-white shadow-xl shadow-purple-500/10 focus:outline-none hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing In...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <p className="text-center text-sm text-slate-400">
          Don't have an account?{" "}
          <Link href="/signup" className="font-semibold text-purple-400 hover:text-purple-300 transition-colors">
            Create Account
          </Link>
        </p>
      </div>
    </div>
  );
}
