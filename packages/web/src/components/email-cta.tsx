"use client";

import { useState } from "react";

export function EmailCTA() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    try {
      const existing = JSON.parse(localStorage.getItem("tycono_emails") ?? "[]") as string[];
      if (!existing.includes(email)) {
        existing.push(email);
        localStorage.setItem("tycono_emails", JSON.stringify(existing));
      }
    } catch {
      // localStorage unavailable — still show success
    }

    setSubmitted(true);
  }

  return (
    <section className="py-24 md:py-32 px-6">
      <div className="max-w-xl mx-auto text-center">
        <h2 className="reveal text-3xl md:text-4xl font-bold mb-4 tracking-tight">
          Stay in the <span className="gradient-text">loop</span>
        </h2>
        <p className="reveal text-base text-base-400 mb-8 max-w-md mx-auto">
          Get notified when new agencies and features drop. No spam, just updates.
        </p>

        {submitted ? (
          <div className="reveal bg-green-400/10 border border-green-400/30 rounded-xl px-6 py-5 inline-flex items-center gap-3">
            <svg className="w-5 h-5 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-green-400 text-sm font-medium">
              You&apos;re on the list. We&apos;ll keep you posted.
            </span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="reveal flex flex-col sm:flex-row items-center gap-3 max-w-md mx-auto">
            <div className="flex-1 w-full">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 bg-base-800/50 border border-base-700/50 rounded-xl text-base-50 placeholder:text-base-600 text-sm focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
                aria-label="Email address"
              />
              {error && (
                <p className="text-red-400 text-xs mt-1.5 text-left">{error}</p>
              )}
            </div>
            <button
              type="submit"
              className="px-6 py-3 bg-gradient-to-r from-accent-dark to-accent rounded-xl text-base-950 font-semibold text-sm hover:shadow-lg hover:shadow-accent/20 transition-all duration-300 hover:-translate-y-0.5 whitespace-nowrap shrink-0"
            >
              Notify me
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
