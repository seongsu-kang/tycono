import { notFound } from "next/navigation";
import Link from "next/link";
import { agencies, getAgencyById } from "@/data/agencies";
import { roleHexMap } from "@/data/types";
import { CopyButton } from "./copy-button";

export function generateStaticParams() {
  return agencies.filter((a) => !a.comingSoon).map((a) => ({ id: a.id }));
}

export default async function AgencyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agency = getAgencyById(id);

  if (!agency || agency.comingSoon) {
    notFound();
  }

  const installCommand = "claude plugin install tycono";
  const useCommand = `/tycono --agency ${agency.id} "Start the project"`;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Breadcrumb */}
      <div className="mb-8 text-sm text-text-muted">
        <Link
          href="/agencies"
          className="hover:text-text-primary transition-colors"
        >
          Agencies
        </Link>
        <span className="mx-2">/</span>
        <span className="text-text-primary">{agency.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start gap-6 mb-10">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{agency.name}</h1>
            {agency.verified && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent-green/10 text-accent-green border border-accent-green/20">
                Official
              </span>
            )}
          </div>
          <p className="text-sm text-text-muted mb-1">
            {agency.tagline} &middot; by {agency.author}
          </p>
          <p className="text-text-secondary leading-relaxed mt-3">
            {agency.fullDescription}
          </p>
        </div>
        <div className="flex-shrink-0">
          <span
            className={`text-2xl font-bold ${
              agency.price === "Free"
                ? "text-accent-green"
                : "text-text-primary"
            }`}
          >
            {agency.price}
          </span>
        </div>
      </div>

      {/* Quick Info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {[
          { label: "Complexity", value: agency.complexity },
          { label: "Duration", value: agency.avgWaveDuration || "N/A" },
          { label: "Category", value: agency.category },
          { label: "Est. Cost", value: "$8-15/wave" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg bg-terminal-surface border border-[var(--border-color)] p-4 text-center"
          >
            <div className="text-base font-semibold capitalize">
              {stat.value}
            </div>
            <div className="text-xs text-text-muted mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Team Composition */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Team Composition</h2>
        <div className="flex flex-wrap gap-3 mb-4">
          {agency.roles.map((role, i) => (
            <div
              key={role}
              className="relative flex items-center gap-2.5 rounded-lg bg-terminal-surface border border-[var(--border-color)] px-4 py-3 hover:border-[var(--border-hover)] transition-colors"
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: roleHexMap[role] || "#6366F1" }}
              />
              <span className="font-medium text-sm">{role}</span>
              {i === 0 && (
                <span className="text-xs text-accent ml-1">Lead</span>
              )}
            </div>
          ))}
        </div>

        {/* Org flow */}
        <div className="mt-4 p-4 rounded-lg bg-terminal-bg-deeper border border-[var(--border-color)]">
          <div className="text-xs text-text-muted mb-2">Execution Flow</div>
          <div className="flex flex-wrap items-center gap-2 text-sm font-mono">
            {agency.roles.map((role, i) => (
              <span key={role} className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-terminal-surface border border-[var(--border-color)]">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: roleHexMap[role] || "#6366F1" }}
                  />
                  <span className="text-text-secondary text-xs">{role}</span>
                </span>
                {i < agency.roles.length - 1 && (
                  <span className="text-accent">&rarr;</span>
                )}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Recommended Tasks */}
      {agency.recommendedTasks.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4">Recommended Tasks</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {agency.recommendedTasks.map((task) => (
              <div
                key={task}
                className="flex items-center gap-3 rounded-lg bg-terminal-surface border border-[var(--border-color)] px-4 py-3"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                <span className="text-sm text-text-secondary">{task}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Knowledge */}
      {agency.recommendedKnowledge.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4">Domain Knowledge</h2>
          <p className="text-sm text-text-muted mb-3">
            Recommended knowledge files for this agency.
          </p>
          <div className="flex flex-wrap gap-2">
            {agency.recommendedKnowledge.map((doc) => (
              <span
                key={doc}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-terminal-bg-deeper text-code-text border border-[var(--border-color)] font-mono"
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                {doc}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Tags */}
      {agency.tags.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4">Tags</h2>
          <div className="flex flex-wrap gap-2">
            {agency.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-3 py-1.5 rounded-full bg-terminal-surface text-text-muted border border-[var(--border-color)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Installation */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Installation</h2>
        <div className="space-y-4">
          <div>
            <div className="text-sm text-text-muted mb-2">
              1. Install the plugin
            </div>
            <div className="code-block flex items-center justify-between">
              <div>
                <span className="text-accent-green">$</span> {installCommand}
              </div>
              <CopyButton text={installCommand} />
            </div>
          </div>
          <div>
            <div className="text-sm text-text-muted mb-2">
              2. Run with this agency
            </div>
            <div className="code-block flex items-center justify-between">
              <div>
                <span className="text-accent-green">$</span> {useCommand}
              </div>
              <CopyButton text={useCommand} />
            </div>
          </div>
        </div>
      </section>

      {/* Back */}
      <div className="pt-6 border-t border-[var(--border-color)]">
        <Link href="/agencies" className="text-sm text-accent hover:underline">
          &larr; Back to all agencies
        </Link>
      </div>
    </div>
  );
}
