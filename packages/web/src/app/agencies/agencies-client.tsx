"use client";

import { useState, useMemo } from "react";
import type { Agency } from "@/data/types";
import { AgencyCard } from "@/components/agency-card";

interface Props {
  agencies: Agency[];
  categories: { id: string; label: string }[];
}

export function AgenciesClient({ agencies, categories }: Props) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const filtered = useMemo(() => {
    return agencies.filter((a) => {
      const matchesCategory =
        selectedCategory === "all" || a.category === selectedCategory;
      const matchesSearch =
        search === "" ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.description.toLowerCase().includes(search.toLowerCase()) ||
        a.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [agencies, search, selectedCategory]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.comingSoon && !b.comingSoon) return 1;
      if (!a.comingSoon && b.comingSoon) return -1;
      return 0;
    });
  }, [filtered]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2">Agencies</h1>
        <p className="text-text-secondary">
          Pre-built AI teams ready to work on your project.
        </p>
      </div>

      {/* Search + Filter */}
      <div className="mb-8 space-y-4">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search agencies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-lg bg-terminal-surface border border-[var(--border-color)] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
                selectedCategory === cat.id
                  ? "bg-accent text-white"
                  : "bg-terminal-surface text-text-secondary border border-[var(--border-color)] hover:border-[var(--border-hover)]"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <div className="mb-6 text-sm text-text-muted">
        {sorted.length} {sorted.length === 1 ? "agency" : "agencies"} found
      </div>

      {/* Grid */}
      {sorted.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sorted.map((agency) => (
            <AgencyCard key={agency.id} agency={agency} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-text-muted text-lg">No agencies found</p>
          <p className="text-text-muted text-sm mt-2">
            Try adjusting your search or filter.
          </p>
        </div>
      )}
    </div>
  );
}
