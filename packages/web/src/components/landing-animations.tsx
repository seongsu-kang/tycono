"use client";

import { useEffect } from "react";

export function LandingAnimations() {
  useEffect(() => {
    // === Scroll-triggered reveals ===
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );

    document
      .querySelectorAll(".reveal, .reveal-left, .reveal-right, .reveal-scale")
      .forEach((el) => revealObserver.observe(el));

    // === Typing animation ===
    function setupTypingBlock(blockId: string) {
      const block = document.getElementById(blockId);
      if (!block) return;
      const lines = block.querySelectorAll(".typing-line");
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              lines.forEach((line, i) => {
                setTimeout(() => line.classList.add("typed"), i * 250);
              });
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.3 }
      );
      observer.observe(block);
    }
    setupTypingBlock("typing-block");

    // === FAQ toggles ===
    document.querySelectorAll(".faq-item").forEach((item) => {
      const trigger = item.querySelector(".faq-trigger");
      if (trigger) {
        trigger.addEventListener("click", () => {
          item.classList.toggle("open");
        });
      }
    });

    // === Org chart animation ===
    const orgChart = document.getElementById("org-chart");
    if (orgChart) {
      const nodeColors: Record<string, { stroke: string; shadow: string }> = {
        ceo: { stroke: "rgba(255,140,66,0.7)", shadow: "0 0 20px rgba(255,140,66,0.3)" },
        cto: { stroke: "rgba(96,165,250,0.6)", shadow: "0 0 20px rgba(96,165,250,0.25)" },
        cbo: { stroke: "rgba(52,211,153,0.6)", shadow: "0 0 20px rgba(52,211,153,0.25)" },
        r0: { stroke: "rgba(251,146,60,0.6)", shadow: "0 0 18px rgba(251,146,60,0.25)" },
        r1: { stroke: "rgba(251,146,60,0.6)", shadow: "0 0 18px rgba(251,146,60,0.25)" },
        r2: { stroke: "rgba(168,85,247,0.6)", shadow: "0 0 18px rgba(168,85,247,0.25)" },
        r3: { stroke: "rgba(236,72,153,0.6)", shadow: "0 0 18px rgba(236,72,153,0.25)" },
        r4: { stroke: "rgba(34,211,238,0.6)", shadow: "0 0 18px rgba(34,211,238,0.25)" },
        r5: { stroke: "rgba(250,204,21,0.6)", shadow: "0 0 18px rgba(250,204,21,0.25)" },
        r6: { stroke: "rgba(244,114,182,0.6)", shadow: "0 0 18px rgba(244,114,182,0.25)" },
      };

      const origStrokes: Record<string, string> = {
        ceo: "rgba(255,140,66,0.4)",
        cto: "rgba(96,165,250,0.3)",
        cbo: "rgba(52,211,153,0.3)",
        r0: "rgba(251,146,60,0.3)",
        r1: "rgba(251,146,60,0.3)",
        r2: "rgba(168,85,247,0.3)",
        r3: "rgba(236,72,153,0.3)",
        r4: "rgba(34,211,238,0.3)",
        r5: "rgba(250,204,21,0.3)",
        r6: "rgba(244,114,182,0.3)",
      };

      function litNode(id: string) {
        const g = orgChart!.querySelector(`[data-id="${id}"]`);
        if (!g) return;
        g.classList.add("lit");
        const r = g.querySelector("rect");
        if (r && nodeColors[id]) {
          r.setAttribute("stroke", nodeColors[id].stroke);
          r.style.filter = `drop-shadow(${nodeColors[id].shadow})`;
        }
      }

      function dimNode(id: string) {
        const g = orgChart!.querySelector(`[data-id="${id}"]`);
        if (!g) return;
        g.classList.remove("lit");
        const r = g.querySelector("rect");
        if (r) {
          r.style.filter = "none";
          if (origStrokes[id]) r.setAttribute("stroke", origStrokes[id]);
        }
      }

      function litLine(from: string, to: string) {
        const l = orgChart!.querySelector(
          `.org-line[data-from="${from}"][data-to="${to}"]`
        );
        if (l) {
          l.classList.add("lit");
          l.setAttribute(
            "stroke",
            nodeColors[to] ? nodeColors[to].stroke : "rgba(138,138,154,0.4)"
          );
        }
      }

      function dimAllLines() {
        orgChart!.querySelectorAll(".org-line").forEach((l) => {
          l.classList.remove("lit");
          l.setAttribute("stroke", "rgba(138,138,154,0.12)");
          l.setAttribute("stroke-width", "1.5");
        });
      }

      function glowKB(on: boolean) {
        orgChart!.querySelectorAll(".org-kb").forEach((el) => {
          on ? el.classList.add("glow") : el.classList.remove("glow");
        });
      }

      const allIds = ["ceo", "cto", "cbo", "r0", "r1", "r2", "r3", "r4", "r5", "r6"];

      function runCascade() {
        const steps = [
          {
            delay: 1200,
            fn() {
              litNode("ceo");
            },
          },
          {
            delay: 1400,
            fn() {
              litLine("ceo", "cto");
              litLine("ceo", "cbo");
              litNode("cto");
              litNode("cbo");
            },
          },
          {
            delay: 1400,
            fn() {
              litLine("cto", "r0");
              litLine("cto", "r1");
              litLine("cto", "r2");
              litLine("cto", "r3");
              litNode("r0");
              litNode("r1");
              litNode("r2");
              litNode("r3");
            },
          },
          {
            delay: 1200,
            fn() {
              litLine("cbo", "r4");
              litLine("cbo", "r5");
              litLine("cbo", "r6");
              litNode("r4");
              litNode("r5");
              litNode("r6");
              glowKB(true);
            },
          },
          {
            delay: 2500,
            fn() {
              /* hold */
            },
          },
          {
            delay: 2500,
            fn() {
              allIds.forEach(dimNode);
              dimAllLines();
              glowKB(false);
            },
          },
        ];

        let i = 0;
        function next() {
          if (i >= steps.length) {
            i = 0;
            setTimeout(next, 1200);
            return;
          }
          steps[i].fn();
          const d = steps[i].delay;
          i++;
          setTimeout(next, d);
        }
        next();
      }

      const orgObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              // Phase 1: Draw structure
              const nodes = orgChart!.querySelectorAll(".org-node");
              nodes.forEach((node) => {
                const delay = parseInt(
                  (node as HTMLElement).dataset.delay || "0"
                );
                setTimeout(() => node.classList.add("active"), delay);
              });
              const lines = orgChart!.querySelectorAll(".org-line");
              lines.forEach((line, idx) => {
                setTimeout(() => line.classList.add("active"), 300 + idx * 150);
              });
              // Phase 2: Start cascade loop
              setTimeout(() => runCascade(), 1600);
              orgObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.3 }
      );
      orgObserver.observe(orgChart);
    }

    // === Smooth scroll for hash links ===
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener("click", function (this: HTMLAnchorElement, e) {
        const href = this.getAttribute("href");
        if (!href || href === "#") return;
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });

    return () => {
      revealObserver.disconnect();
    };
  }, []);

  return null;
}
