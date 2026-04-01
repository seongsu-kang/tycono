export interface RoleActivity {
    roleId: string;
    status: 'idle' | 'working' | 'done';
    currentTask: string;
    startedAt: string;
    updatedAt: string;
    recentOutput: string;
}
export declare function setActivity(roleId: string, task: string): void;
export declare function updateActivity(roleId: string, output: string): void;
export declare function completeActivity(roleId: string): void;
export declare function clearActivity(roleId: string): void;
export declare function getActivity(roleId: string): RoleActivity | null;
export declare function getAllActivities(): RoleActivity[];
