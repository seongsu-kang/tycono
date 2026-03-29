// Server-only — loads agency data from YAML files at build time
import fs from "fs";
import path from "path";
import YAML from "yaml";
import type { Agency } from "./types";
import { getRoleDisplay } from "./types";

interface YamlData {
  id: string;
  name: string;
  tagline?: string;
  description: string;
  category: string;
  industry?: string;
  roles: string[];
  tags?: string[];
  author?: { id: string; name: string; verified?: boolean };
  pricing?: { price: number };
  recommended_knowledge?: string[];
  stats?: { installs: number; rating: number; reviews: number };
  wave_scoped?: {
    recommended_tasks?: string[];
    avg_wave_duration?: string;
    complexity?: string;
  };
}

function parseYaml(filePath: string): YamlData | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return YAML.parse(content) as YamlData;
  } catch {
    return null;
  }
}

function yamlToAgency(data: YamlData, comingSoon: boolean): Agency {
  return {
    id: data.id,
    name: data.name,
    tagline: data.tagline || "",
    description: (data.description || "").trim(),
    fullDescription: (data.description || "").trim(),
    roles: (data.roles || []).map(getRoleDisplay),
    category: data.category || "engineering",
    industry: data.industry || "general",
    price: data.pricing?.price === 0 ? "Free" : `$${data.pricing?.price || 0}`,
    tags: data.tags || [],
    author: data.author?.name || "Tycono Official",
    verified: data.author?.verified ?? true,
    comingSoon,
    recommendedKnowledge: data.recommended_knowledge || [],
    recommendedTasks: data.wave_scoped?.recommended_tasks || [],
    avgWaveDuration: data.wave_scoped?.avg_wave_duration || "",
    complexity: data.wave_scoped?.complexity || "medium",
    stats: {
      installs: data.stats?.installs || 0,
      rating: data.stats?.rating || 0,
      reviews: data.stats?.reviews || 0,
    },
  };
}

function loadBundledAgencies(): Agency[] {
  const bundlePath = path.resolve(
    process.cwd(),
    "../../packages/plugin/bootstrap/agencies"
  );

  if (!fs.existsSync(bundlePath)) return [];

  const dirs = fs.readdirSync(bundlePath).filter((d) => {
    return fs.statSync(path.join(bundlePath, d)).isDirectory();
  });

  return dirs
    .map((dir) => {
      const yamlFile = path.join(bundlePath, dir, "agency.yaml");
      const presetFile = path.join(bundlePath, dir, "preset.yaml");
      const data = parseYaml(yamlFile) || parseYaml(presetFile);
      if (!data) return null;
      return yamlToAgency(data, false);
    })
    .filter(Boolean) as Agency[];
}

function loadComingSoonAgencies(): Agency[] {
  const presetsPath = path.resolve(
    process.cwd(),
    "../../../tycono-akb/knowledge/presets"
  );

  if (!fs.existsSync(presetsPath)) return [];

  const bundledIds = new Set(["gamedev", "solo-founder", "startup-mvp"]);
  const comingSoonIds = new Set([
    "ecommerce",
    "data-analytics",
    "content-marketing",
    "devops-platform",
    "saas-growth",
    "research-discovery",
  ]);

  const dirs = fs.readdirSync(presetsPath).filter((d) => {
    return (
      fs.statSync(path.join(presetsPath, d)).isDirectory() &&
      !bundledIds.has(d) &&
      comingSoonIds.has(d)
    );
  });

  return dirs
    .map((dir) => {
      const presetFile = path.join(presetsPath, dir, "preset.yaml");
      const data = parseYaml(presetFile);
      if (!data) return null;
      return yamlToAgency(data, true);
    })
    .filter(Boolean) as Agency[];
}

export const agencies: Agency[] = [
  ...loadBundledAgencies(),
  ...loadComingSoonAgencies(),
];

export const categories = [
  { id: "all", label: "All" },
  { id: "engineering", label: "Engineering" },
  { id: "gamedev", label: "Game Dev" },
  { id: "business", label: "Business" },
  { id: "marketing", label: "Marketing" },
];

export function getAgencyById(id: string): Agency | undefined {
  return agencies.find((a) => a.id === id);
}
