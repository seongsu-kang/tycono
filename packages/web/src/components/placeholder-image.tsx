/**
 * PlaceholderImage — attractive SVG/CSS placeholders for missing images.
 * Categories: terminal, office, feature
 */

type PlaceholderCategory = "terminal" | "office" | "feature";

interface PlaceholderImageProps {
  alt: string;
  category?: PlaceholderCategory;
  className?: string;
  aspectRatio?: string;
}

function TerminalIcon() {
  return (
    <svg className="w-10 h-10 text-green-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function OfficeIcon() {
  return (
    <svg className="w-10 h-10 text-purple-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  );
}

function FeatureIcon() {
  return (
    <svg className="w-10 h-10 text-accent/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}

const categoryConfig: Record<PlaceholderCategory, {
  bg: string;
  border: string;
  dotColor: string;
  labelColor: string;
  scanlineOpacity: string;
  icon: () => React.ReactElement;
}> = {
  terminal: {
    bg: "bg-[#0d1117]",
    border: "border-green-500/20",
    dotColor: "bg-green-400/40",
    labelColor: "text-green-400/50",
    scanlineOpacity: "opacity-[0.03]",
    icon: TerminalIcon,
  },
  office: {
    bg: "bg-[#1a1028]",
    border: "border-purple-500/20",
    dotColor: "bg-purple-400/40",
    labelColor: "text-purple-400/50",
    scanlineOpacity: "opacity-[0.04]",
    icon: OfficeIcon,
  },
  feature: {
    bg: "bg-base-900",
    border: "border-base-700/30",
    dotColor: "bg-accent/40",
    labelColor: "text-base-500",
    scanlineOpacity: "opacity-[0.02]",
    icon: FeatureIcon,
  },
};

function inferCategory(alt: string): PlaceholderCategory {
  const lower = alt.toLowerCase();
  if (
    lower.includes("terminal") ||
    lower.includes("wizard") ||
    lower.includes("step") ||
    lower.includes("wave") ||
    lower.includes("dispatch") ||
    lower.includes("chat") ||
    lower.includes("save game") ||
    lower.includes("knowledge") ||
    lower.includes("stats") ||
    lower.includes("side panel")
  ) {
    return "terminal";
  }
  if (
    lower.includes("office") ||
    lower.includes("pixel") ||
    lower.includes("isometric") ||
    lower.includes("room")
  ) {
    return "office";
  }
  return "feature";
}

export function PlaceholderImage({
  alt,
  category,
  className = "",
  aspectRatio = "16/10",
}: PlaceholderImageProps) {
  const cat = category ?? inferCategory(alt);
  const config = categoryConfig[cat];
  const Icon = config.icon;

  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-3 overflow-hidden ${config.bg} border ${config.border} ${className}`}
      style={{ aspectRatio }}
      role="img"
      aria-label={alt}
    >
      {/* Scanline effect */}
      <div
        className={`absolute inset-0 ${config.scanlineOpacity} pointer-events-none`}
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, currentColor 2px, currentColor 3px)",
        }}
      />

      {/* Dot grid */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      />

      {/* Corner dots */}
      <div className={`absolute top-3 left-3 w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
      <div className={`absolute top-3 right-3 w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
      <div className={`absolute bottom-3 left-3 w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
      <div className={`absolute bottom-3 right-3 w-1.5 h-1.5 rounded-full ${config.dotColor}`} />

      {/* Icon + label */}
      <Icon />
      <span className={`text-xs font-mono ${config.labelColor} max-w-[80%] text-center leading-snug`}>
        {alt}
      </span>
    </div>
  );
}

/**
 * SlideShowPlaceholder — replaces the wizard slideshow <img> tags
 */
export function SlideShowPlaceholder({
  items,
  className = "",
}: {
  items: { alt: string }[];
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-green-500/20 bg-[#0d1117] ${className}`} style={{ aspectRatio: "560/500" }}>
      {/* Scanline */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, currentColor 2px, currentColor 3px)" }} />

      <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
        <TerminalIcon />
        <span className="text-green-400/50 text-xs font-mono text-center">Setup Wizard</span>
        <div className="flex flex-col gap-1.5 w-full max-w-xs">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-green-400/10 flex items-center justify-center text-green-400/60 text-[10px] font-mono font-bold shrink-0">
                {i + 1}
              </div>
              <span className="text-[11px] text-green-400/40 font-mono truncate">{item.alt}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
