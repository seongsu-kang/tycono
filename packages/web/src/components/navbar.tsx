"use client";

import Link from "next/link";
import { useState } from "react";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-nav border-b border-white/5">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-base-800 border border-base-600/30 flex items-center justify-center">
            <span className="text-accent font-bold text-sm">T</span>
          </div>
          <span className="font-display font-semibold text-lg text-base-50">Tycono</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8 text-sm">
          <Link href="/" className="text-base-50 transition-colors duration-300 border-b border-accent pb-0.5">Home</Link>
          <Link href="/agencies" className="text-base-400 hover:text-base-50 transition-colors duration-300">Agencies</Link>
          <a href="#plugin" className="text-base-400 hover:text-base-50 transition-colors duration-300">Plugin</a>
          <span className="text-base-700">|</span>
          <a href="https://github.com/seongsu-kang/tycono" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-base-400 hover:text-base-50 transition-colors duration-300">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
            GitHub
          </a>
        </div>

        <a href="#agencies" className="hidden md:inline-flex px-5 py-2.5 bg-accent/10 border border-accent/30 rounded-lg text-accent hover:bg-accent/20 hover:border-accent/50 transition-all duration-300 text-sm font-medium">
          Browse Agencies
        </a>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 text-base-400"
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="flex flex-col px-6 pb-4 gap-4 text-sm md:hidden">
          <Link href="/" className="text-base-50" onClick={() => setMobileOpen(false)}>Home</Link>
          <Link href="/agencies" className="text-base-400 hover:text-base-50" onClick={() => setMobileOpen(false)}>Agencies</Link>
          <a href="#plugin" className="text-base-400 hover:text-base-50" onClick={() => setMobileOpen(false)}>Plugin</a>
          <div className="border-t border-base-700/30 my-1"></div>
          <a href="https://github.com/seongsu-kang/tycono" target="_blank" rel="noopener noreferrer" className="text-accent">GitHub</a>
        </div>
      )}
    </nav>
  );
}
