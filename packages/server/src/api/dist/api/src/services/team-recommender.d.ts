export interface TeamOption {
    id: string;
    name: string;
    description: string;
    roles: string[];
    roleDetails: {
        id: string;
        name: string;
        level: string;
        subordinates: string[];
    }[];
    totalAgents: number;
    estimatedSpeed: 'fast' | 'medium' | 'slow';
    recommended?: boolean;
}
export interface TeamRecommendation {
    directive: string;
    analysis: {
        domains: string[];
        complexity: 'simple' | 'moderate' | 'complex';
        reasoning: string;
    };
    options: TeamOption[];
    customTeams: SavedTeam[];
    recommendedId: string;
}
export interface SavedTeam {
    id: string;
    name: string;
    roles: string[];
    createdAt: string;
    usageCount: number;
}
export declare function getSavedTeams(): SavedTeam[];
export declare function saveCustomTeam(name: string, roles: string[]): SavedTeam;
export declare function deleteCustomTeam(teamId: string): boolean;
export declare function incrementTeamUsage(teamId: string): void;
export declare function recommendTeam(directive: string): Promise<TeamRecommendation>;
