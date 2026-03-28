import Link from "next/link";
import type { Agency } from "@/data/types";
import { roleHexMap } from "@/data/types";

export function AgencyCard({ agency }: { agency: Agency }) {
  const isAvailable = !agency.comingSoon;

  const cardClasses = `group block rounded-xl border border-[var(--border-color)] bg-terminal-surface p-6 transition-all duration-200 ${
    isAvailable
      ? "hover:border-[var(--border-hover)] hover:bg-terminal-surface-light hover:shadow-lg hover:shadow-accent/5 cursor-pointer"
      : "opacity-50 cursor-default"
  }`;

  const content = (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-text-primary group-hover:text-accent transition-colors text-lg">
            {agency.name}
          </h3>
          <p className="text-xs text-text-muted mt-0.5">{agency.tagline}</p>
        </div>
        {agency.comingSoon && (
          <span className="text-xs px-2.5 py-1 rounded-full bg-accent/10 text-accent border border-accent/20 whitespace-nowrap">
            Coming Soon
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-text-secondary mb-4 line-clamp-2 leading-relaxed">
        {agency.description}
      </p>

      {/* Roles with colored dots */}
      <div className="flex flex-wrap gap-2 mb-4">
        {agency.roles.map((role) => (
          <span
            key={role}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-terminal-bg-deeper text-text-secondary border border-[var(--border-color)]"
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: roleHexMap[role] || "#6366F1" }}
            />
            {role}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-[var(--border-color)]">
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span className="capitalize">{agency.complexity}</span>
          {agency.avgWaveDuration && <span>{agency.avgWaveDuration}</span>}
        </div>
        <span
          className={`text-sm font-semibold ${
            agency.price === "Free" ? "text-accent-green" : "text-text-primary"
          }`}
        >
          {agency.price}
        </span>
      </div>
    </>
  );

  if (isAvailable) {
    return (
      <Link href={`/agencies/${agency.id}`} className={cardClasses}>
        {content}
      </Link>
    );
  }

  return <div className={cardClasses}>{content}</div>;
}
