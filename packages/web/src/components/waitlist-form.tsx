"use client";

import { useState, FormEvent } from "react";

interface WaitlistFormProps {
  variant?: "hero" | "footer";
}

export function WaitlistForm({ variant = "hero" }: WaitlistFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;

    try {
      // TODO: Replace with actual endpoint (e.g., Formspree, Resend, or custom API)
      // For now, store in localStorage as MVP fallback
      const existing = JSON.parse(localStorage.getItem("tycono_waitlist") || "[]");
      existing.push({ email, timestamp: new Date().toISOString() });
      localStorage.setItem("tycono_waitlist", JSON.stringify(existing));
      setStatus("success");
      setEmail("");
    } catch {
      setStatus("error");
    }
  };

  if (variant === "footer") {
    return (
      <div>
        <h4 className="text-xs font-semibold text-base-300 uppercase tracking-wider mb-4">Stay Updated</h4>
        {status === "success" ? (
          <p className="text-sm text-green-400">You&apos;re on the list! 🎉</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="flex-1 px-3 py-2 bg-base-800/80 border border-base-600/20 rounded-lg text-sm text-base-50 placeholder:text-base-500 focus:outline-none focus:border-accent/40 transition-colors"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-accent/90 hover:bg-accent text-base-950 text-sm font-medium rounded-lg transition-colors shrink-0"
            >
              Notify me
            </button>
          </form>
        )}
        {status === "error" && <p className="text-xs text-red-400 mt-1">Something went wrong. Try again.</p>}
      </div>
    );
  }

  // Hero variant
  return (
    <div className="reveal max-w-md mx-auto mt-6 mb-4">
      {status === "success" ? (
        <div className="text-center py-3">
          <p className="text-green-400 font-medium">You&apos;re on the waitlist! 🎉</p>
          <p className="text-sm text-base-500 mt-1">We&apos;ll notify you when we launch.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            className="flex-1 px-4 py-3 bg-base-800/80 border border-base-600/30 rounded-xl text-base-50 placeholder:text-base-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
          />
          <button
            type="submit"
            className="px-6 py-3 bg-gradient-to-r from-accent-dark to-accent rounded-xl text-base-950 font-semibold hover:shadow-lg hover:shadow-accent/20 transition-all duration-300 hover:-translate-y-0.5 shrink-0"
          >
            Join waitlist
          </button>
        </form>
      )}
      {status === "error" && <p className="text-xs text-red-400 mt-2 text-center">Something went wrong. Try again.</p>}
      <p className="text-xs text-base-600 mt-2 text-center">No spam. Only launch updates.</p>
    </div>
  );
}
