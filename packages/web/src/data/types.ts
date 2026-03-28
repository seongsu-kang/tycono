// Client-safe types and constants — no fs/yaml imports

export interface Agency {
  id: string;
  name: string;
  tagline: string;
  description: string;
  fullDescription: string;
  roles: string[];
  category: string;
  industry: string;
  price: string;
  tags: string[];
  author: string;
  verified: boolean;
  comingSoon: boolean;
  recommendedKnowledge: string[];
  recommendedTasks: string[];
  avgWaveDuration: string;
  complexity: string;
  stats: {
    installs: number;
    rating: number;
    reviews: number;
  };
}

export const categories = [
  { id: "all", label: "All" },
  { id: "engineering", label: "Engineering" },
  { id: "gamedev", label: "Game Dev" },
  { id: "business", label: "Business" },
  { id: "marketing", label: "Marketing" },
];

// --- Role display & color mappings ---

const roleDisplayMap: Record<string, string> = {
  cto: "CTO",
  cbo: "CBO",
  pm: "PM",
  engineer: "Engineer",
  designer: "Designer",
  qa: "QA",
  "data-analyst": "Data Analyst",
  "content-writer": "Content Writer",
  merchandiser: "Merchandiser",
  "devops-engineer": "DevOps Engineer",
};

export function getRoleDisplay(roleId: string): string {
  return roleDisplayMap[roleId] || roleId.charAt(0).toUpperCase() + roleId.slice(1);
}

export const roleHexMap: Record<string, string> = {
  CTO: "#1565C0",
  CBO: "#E65100",
  PM: "#2E7D32",
  Engineer: "#4A148C",
  Designer: "#AD1457",
  QA: "#00695C",
  "Data Analyst": "#6366F1",
  "Content Writer": "#6366F1",
  Merchandiser: "#6366F1",
  "DevOps Engineer": "#1565C0",
};
