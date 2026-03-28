import Link from "next/link";
import { agencies } from "@/data/agencies";
import { AgencyCard } from "@/components/agency-card";
import { LandingAnimations } from "@/components/landing-animations";

const featured = agencies.filter((a) => !a.comingSoon).slice(0, 3);
const comingSoon = agencies.filter((a) => a.comingSoon).slice(0, 4);

export default function HomePage() {
  return (
    <div>
      {/* Background particles */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="particle particle-1"></div>
        <div className="particle particle-2"></div>
        <div className="particle particle-3"></div>
      </div>

      {/* ==================== Hero ==================== */}
      <section className="relative min-h-screen flex items-center justify-center pt-20 px-6 overflow-hidden">
        <div className="hero-glow"></div>
        <div className="max-w-5xl mx-auto text-center relative z-10">
          {/* Badge */}
          <div className="reveal inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/5 border border-accent/15 text-accent text-sm mb-8">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
            Open Source &middot; MIT License
          </div>

          {/* Headline */}
          <h1 className="reveal text-5xl md:text-7xl lg:text-8xl font-black leading-[1.05] mb-6 tracking-tight">
            Your company,<br/>
            <span className="gradient-text">in code.</span>
          </h1>

          {/* Subtitle */}
          <p className="reveal text-lg md:text-xl text-base-400 mb-4 max-w-2xl mx-auto leading-relaxed">
            Define your org. Give one order. Your AI team plans, builds, and learns &mdash;
            and they remember everything next time.
          </p>
          <p className="reveal text-sm md:text-base text-base-500 mb-8 max-w-xl mx-auto">
            Terminal-native. Local-first. Open source.
          </p>

          {/* Plugin install block */}
          <div className="reveal code-block-landing rounded-2xl p-5 max-w-md mx-auto warm-glow mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/40"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/40"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/40"></div>
              </div>
              <span className="text-xs text-base-500 font-mono">Terminal</span>
            </div>
            <div className="space-y-1 font-mono text-sm text-left">
              <div className="flex items-center gap-3">
                <span className="text-base-500">$</span>
                <code className="text-base-50">claude plugin install tycono</code>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-base-500">$</span>
                <code className="text-accent">/tycono --agency gamedev &quot;Make a tower defense&quot;</code>
              </div>
            </div>
          </div>

          {/* Dual CTA */}
          <div className="reveal flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <a href="#agencies" className="group px-8 py-4 bg-gradient-to-r from-accent-dark to-accent rounded-xl text-base-950 font-semibold hover:shadow-xl hover:shadow-accent/20 transition-all duration-300 hover:-translate-y-0.5">
              Browse Agencies <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">&rarr;</span>
            </a>
            <a href="https://github.com/seongsu-kang/tycono" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-8 py-4 bg-base-800/80 border border-base-600/20 rounded-xl text-base-50 font-medium hover:bg-base-700 hover:border-base-600/40 transition-all duration-300">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
              View on GitHub
            </a>
          </div>

          {/* Hero: TUI terminal demo */}
          <div className="reveal-scale rounded-2xl overflow-hidden max-w-4xl mx-auto warm-glow border border-base-700/30 ring-1 ring-base-600/10 bg-base-950">
            <div className="p-4 border-b border-base-700/30 flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/40"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/40"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/40"></div>
              <span className="ml-3 text-xs text-base-500 font-mono">Terminal</span>
            </div>
            <pre className="p-6 text-sm md:text-base font-mono text-left leading-relaxed overflow-x-auto"><code><span className="text-yellow-400">&gt;</span> <span className="text-base-50">Build a landing page for our product</span>{"\n"}{"\n"}<span className="text-cyan-400">&#9654; Supervisor started</span>{"\n"}<span className="text-base-400">I&apos;ll dispatch CTO for implementation and CBO for copywriting...</span>{"\n"}<span className="text-yellow-400">&rarr; cto: Landing page structure</span>{"\n"}<span className="text-yellow-400">&rarr; cbo: Product messaging</span>{"\n"}  <span className="text-base-500">&rarr; Read architecture/deployment.md</span>{"\n"}  <span className="text-base-500">&rarr; dispatch fe-engineer: Build responsive page</span>{"\n"}  <span className="text-base-300">cto         </span><span className="text-base-400">&#9654; Reviewing architecture...</span>{"\n"}  <span className="text-base-300">fe-engineer </span><span className="text-green-400">Write src/landing/index.html</span>{"\n"}  <span className="text-base-300">fe-engineer </span><span className="text-green-400">Write src/landing/styles.css</span>{"\n"}  <span className="text-base-300">cbo         </span><span className="text-green-400">&#10003; done (5 turns)</span>{"\n"}  <span className="text-base-300">fe-engineer </span><span className="text-green-400">&#10003; done (12 turns)</span>{"\n"}<span className="text-cyan-400">&#10003; Supervisor done (8 turns)</span>{"\n"}<span className="text-yellow-400">&gt;</span> <span className="text-base-600">_</span></code></pre>
          </div>

          {/* Origin: Pixel office */}
          <div className="reveal mt-12 text-center">
            <p className="text-sm text-base-500 mb-4">Started as an AI office tycoon game. The agents were too useful to keep in a game.</p>
            <div className="rounded-xl overflow-hidden max-w-md mx-auto opacity-60 hover:opacity-100 transition-opacity duration-500 border border-base-700/20">
              <img src="assets/hero-office.png" alt="Where it started — pixel office tycoon" className="w-full h-auto" loading="lazy" />
            </div>
            <p className="text-xs text-base-600 mt-2">The pixel office lives on: <code className="text-accent/60">npx tycono --classic</code></p>
          </div>
        </div>
      </section>

      {/* ==================== Social Proof Bar ==================== */}
      <div className="section-divider"></div>
      <section className="py-12 px-6">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-8 md:gap-12 text-sm text-base-400">
          <div className="reveal stagger-1 flex items-center gap-2">
            <svg className="w-5 h-5 text-accent/60" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
            Open Source
          </div>
          <div className="reveal stagger-2 flex items-center gap-2">
            <svg className="w-5 h-5 text-accent/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
            MIT License
          </div>
          <div className="reveal stagger-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-accent/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7"/></svg>
            Local-First
          </div>
          <div className="reveal stagger-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-accent/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
            Bring Your Own Keys
          </div>
        </div>
      </section>
      <div className="section-divider"></div>

      {/* ==================== Stats bar ==================== */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div className="reveal stagger-1">
            <div className="text-3xl md:text-4xl font-bold mb-2"><span className="num-highlight">&infin;</span></div>
            <div className="text-sm text-base-400">Custom Roles</div>
          </div>
          <div className="reveal stagger-2">
            <div className="text-3xl md:text-4xl font-bold mb-2"><span className="num-highlight">File-first</span></div>
            <div className="text-sm text-base-400">Persistent Knowledge</div>
          </div>
          <div className="reveal stagger-3">
            <div className="text-3xl md:text-4xl font-bold mb-2"><span className="num-highlight">Git</span></div>
            <div className="text-sm text-base-400">Version-controlled State</div>
          </div>
          <div className="reveal stagger-4">
            <div className="text-3xl md:text-4xl font-bold mb-2"><span className="num-highlight">100%</span></div>
            <div className="text-sm text-base-400">Local &amp; Private</div>
          </div>
        </div>
      </section>
      <div className="section-divider"></div>

      {/* ==================== AI Team ==================== */}
      <section id="team" className="py-24 md:py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="reveal text-4xl md:text-5xl font-bold mb-4 tracking-tight">
              Meet your <span className="gradient-text">AI team</span>
            </h2>
            <p className="reveal text-lg text-base-400 max-w-xl mx-auto">
              Each agent has a defined role, authority scope, and knowledge base. They collaborate through a real org hierarchy.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 max-w-4xl mx-auto">
            <div className="reveal stagger-1 landing-card rounded-2xl p-6">
              <div className="role-icon bg-blue-500/10 text-blue-400 mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
              </div>
              <h3 className="font-semibold text-base-50 mb-1">CTO</h3>
              <p className="text-sm text-base-400 mb-3">Technical architecture, code review, infrastructure decisions</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400/70">Architecture</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400/70">Tech Lead</span>
              </div>
            </div>
            <div className="reveal stagger-2 landing-card rounded-2xl p-6">
              <div className="role-icon bg-emerald-500/10 text-emerald-400 mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
              </div>
              <h3 className="font-semibold text-base-50 mb-1">CBO</h3>
              <p className="text-sm text-base-400 mb-3">Market analysis, revenue strategy, competitive intelligence</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400/70">Business</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400/70">Strategy</span>
              </div>
            </div>
            <div className="reveal stagger-3 landing-card rounded-2xl p-6">
              <div className="role-icon bg-purple-500/10 text-purple-400 mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
              </div>
              <h3 className="font-semibold text-base-50 mb-1">Product Manager</h3>
              <p className="text-sm text-base-400 mb-3">PRD writing, task breakdown, sprint planning, stakeholder alignment</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400/70">Planning</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400/70">Roadmap</span>
              </div>
            </div>
            <div className="reveal stagger-4 landing-card rounded-2xl p-6">
              <div className="role-icon bg-orange-500/10 text-orange-400 mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.42 15.17l-5.384-3.107A.903.903 0 015 11.253V7.548a.9.9 0 01.445-.774l5.384-3.107a.912.912 0 01.89 0l5.384 3.107A.9.9 0 0117.5 7.548v3.705a.903.903 0 01-.445.81l-5.384 3.107a.912.912 0 01-.89 0z"/></svg>
              </div>
              <h3 className="font-semibold text-base-50 mb-1">Engineer</h3>
              <p className="text-sm text-base-400 mb-3">Code implementation, bug fixes, testing, pull requests</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400/70">Coding</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400/70">Testing</span>
              </div>
            </div>
            <div className="reveal stagger-5 landing-card rounded-2xl p-6">
              <div className="role-icon bg-pink-500/10 text-pink-400 mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/></svg>
              </div>
              <h3 className="font-semibold text-base-50 mb-1">Designer</h3>
              <p className="text-sm text-base-400 mb-3">UI/UX design, wireframes, mockups, design system</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-400/70">UI/UX</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-400/70">Visual</span>
              </div>
            </div>
            <div className="reveal stagger-6 landing-card rounded-2xl p-6">
              <div className="role-icon bg-yellow-500/10 text-yellow-400 mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </div>
              <h3 className="font-semibold text-base-50 mb-1">QA Engineer</h3>
              <p className="text-sm text-base-400 mb-3">Test planning, bug reporting, quality assurance, regression testing</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400/70">Testing</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400/70">Quality</span>
              </div>
            </div>
          </div>

          <p className="reveal text-center text-base-500 text-sm mt-8">
            + Create custom roles: Researcher, Data Analyst, DevOps, Writer, and more
          </p>
        </div>
      </section>

      {/* ==================== Org Flow (Animated SVG) ==================== */}
      <div className="section-divider"></div>
      <section className="py-24 md:py-32 px-6 overflow-hidden">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="reveal text-4xl md:text-5xl font-bold mb-4 tracking-tight">
              One order. <span className="gradient-text">Everyone moves.</span>
            </h2>
            <p className="reveal text-lg text-base-400 max-w-xl mx-auto">
              Tasks cascade through a real org hierarchy. CEO delegates to CTO, CTO dispatches to engineers &mdash; all sharing the same knowledge base.
            </p>
          </div>

          {/* Animated org chart */}
          <div id="org-chart" className="reveal-scale max-w-3xl mx-auto">
            <svg viewBox="0 0 700 400" className="w-full" style={{ maxHeight: 460 }}>
              {/* Knowledge base bar */}
              <rect className="org-kb" x="30" y="350" width="640" height="28" rx="8" fill="rgba(52,211,153,0.04)" stroke="rgba(52,211,153,0.12)" strokeWidth="1" strokeDasharray="4 3"/>
              <text className="org-kb" x="350" y="368" textAnchor="middle" fill="rgba(52,211,153,0.45)" fontSize="9" fontWeight="500" fontFamily="Inter, sans-serif" letterSpacing="2">SHARED KNOWLEDGE BASE</text>

              {/* KB connections (dashed) */}
              {[83,171,259,350,441,529,617].map(x => (
                <line key={x} x1={x} y1="296" x2={x} y2="350" stroke="rgba(52,211,153,0.06)" strokeWidth="1" strokeDasharray="2 3"/>
              ))}

              {/* Hierarchy lines */}
              <line className="org-line" data-from="ceo" data-to="cto" x1="350" y1="62" x2="190" y2="138" stroke="rgba(138,138,154,0.12)" strokeWidth="1.5"/>
              <line className="org-line" data-from="ceo" data-to="cbo" x1="350" y1="62" x2="510" y2="138" stroke="rgba(138,138,154,0.12)" strokeWidth="1.5"/>
              <line className="org-line" data-from="cto" data-to="r0" x1="190" y1="180" x2="83" y2="260" stroke="rgba(138,138,154,0.12)" strokeWidth="1.5"/>
              <line className="org-line" data-from="cto" data-to="r1" x1="190" y1="180" x2="171" y2="260" stroke="rgba(138,138,154,0.12)" strokeWidth="1.5"/>
              <line className="org-line" data-from="cto" data-to="r2" x1="190" y1="180" x2="259" y2="260" stroke="rgba(138,138,154,0.12)" strokeWidth="1.5"/>
              <line className="org-line" data-from="cto" data-to="r3" x1="190" y1="180" x2="350" y2="260" stroke="rgba(138,138,154,0.12)" strokeWidth="1.5"/>
              <line className="org-line" data-from="cbo" data-to="r4" x1="510" y1="180" x2="441" y2="260" stroke="rgba(138,138,154,0.12)" strokeWidth="1.5"/>
              <line className="org-line" data-from="cbo" data-to="r5" x1="510" y1="180" x2="529" y2="260" stroke="rgba(138,138,154,0.12)" strokeWidth="1.5"/>
              <line className="org-line" data-from="cbo" data-to="r6" x1="510" y1="180" x2="617" y2="260" stroke="rgba(138,138,154,0.12)" strokeWidth="1.5"/>

              {/* Nodes */}
              <g className="org-node" data-delay="0" data-id="ceo">
                <rect x="295" y="20" width="110" height="44" rx="12" fill="#1e1e28" stroke="rgba(255,140,66,0.4)" strokeWidth="1.5"/>
                <text x="350" y="46" textAnchor="middle" fill="#FF8C42" fontSize="14" fontWeight="600" fontFamily="DM Sans, Inter, sans-serif">CEO</text>
              </g>
              <g className="org-node" data-delay="400" data-id="cto">
                <rect x="140" y="136" width="100" height="44" rx="12" fill="#1e1e28" stroke="rgba(96,165,250,0.3)" strokeWidth="1.5"/>
                <text x="190" y="162" textAnchor="middle" fill="#60A5FA" fontSize="13" fontWeight="600" fontFamily="DM Sans, Inter, sans-serif">CTO</text>
              </g>
              <g className="org-node" data-delay="500" data-id="cbo">
                <rect x="460" y="136" width="100" height="44" rx="12" fill="#1e1e28" stroke="rgba(52,211,153,0.3)" strokeWidth="1.5"/>
                <text x="510" y="162" textAnchor="middle" fill="#34D399" fontSize="13" fontWeight="600" fontFamily="DM Sans, Inter, sans-serif">CBO</text>
              </g>
              {/* Bottom row roles */}
              {[
                { id: "r0", delay: 700, x: 46, label: "Engineer", fill: "#FB923C", stroke: "rgba(251,146,60,0.3)" },
                { id: "r1", delay: 800, x: 134, label: "Engineer", fill: "#FB923C", stroke: "rgba(251,146,60,0.3)" },
                { id: "r2", delay: 900, x: 222, label: "PM", fill: "#A855F7", stroke: "rgba(168,85,247,0.3)" },
                { id: "r3", delay: 950, x: 313, label: "Designer", fill: "#EC4899", stroke: "rgba(236,72,153,0.3)" },
                { id: "r4", delay: 1000, x: 404, label: "Analyst", fill: "#22D3EE", stroke: "rgba(34,211,238,0.3)" },
                { id: "r5", delay: 1050, x: 492, label: "QA", fill: "#FACC15", stroke: "rgba(250,204,21,0.3)" },
                { id: "r6", delay: 1100, x: 580, label: "Writer", fill: "#F472B6", stroke: "rgba(244,114,182,0.3)" },
              ].map(r => (
                <g key={r.id} className="org-node" data-delay={r.delay} data-id={r.id}>
                  <rect x={r.x} y="258" width="74" height="36" rx="10" fill="#1e1e28" stroke={r.stroke} strokeWidth="1.5"/>
                  <text x={r.x + 37} y="280" textAnchor="middle" fill={r.fill} fontSize="10" fontWeight="500" fontFamily="Inter, sans-serif">{r.label}</text>
                </g>
              ))}

              <text x="350" y="320" textAnchor="middle" fill="rgba(138,138,154,0.3)" fontSize="11" fontWeight="500" fontFamily="Inter, sans-serif">+ DevOps, Researcher, Legal, Marketing, and any role you define</text>
            </svg>
            <div id="dispatch-label" className="sr-only"><div id="dispatch-text"></div><div id="dispatch-sub"></div></div>
          </div>
        </div>
      </section>

      {/* ==================== How it Works ==================== */}
      <div className="section-divider"></div>
      <section id="how-it-works" className="py-24 md:py-32 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="reveal text-4xl md:text-5xl font-bold mb-4 tracking-tight">
              Up and running in <span className="gradient-text">3 steps</span>
            </h2>
            <p className="reveal text-lg text-base-400">From zero to your first AI company. No signup required.</p>
          </div>

          <div className="space-y-12">
            {/* Step 1 */}
            <div className="reveal flex gap-6 items-start">
              <div className="flex flex-col items-center">
                <div className="step-dot w-12 h-12 rounded-xl flex items-center justify-center text-base-950 font-bold text-lg shrink-0">1</div>
                <div className="w-px h-full bg-base-700/50 mt-2"></div>
              </div>
              <div className="flex-1 pb-4">
                <h3 className="text-xl font-semibold text-base-50 mb-2">Install the plugin</h3>
                <p className="text-base-400 mb-4">One command inside Claude Code. No separate install needed.</p>
                <div id="typing-block" className="code-block-landing rounded-xl p-4 font-mono text-sm">
                  <div className="typing-line"><span className="text-base-500">$</span> <span className="text-base-50">claude plugin install tycono</span></div>
                  <div className="typing-line"><span className="text-green-400/70">Plugin installed successfully</span></div>
                  <div className="typing-line"><span className="text-green-400/70">Available commands: /tycono, /tycono:agency-list</span></div>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="reveal flex gap-6 items-start">
              <div className="flex flex-col items-center">
                <div className="step-dot w-12 h-12 rounded-xl flex items-center justify-center text-base-950 font-bold text-lg shrink-0">2</div>
                <div className="w-px h-full bg-base-700/50 mt-2"></div>
              </div>
              <div className="flex-1 pb-4">
                <h3 className="text-xl font-semibold text-base-50 mb-2">Build your team</h3>
                <p className="text-base-400 mb-4">Guided setup wizard. Pick your AI engine, name your company, choose a team template.</p>
                <div className="slideshow max-w-lg aspect-[560/500]">
                  <img src="assets/wizard-1-engine.png" alt="Step 1: AI Engine Setup" loading="lazy" />
                  <img src="assets/wizard-2-project.png" alt="Step 2: Company Info" loading="lazy" />
                  <img src="assets/wizard-3-team.png" alt="Step 3: Project Setup" loading="lazy" />
                  <img src="assets/wizard-4-review.png" alt="Step 4: Knowledge Strategy" loading="lazy" />
                  <img src="assets/wizard-5-done.png" alt="Step 5: Team Template" loading="lazy" />
                  <img src="assets/wizard-6-office.png" alt="Step 6: Company Created" loading="lazy" />
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="reveal flex gap-6 items-start">
              <div className="flex flex-col items-center">
                <div className="step-dot w-12 h-12 rounded-xl flex items-center justify-center text-base-950 font-bold text-lg shrink-0">3</div>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-base-50 mb-2">Watch them work</h3>
                <p className="text-base-400 mb-4">Give orders from the CEO desk. Watch tasks flow through your organization in real time.</p>
                <div className="rounded-xl overflow-hidden max-w-2xl border border-base-700/30 warm-glow mb-4">
                  <img src="assets/hero-office.png" alt="Isometric office view — AI agents at their desks" className="w-full h-auto" loading="lazy" />
                </div>
                <div className="rounded-xl overflow-hidden max-w-2xl border border-base-700/30 warm-glow mb-4">
                  <img src="assets/wave-dispatch.png" alt="CEO Wave — dispatch directives to your entire organization" className="w-full h-auto" loading="lazy" />
                </div>
                <div className="rounded-xl overflow-hidden max-w-2xl border border-base-700/30 warm-glow">
                  <img src="assets/sidepanel-chat.png" alt="Side panel — talking with CTO, real-time task progress" className="w-full h-auto" loading="lazy" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== Features ==================== */}
      <div className="section-divider"></div>
      <section id="features" className="py-24 md:py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="reveal text-4xl md:text-5xl font-bold mb-4 tracking-tight">
              Not just another <span className="gradient-text">AI chatbot</span>
            </h2>
            <p className="reveal text-lg text-base-400 max-w-xl mx-auto">
              A complete organizational simulator with hierarchy, knowledge, and persistence.
            </p>
          </div>

          {/* Tier 1: Run Your Company */}
          <div className="text-center mb-8">
            <p className="reveal text-accent font-mono text-sm mb-2">{"// run_your_company"}</p>
            <h3 className="reveal text-2xl font-bold text-base-100">Run Your Company</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
            {[
              { icon: ">_", title: "Wave Dispatch", desc: "One order cascades through your entire org. CEO speaks, everyone moves." },
              { icon: "\u{1F4AC}", title: "Talk to Anyone", desc: "Chat with any role directly. Ask questions, give feedback, drill down into their work." },
              { icon: "\u{1F4CB}", title: "Task Assignment", desc: "Assign work through the hierarchy. Authority is validated \u2014 roles only act within their scope." },
              { icon: "\u{1F500}", title: "Git = Save File", desc: "Every task runs in a git worktree. Branch, commit, revert. Your company has version control." },
            ].map((f, i) => (
              <div key={i} className={`reveal stagger-${i+1} bg-base-800/50 border border-base-700/50 rounded-xl p-5 hover:border-accent/30 transition-colors`}>
                <div className="text-2xl mb-3 font-mono text-accent">{f.icon}</div>
                <h4 className="text-base font-semibold text-base-100 mb-2">{f.title}</h4>
                <p className="text-sm text-base-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Wave Dispatch Showcase */}
          <div className="reveal bg-base-800/30 border border-base-700/30 rounded-2xl p-6 md:p-8 mb-16 max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse"></div>
              <p className="text-accent font-mono text-xs uppercase tracking-wider">Wave in action</p>
            </div>
            <div className="rounded-xl overflow-hidden border border-base-700/30 warm-glow mb-6">
              <img src="assets/feature-wave-full.png" alt="CEO dispatches a wave" className="w-full h-auto" loading="lazy" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {[
                { num: "01", title: "Write a directive", sub: "Type one sentence. The CEO speaks." },
                { num: "02", title: "Cascade through hierarchy", sub: "CTO, PM, Designer \u2014 each gets their piece." },
                { num: "03", title: "Watch them work", sub: "Real-time execution. Every agent moves." },
              ].map(s => (
                <div key={s.num} className="flex items-start gap-3 bg-base-900/50 rounded-lg p-4">
                  <span className="text-accent font-mono text-lg font-bold shrink-0">{s.num}</span>
                  <div>
                    <p className="text-sm font-semibold text-base-200">{s.title}</p>
                    <p className="text-xs text-base-500">{s.sub}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg overflow-hidden border border-base-700/20 group">
                <div className="aspect-[16/10] overflow-hidden">
                  <img src="assets/feature-save-game.png" alt="Save Game — git commit" className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                </div>
                <div className="bg-base-900/80 px-3 py-2">
                  <p className="text-xs text-base-400">Save Game &mdash; every change is version-controlled</p>
                </div>
              </div>
              <div className="rounded-lg overflow-hidden border border-base-700/20 group">
                <div className="aspect-[16/10] overflow-hidden">
                  <img src="assets/sidepanel-chat.png" alt="Team chat" className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                </div>
                <div className="bg-base-900/80 px-3 py-2">
                  <p className="text-xs text-base-400">Team chat &mdash; agents discuss and debate autonomously</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tier 2: Grow Smarter */}
          <div className="text-center mb-8">
            <p className="reveal text-accent font-mono text-sm mb-2">{"// grow_smarter"}</p>
            <h3 className="reveal text-2xl font-bold text-base-100">Grow Smarter</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
            {[
              { icon: "\u{1F9E0}", title: "Living Knowledge", desc: "Cross-linked markdown docs that grow with every task. Search, navigate, never lose context." },
              { icon: "\u{1F4CA}", title: "Cost Tracking", desc: "See exactly how many tokens each role uses. Per-model, per-job cost breakdown." },
              { icon: "\u{26A1}", title: "Skill System", desc: "Equip roles with modular skills. Code review, deployment, design system \u2014 swap capabilities." },
              { icon: "\u{1F3C6}", title: "Level Up", desc: "10-level progression system. Roles gain experience, unlock 31 accessories. Watch them grow." },
            ].map((f, i) => (
              <div key={i} className={`reveal stagger-${i+1} bg-base-800/50 border border-base-700/50 rounded-xl p-5 hover:border-accent/30 transition-colors`}>
                <div className="text-2xl mb-3">{f.icon}</div>
                <h4 className="text-base font-semibold text-base-100 mb-2">{f.title}</h4>
                <p className="text-sm text-base-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Knowledging Phase */}
          <div className="reveal bg-base-800/30 border border-base-700/30 rounded-2xl p-6 md:p-8 mb-8 max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
              <p className="text-green-400 font-mono text-xs uppercase tracking-wider">Knowledging Phase</p>
            </div>
            <p className="text-base-300 text-sm mb-6 max-w-2xl">Every AI agent today follows the same loop: <span className="text-base-100 font-semibold">Plan &rarr; Execute &rarr; Done.</span> Knowledge resets every session. Tycono adds a layer the industry doesn&apos;t have.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
              <div className="bg-base-900/60 rounded-xl p-5 border border-base-700/30">
                <p className="text-xs font-mono text-base-500 uppercase tracking-wider mb-3">Industry standard</p>
                <div className="flex items-center gap-2 font-mono text-sm">
                  <span className="text-base-400">Plan</span>
                  <span className="text-base-600">&rarr;</span>
                  <span className="text-base-400">Execute</span>
                  <span className="text-base-600">&rarr;</span>
                  <span className="text-base-500">Done</span>
                </div>
                <p className="text-xs text-base-600 mt-3">Single agent, repeating agent &mdash; no knowledge layer.</p>
              </div>
              <div className="bg-base-900/60 rounded-xl p-5 border border-green-500/30">
                <p className="text-xs font-mono text-green-400 uppercase tracking-wider mb-3">Tycono</p>
                <div className="flex items-center gap-2 font-mono text-sm flex-wrap">
                  <span className="text-green-400 font-semibold bg-green-400/10 px-2 py-0.5 rounded">Pre-K</span>
                  <span className="text-base-600">&rarr;</span>
                  <span className="text-base-200">Plan</span>
                  <span className="text-base-600">&rarr;</span>
                  <span className="text-base-200">Execute</span>
                  <span className="text-base-600">&rarr;</span>
                  <span className="text-green-400 font-semibold bg-green-400/10 px-2 py-0.5 rounded">Post-K</span>
                  <span className="text-base-600">&rarr;</span>
                  <span className="text-base-200">Done</span>
                </div>
                <p className="text-xs text-base-500 mt-3">Knowledge before. Knowledge after. Every single task.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-base-900/40 rounded-lg p-4 border-l-2 border-green-400/50">
                <p className="text-sm font-semibold text-green-400 mb-2">Pre-Knowledging</p>
                <p className="text-xs text-base-400 leading-relaxed">Before execution, the agent searches existing knowledge &mdash; past decisions, related docs, cross-linked context. It plans <em>grounded in what the company already knows</em>.</p>
              </div>
              <div className="bg-base-900/40 rounded-lg p-4 border-l-2 border-green-400/50">
                <p className="text-sm font-semibold text-green-400 mb-2">Post-Knowledging</p>
                <p className="text-xs text-base-400 leading-relaxed">After execution, new insights are extracted, cross-linked, and registered in the knowledge graph. The next agent inherits what this one learned.</p>
              </div>
            </div>
          </div>

          {/* Intelligence Showcase */}
          <div className="reveal bg-base-800/30 border border-base-700/30 rounded-2xl p-6 md:p-8 mb-16 max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
              <p className="text-green-400 font-mono text-xs uppercase tracking-wider">Always learning</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="rounded-xl overflow-hidden border border-base-700/30 warm-glow mb-3">
                  <div className="aspect-[16/10] overflow-hidden">
                    <img src="assets/feature-knowledge.png" alt="Knowledge Base" className="w-full h-full object-cover object-top" loading="lazy" />
                  </div>
                </div>
                <div className="px-1">
                  <p className="text-sm font-semibold text-base-200 mb-1">Auto-organized, relation-based knowledge</p>
                  <p className="text-xs text-base-500">Just use it. Tycono automatically builds semantic knowledge &mdash; cross-linked, categorized, and searchable.</p>
                </div>
              </div>
              <div>
                <div className="rounded-xl overflow-hidden border border-base-700/30 warm-glow mb-3">
                  <div className="aspect-[16/10] overflow-hidden">
                    <img src="assets/feature-stats.png" alt="Company Stats" className="w-full h-full object-cover object-top" loading="lazy" />
                  </div>
                </div>
                <div className="px-1">
                  <p className="text-sm font-semibold text-base-200 mb-1">Every token accounted for</p>
                  <p className="text-xs text-base-500">Per-role, per-model cost breakdown. Know exactly where your budget goes.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tier 3: See Everything */}
          <div className="text-center mb-8">
            <p className="reveal text-accent font-mono text-sm mb-2">{"// see_everything"}</p>
            <h3 className="reveal text-2xl font-bold text-base-100">See Everything</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: "\u{1F3E2}", title: "Office Tycoon UI", desc: "Isometric pixel-art office. Watch agents walk to their desks, type, chat, and think." },
              { icon: "\u{1F3A8}", title: "Character Forge", desc: "Customize every role's appearance. Hairstyles, outfits, color palettes \u2014 make them yours." },
              { icon: "\u{1F4E1}", title: "Live Activity", desc: "Real-time stream of everything happening. Tool calls, thinking, dispatches \u2014 full transparency." },
              { icon: "\u{1F4C8}", title: "Operations Hub", desc: "Standups, decisions, wave history. Your AI company generates its own institutional memory." },
            ].map((f, i) => (
              <div key={i} className={`reveal stagger-${i+1} bg-base-800/50 border border-base-700/50 rounded-xl p-5 hover:border-accent/30 transition-colors`}>
                <div className="text-2xl mb-3">{f.icon}</div>
                <h4 className="text-base font-semibold text-base-100 mb-2">{f.title}</h4>
                <p className="text-sm text-base-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Visual Showcase */}
          <div className="reveal bg-base-800/30 border border-base-700/30 rounded-2xl p-6 md:p-8 mt-10 max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></div>
              <p className="text-purple-400 font-mono text-xs uppercase tracking-wider">Your office, your way</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
              <div className="md:col-span-3 rounded-xl overflow-hidden border border-base-700/30 warm-glow">
                <img src="assets/feature-role-profile.png" alt="Role Profile" className="w-full h-auto" loading="lazy" />
              </div>
              <div className="md:col-span-2 rounded-xl overflow-hidden border border-base-700/30 warm-glow">
                <img src="assets/feature-forge.png" alt="Character Forge" className="w-full h-auto" loading="lazy" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2 rounded-lg overflow-hidden border border-base-700/20 group">
                <img src="assets/feature-edit-mode.png" alt="Edit Mode" className="w-full h-auto group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                <div className="bg-base-900/80 px-3 py-2">
                  <p className="text-xs text-base-400">Drag furniture, rearrange rooms</p>
                </div>
              </div>
              <div className="rounded-lg overflow-hidden border border-base-700/20 group">
                <img src="assets/detail-office-room.png" alt="Pixel-art agents" className="w-full h-auto group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                <div className="bg-base-900/80 px-3 py-2">
                  <p className="text-xs text-base-400">Pixel-art agents</p>
                </div>
              </div>
              <div className="rounded-lg overflow-hidden border border-base-700/20 group">
                <img src="assets/feature-decisions.png" alt="Decision Log" className="w-full h-auto group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                <div className="bg-base-900/80 px-3 py-2">
                  <p className="text-xs text-base-400">Decision log</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== Dogfooding proof ==================== */}
      <div className="section-divider"></div>
      <section className="py-24 md:py-32 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="reveal text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            Built by AI. <span className="gradient-text">For real.</span>
          </h2>
          <p className="reveal text-lg text-base-400 max-w-2xl mx-auto mb-8">
            This landing page was built by Tycono. Not as a demo &mdash; as real work.
          </p>
          <div className="reveal code-block-landing rounded-2xl p-6 max-w-2xl mx-auto mb-8 text-left">
            <div className="space-y-3 text-sm font-mono">
              <div className="flex items-start gap-3">
                <span className="text-purple-400 shrink-0">PM</span>
                <span className="text-base-400">Wrote the PRD &amp; task breakdown from market research</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-blue-400 shrink-0">CTO</span>
                <span className="text-base-400">Designed architecture &amp; reviewed every PR</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-pink-400 shrink-0">Designer</span>
                <span className="text-base-400">Created the UX/IA spec &amp; visual direction</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-orange-400 shrink-0">Engineer</span>
                <span className="text-base-400">Implemented every section, pixel by pixel</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-base-700/30 text-xs text-base-500">
              Every decision and analysis is cross-linked in the knowledge base &mdash; searchable, reusable, compounding.
            </div>
          </div>
          <div className="reveal grid grid-cols-3 gap-4 max-w-lg mx-auto">
            <div className="code-block-landing rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-accent mb-1">10</div>
              <div className="text-xs text-base-500">CEO Decisions</div>
            </div>
            <div className="code-block-landing rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-accent mb-1">60+</div>
              <div className="text-xs text-base-500">Knowledge Docs</div>
            </div>
            <div className="code-block-landing rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-accent mb-1">7</div>
              <div className="text-xs text-base-500">Active Roles</div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== Company-as-Code ==================== */}
      <div className="section-divider"></div>
      <section className="py-24 md:py-32 px-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(108,99,255,0.04) 0%, transparent 60%)" }}></div>
        <div className="max-w-5xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <p className="reveal text-secondary font-mono text-sm mb-4 tracking-wider">{"// a_new_paradigm"}</p>
            <h2 className="reveal text-4xl md:text-5xl font-bold mb-6 tracking-tight leading-tight">
              Infrastructure-as-Code defined servers.<br/>
              <span className="gradient-text-secondary">Company-as-Code</span> defines organizations.
            </h2>
            <p className="reveal text-lg text-base-400 max-w-2xl mx-auto">
              Just as Terraform turns <code className="text-base-300 bg-base-800/80 px-1.5 py-0.5 rounded text-sm">.tf</code> files into running infrastructure, Tycono turns YAML and Markdown into a running company.
            </p>
          </div>

          <div className="reveal grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            <div className="code-block-landing rounded-2xl p-6 relative">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-base-500"></div>
                <span className="text-base-500 font-mono text-xs uppercase tracking-wider">Infrastructure-as-Code</span>
              </div>
              <div className="space-y-3 font-mono text-sm">
                <div className="text-base-500"><span className="text-base-400">$</span> terraform apply main.tf</div>
                <div className="text-base-500 pl-4 border-l border-base-700/30">
                  <div>Creating vpc...</div>
                  <div>Creating ec2...</div>
                  <div className="text-green-400/50">&#10003; Infrastructure ready</div>
                </div>
              </div>
            </div>
            <div className="bg-base-800/70 border border-secondary/20 rounded-2xl p-6 relative" style={{ boxShadow: "0 0 60px rgba(108,99,255,0.05)" }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-secondary animate-pulse"></div>
                <span className="text-secondary font-mono text-xs uppercase tracking-wider">Company-as-Code</span>
              </div>
              <div className="space-y-3 font-mono text-sm">
                <div><span className="text-base-400">$</span> <span className="text-base-100">npx tycono</span></div>
                <div className="pl-4 border-l border-secondary/20">
                  <div className="text-base-300">Loading roles...</div>
                  <div className="text-base-300">Assembling org...</div>
                  <div className="text-accent">&#10003; Your company is running</div>
                </div>
              </div>
            </div>
          </div>

          <div className="reveal code-block-landing rounded-2xl overflow-hidden max-w-3xl mx-auto">
            <div className="px-5 py-3 border-b border-base-700/30">
              <span className="text-base-500 font-mono text-xs">file_mapping.md</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-700/20">
                  <th className="text-left py-3 px-5 text-base-500 font-medium font-mono text-xs">IaC</th>
                  <th className="text-center py-3 px-3 text-base-600 font-mono text-xs">&rarr;</th>
                  <th className="text-left py-3 px-5 text-secondary font-medium font-mono text-xs">CaC</th>
                  <th className="text-left py-3 px-5 text-base-500 font-medium text-xs">Purpose</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { iac: ".tf", cac: "role.yaml", purpose: "Define structure" },
                  { iac: "playbook.yml", cac: "CLAUDE.md", purpose: "Operating rules" },
                  { iac: "Dockerfile", cac: "skills/", purpose: "Capabilities" },
                  { iac: "terraform.tfstate", cac: "knowledge/", purpose: "Organizational memory" },
                ].map((row, i) => (
                  <tr key={i} className={`comparison-row ${i < 3 ? "border-b border-base-700/10" : ""}`}>
                    <td className="py-3 px-5 text-base-500 font-mono text-xs">{row.iac}</td>
                    <td className="py-3 px-3 text-center text-base-600">&rarr;</td>
                    <td className="py-3 px-5 text-base-200 font-mono text-xs">{row.cac}</td>
                    <td className="py-3 px-5 text-base-400 text-xs">{row.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="reveal text-center mt-10">
            <p className="text-base-500 text-sm">
              Your company is <span className="text-base-300">versionable</span>, <span className="text-base-300">reproducible</span>, and <span className="text-base-300">forkable</span> &mdash; just like code.
            </p>
          </div>
        </div>
      </section>

      {/* ==================== Plugin Section ==================== */}
      <div className="section-divider"></div>
      <section id="plugin" className="py-24 md:py-32 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="reveal text-4xl md:text-5xl font-bold mb-4 tracking-tight">
              <span className="gradient-text">Claude Code Plugin</span>
            </h2>
            <p className="reveal text-lg text-base-400 max-w-xl mx-auto">
              Claude Code inside, run your AI team right away.
            </p>
          </div>

          {/* Install */}
          <div className="reveal code-block-landing rounded-2xl p-6 max-w-2xl mx-auto mb-12 warm-glow">
            <div className="flex items-center gap-1.5 mb-4">
              <div className="w-3 h-3 rounded-full bg-red-500/40"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/40"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/40"></div>
              <span className="ml-3 text-xs text-base-500 font-mono">Install</span>
            </div>
            <div className="space-y-2 font-mono text-sm">
              <div><span className="text-base-500">$</span> <span className="text-base-50">claude plugin install tycono</span></div>
            </div>
          </div>

          {/* Commands */}
          <div className="reveal grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto mb-16">
            {[
              { cmd: '/tycono "Build a browser game"', desc: "Start a full team project" },
              { cmd: '/tycono --agency gamedev "Tower defense"', desc: "Use a specialized agency" },
              { cmd: '/tycono:agency-list', desc: "Browse available agencies" },
              { cmd: '/tycono:tycono-status', desc: "Check your company status" },
            ].map((c, i) => (
              <div key={i} className={`stagger-${i+1} bg-base-800/50 border border-base-700/50 rounded-xl p-4 hover:border-accent/30 transition-colors`}>
                <code className="text-accent font-mono text-sm block mb-2">{c.cmd}</code>
                <p className="text-xs text-base-400">{c.desc}</p>
              </div>
            ))}
          </div>

          {/* Agency preview cards */}
          <div className="text-center mb-8">
            <h3 className="reveal text-2xl font-bold text-base-100">Pre-built Agencies</h3>
            <p className="reveal text-base-400 text-sm mt-2">Install and go. Specialized AI teams for your domain.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {[
              { name: "Game Dev Team", icon: "\u{1F3AE}", desc: "Full game development pipeline: design, code, QA, assets", tag: "gamedev" },
              { name: "Startup MVP", icon: "\u{1F680}", desc: "From idea to deployable MVP: PM, Engineer, Designer, QA", tag: "startup-mvp" },
              { name: "Solo Founder", icon: "\u{1F4A1}", desc: "One-person army: CTO + Engineer + PM for indie builders", tag: "solo-founder" },
            ].map((a, i) => (
              <div key={i} className={`reveal stagger-${i+1} landing-card rounded-2xl p-6`}>
                <div className="text-3xl mb-3">{a.icon}</div>
                <h4 className="font-semibold text-base-50 mb-2">{a.name}</h4>
                <p className="text-sm text-base-400 mb-3">{a.desc}</p>
                <code className="text-xs text-accent/70 font-mono">--agency {a.tag}</code>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== Agencies Section ==================== */}
      <div className="section-divider"></div>
      <section id="agencies" className="py-24 md:py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="reveal text-4xl md:text-5xl font-bold mb-4 tracking-tight">
              <span className="gradient-text">Agencies</span>
            </h2>
            <p className="reveal text-lg text-base-400 max-w-xl mx-auto">
              Hire specialized AI teams. Each agency handles planning through QA for its domain.
            </p>
          </div>

          {/* Available agencies */}
          {featured.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              {featured.map((agency) => (
                <AgencyCard key={agency.id} agency={agency} />
              ))}
            </div>
          )}

          {/* Coming Soon */}
          {comingSoon.length > 0 && (
            <>
              <div className="text-center mb-8">
                <h3 className="reveal text-xl font-semibold text-base-300">Coming Soon</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
                {comingSoon.map((agency) => (
                  <AgencyCard key={agency.id} agency={agency} />
                ))}
              </div>
            </>
          )}

          {/* CTA */}
          <div className="reveal text-center mt-8">
            <div className="code-block-landing rounded-xl p-4 inline-block mb-4">
              <code className="font-mono text-sm text-base-400">
                <span className="text-accent">/tycono:agency-create</span> &mdash; build your own agency
              </code>
            </div>
            <div>
              <Link href="/agencies" className="text-accent hover:underline text-sm font-medium">
                Browse all agencies &rarr;
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== Comparison (3-way) ==================== */}
      <div className="section-divider"></div>
      <section className="py-24 md:py-32 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="reveal text-4xl md:text-5xl font-bold mb-4 tracking-tight">
              Solo &rarr; Repeat &rarr; <span className="gradient-text">Team</span>
            </h2>
            <p className="reveal text-lg text-base-400">The natural evolution of AI-assisted development.</p>
          </div>

          <div className="reveal code-block-landing rounded-2xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-700/30">
                  <th className="text-left py-4 px-5 text-base-400 font-medium"></th>
                  <th className="text-center py-4 px-4 text-base-400 font-medium whitespace-nowrap">Claude Code Solo</th>
                  <th className="text-center py-4 px-4 text-base-400 font-medium whitespace-nowrap">Repeating Agent</th>
                  <th className="text-center py-4 px-4 text-accent font-semibold whitespace-nowrap">Tycono</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Structure", solo: "1 agent", ralph: "1 agent repeating", tycono: "Team collaboration" },
                  { label: "Perspective", solo: "Single", ralph: "Single (repeated)", tycono: "Multi (plan + build + verify)" },
                  { label: "Visibility", solo: "Chat log", ralph: "Black box", tycono: "Real-time stream" },
                  { label: "Course correction", solo: "Manual input", ralph: "None", tycono: "Supervision" },
                  { label: "Knowledge", solo: "Resets each session", ralph: "None", tycono: "AKB accumulation" },
                  { label: "Quality control", solo: "None", ralph: "None", tycono: "QA auto-verification" },
                ].map((row, i) => (
                  <tr key={i} className={`comparison-row ${i < 5 ? "border-b border-base-700/10" : ""}`}>
                    <td className="py-3.5 px-5 text-base-400">{row.label}</td>
                    <td className="py-3.5 px-4 text-center text-base-500">{row.solo}</td>
                    <td className="py-3.5 px-4 text-center text-base-500">{row.ralph}</td>
                    <td className="py-3.5 px-4 text-center text-base-50 font-medium">{row.tycono}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="reveal text-center text-base-500 text-sm mt-6">
            Each approach has its place. Solo is fast for small tasks. Loops handle repetition. Teams tackle complexity.
          </p>
        </div>
      </section>

      {/* ==================== FAQ ==================== */}
      <div className="section-divider"></div>
      <section id="faq" className="py-24 md:py-32 px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="reveal text-4xl md:text-5xl font-bold mb-12 tracking-tight text-center">
            <span className="gradient-text">FAQ</span>
          </h2>

          <div className="space-y-0">
            {[
              { q: "What AI models does it support?", a: "Currently supports Claude (Anthropic) via API key. OpenAI GPT and local models (Ollama) support is planned. Bring Your Own Keys (BYOK) means you control costs." },
              { q: "Is my data sent to any server?", a: "No. Tycono runs 100% locally on your machine. Your files stay on your disk. The only external calls are to the LLM API you configure (e.g., Claude API). No telemetry, no tracking." },
              { q: "How is this different from ChatGPT or Cursor?", a: "ChatGPT/Cursor are single-agent tools. Tycono simulates a full organization with multiple roles, hierarchy, delegation, and persistent knowledge. Think of it as building a company, not chatting with a bot." },
              { q: "Can I customize roles and add my own?", a: "Yes. Roles are defined in YAML files. You can create any role (Data Analyst, DevOps, Writer, etc.), define their persona, authority scope, and reporting structure. The org chart adapts automatically." },
              { q: "What happens to knowledge over time?", a: "Everything is saved as Markdown files in a Git repo. Knowledge accumulates, cross-links form, and your AI company gets smarter over time. Git = save file. Branch, revert, time-travel." },
            ].map((item, i) => (
              <div key={i} className={`reveal stagger-${i+1} faq-item py-5 cursor-pointer`} onClick={undefined} suppressHydrationWarning>
                <div className="flex items-center justify-between faq-trigger">
                  <h3 className="font-medium text-base-50">{item.q}</h3>
                  <svg className="faq-chevron w-5 h-5 text-base-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                </div>
                <div className="faq-answer text-sm text-base-400 leading-relaxed">
                  {item.a}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== CTA ==================== */}
      <div className="section-divider"></div>
      <section className="py-24 md:py-32 px-6 relative overflow-hidden">
        <div className="hero-glow" style={{ top: -100 }}></div>
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <h2 className="reveal text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            Ready to run your company<br/><span className="gradient-text">in code?</span>
          </h2>
          <p className="reveal text-lg text-base-400 mb-10 max-w-lg mx-auto">
            Open source. Local first. Your keys, your data, your company.
          </p>
          <div className="reveal flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <a href="#agencies" className="group px-8 py-4 bg-gradient-to-r from-accent-dark to-accent rounded-xl text-base-950 font-semibold hover:shadow-xl hover:shadow-accent/20 transition-all duration-300 hover:-translate-y-0.5">
              Browse Agencies <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">&rarr;</span>
            </a>
            <a href="https://github.com/seongsu-kang/tycono" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-8 py-4 bg-base-800/80 border border-base-600/20 rounded-xl text-base-50 font-medium hover:bg-base-700 hover:border-base-600/40 transition-all duration-300">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
              View on GitHub
            </a>
          </div>
          <div className="reveal code-block-landing rounded-xl p-3 inline-block">
            <code className="font-mono text-sm text-base-400"><span className="text-base-500">$</span> claude plugin install tycono</code>
          </div>
        </div>
      </section>

      {/* Client-side animations */}
      <LandingAnimations />
    </div>
  );
}
