/* ═══════════════════════════════════════════
   Quest Board — Tycoon-style Feature Discovery
   Chapter-based progressive onboarding system
   ═══════════════════════════════════════════ */

export interface QuestTrigger {
  type: 'role_hired' | 'project_created' | 'task_executed'
    | 'wave_dispatched' | 'store_visited' | 'accessory_changed'
    | 'level_reached'
    | 'knowledge_visited' | 'theme_changed' | 'furniture_placed'
    | 'save_committed' | 'stats_visited' | 'bulletin_visited'
    | 'settings_visited' | 'furniture_purchased'
    | 'terminal_opened' | 'persona_updated' | 'chat_channel_created'
    | 'talk_mode_used' | 'do_mode_used';
  condition?: Record<string, unknown>;
}

export interface Quest {
  id: string;
  chapter: number;
  title: string;
  description: string;
  type: 'main' | 'side';
  trigger: QuestTrigger;
  rewards: {
    badge?: string;
    unlock?: string[];
    nextQuest?: string;
    coins?: number;
  };
  hint?: {
    target: string;
    message: string;
  };
}

export interface QuestProgress {
  completedQuests: string[];
  activeChapter: number;
  sideQuestsCompleted: string[];
  firstCompletedAt?: string;
}

/* ── Quest Definitions ── */

export const QUESTS: Quest[] = [
  // ═══ Chapter 1: Getting Started ═══
  {
    id: 'ch1-q1',
    chapter: 1,
    title: 'Hire your first employee',
    description: 'Every company starts with its first hire. Click the HIRE button to open the recruitment panel. Choose a role name (e.g. "PM"), set a level, and bring them on board. Each role becomes an AI agent that works for your company.',
    type: 'main',
    trigger: { type: 'role_hired' },
    rewards: { coins: 1000 },
    hint: { target: 'hire-btn', message: 'Click HIRE to recruit your first team member' },
  },
  {
    id: 'ch1-q2',
    chapter: 1,
    title: 'Open the Terminal',
    description: 'The Terminal is your command center — where you talk to your team. Click TERMINAL in the bottom bar to open it. You\'ll see a chat-like interface where you can select any role and give them instructions.',
    type: 'main',
    trigger: { type: 'terminal_opened' },
    rewards: { coins: 500 },
    hint: { target: 'terminal-btn', message: 'Click TERMINAL to open your command center' },
  },
  {
    id: 'ch1-q3',
    chapter: 1,
    title: 'Talk to your team',
    description: 'Use "Talk" mode to have a conversation with your team. Talk mode is for quick questions, brainstorming, and discussions — the AI role will respond with advice but won\'t modify any files. Select a role tab and type your message.',
    type: 'main',
    trigger: { type: 'talk_mode_used' },
    rewards: { coins: 1000 },
    hint: { target: 'terminal-btn', message: 'Open the terminal, select Talk mode, and chat' },
  },

  // ═══ Chapter 2: First Project ═══
  {
    id: 'ch2-q1',
    chapter: 2,
    title: 'Create a project',
    description: 'Projects organize your company\'s work. Click the Meeting Room in the office view to create one. Give it a name, description, and the system will scaffold a project folder with PRD, tasks, and design docs that your AI team will use.',
    type: 'main',
    trigger: { type: 'project_created' },
    rewards: { coins: 1500 },
    hint: { target: 'meeting-room', message: 'Click the Meeting Room to create a project' },
  },
  {
    id: 'ch2-q2',
    chapter: 2,
    title: 'Give your first order',
    description: 'Use "Do" mode to assign real work. Unlike Talk mode, Do mode lets roles execute tasks — they can read/write files, create documents, and run commands. Switch to Do mode in the terminal and give your team member a task.',
    type: 'main',
    trigger: { type: 'do_mode_used' },
    rewards: { badge: 'first-launch', coins: 2000 },
    hint: { target: 'terminal-btn', message: 'Open the terminal, switch to Do mode, and assign a task' },
  },

  // ═══ Chapter 3: Team Communication ═══
  {
    id: 'ch3-q1',
    chapter: 3,
    title: 'Create a chat channel',
    description: 'Chat channels let multiple roles discuss topics together — like Slack for your AI team. Click the "+" button next to channel tabs in the terminal to create a new channel. Add members and set a topic for focused collaboration.',
    type: 'main',
    trigger: { type: 'chat_channel_created' },
    rewards: { coins: 1500 },
    hint: { target: 'terminal-btn', message: 'Open the terminal and click "+" to create a chat channel' },
  },
  {
    id: 'ch3-q2',
    chapter: 3,
    title: 'Dispatch a CEO Wave',
    description: 'CEO Wave broadcasts a directive to your entire C-Level team at once. It\'s like an all-hands announcement — each C-Level role receives the wave and can delegate to their reports. Use it for company-wide initiatives, pivots, or big decisions.',
    type: 'main',
    trigger: { type: 'wave_dispatched' },
    rewards: { badge: 'team-builder', coins: 3000 },
    hint: { target: 'wave-btn', message: 'Click CEO WAVE to broadcast to your team' },
  },

  // ═══ Chapter 4: Building the Team ═══
  {
    id: 'ch4-q1',
    chapter: 4,
    title: 'Hire a CTO',
    description: 'C-Level roles are special — they can delegate work to their reports and make autonomous decisions. A CTO manages your technical team (Engineers, QA). Hire one with the C-Level tier to unlock the org hierarchy.',
    type: 'main',
    trigger: { type: 'role_hired', condition: { roleId: 'cto' } },
    rewards: { coins: 2000 },
    hint: { target: 'hire-btn', message: 'Hire a CTO to lead your tech team' },
  },
  {
    id: 'ch4-q2',
    chapter: 4,
    title: 'Hire an Engineer',
    description: 'Engineers are the builders. They read architecture docs, write code, and ship features. Set their "Reports To" to CTO so the org hierarchy works — when you wave, the CTO can delegate tasks down to engineers automatically.',
    type: 'main',
    trigger: { type: 'role_hired', condition: { roleId: 'engineer' } },
    rewards: { coins: 2500 },
    hint: { target: 'hire-btn', message: 'Hire an Engineer to start building' },
  },
  {
    id: 'ch4-q3',
    chapter: 4,
    title: 'Define a persona',
    description: 'Each role has a persona — their personality, expertise, and communication style. Click a role in the office to open their panel, then edit their persona. A well-defined persona makes the AI role more consistent and specialized.',
    type: 'main',
    trigger: { type: 'persona_updated' },
    rewards: { coins: 2000 },
    hint: { target: 'terminal-btn', message: 'Click a role in the office, then edit their persona' },
  },

  // ═══ Chapter 5: Knowledge & Docs ═══
  {
    id: 'ch5-q1',
    chapter: 5,
    title: 'Explore the Knowledge Base',
    description: 'The Knowledge Hub stores your company\'s documents — architecture decisions, domain knowledge, meeting notes. Your AI team reads these docs for context when working. Click the Knowledge bookshelf in the office to browse.',
    type: 'main',
    trigger: { type: 'knowledge_visited' },
    rewards: { coins: 2000 },
    hint: { target: 'knowledge-hub', message: 'Click the Knowledge Hub to explore your docs' },
  },
  {
    id: 'ch5-q2',
    chapter: 5,
    title: 'Check the Bulletin Board',
    description: 'The Bulletin Board shows your company\'s daily standups and wave execution logs. Every time a role completes work, they post a standup. Waves show the full chain of delegation. It\'s your company\'s activity feed.',
    type: 'main',
    trigger: { type: 'bulletin_visited' },
    rewards: { badge: 'scholar', coins: 2000 },
    hint: { target: 'bulletin-board', message: 'Click the Bulletin Board for company updates' },
  },

  // ═══ Chapter 6: Customization ═══
  {
    id: 'ch6-q1',
    chapter: 6,
    title: 'Visit the Character Store',
    description: 'The Store has community-created characters with unique pixel art designs. Browse characters shared by other Tycono users, preview their look, and import them into your team. Open HIRE and switch to the Store tab.',
    type: 'main',
    trigger: { type: 'store_visited' },
    rewards: { coins: 3000 },
    hint: { target: 'hire-btn', message: 'Open HIRE and check out the Store tab' },
  },
  {
    id: 'ch6-q2',
    chapter: 6,
    title: 'Customize a character',
    description: 'Every role has a pixel art character you can customize — change hair, skin, outfit, and accessories. Click a role in the office view to open their panel, then click the character sprite to enter the customization editor.',
    type: 'main',
    trigger: { type: 'accessory_changed' },
    rewards: { badge: 'explorer', coins: 5000 },
    hint: { target: 'hire-btn', message: 'Click a team member to customize their look' },
  },
  {
    id: 'ch6-q3',
    chapter: 6,
    title: 'Change the office theme',
    description: 'Your office supports multiple visual themes — each changes the color palette, mood, and atmosphere. Click the theme icon in the bottom bar to browse available themes and pick the one that matches your company\'s vibe.',
    type: 'main',
    trigger: { type: 'theme_changed' },
    rewards: { badge: 'stylist', coins: 2000 },
    hint: { target: 'theme-btn', message: 'Click the Theme button to change your office look' },
  },

  // ═══ Chapter 7: Office Design ═══
  {
    id: 'ch7-q1',
    chapter: 7,
    title: 'Decorate your office',
    description: 'Enter Edit mode to rearrange your office layout. You can drag furniture, place decorations, and create different room zones. Click the EDIT button, then drag items to place them. Click DONE when finished.',
    type: 'main',
    trigger: { type: 'furniture_placed' },
    rewards: { coins: 2000 },
    hint: { target: 'edit-btn', message: 'Click EDIT to enter furniture layout mode' },
  },
  {
    id: 'ch7-q2',
    chapter: 7,
    title: 'Buy premium furniture',
    description: 'Spend coins earned from quests and achievements to buy premium furniture. Enter Edit mode and browse the furniture shop — each item has a coin price. Premium items add unique visual flair to your office.',
    type: 'main',
    trigger: { type: 'furniture_purchased' },
    rewards: { badge: 'interior-designer', coins: 3000 },
    hint: { target: 'edit-btn', message: 'Enter EDIT mode and buy furniture with coins' },
  },

  // ═══ Chapter 8: Operations ═══
  {
    id: 'ch8-q1',
    chapter: 8,
    title: 'Review company stats',
    description: 'The Stats panel shows your company\'s performance metrics — token usage per role, activity levels, role leaderboard, and growth over time. Click the Stats facility in the office to see how your team is performing.',
    type: 'main',
    trigger: { type: 'stats_visited' },
    rewards: { coins: 2000 },
    hint: { target: 'stats-btn', message: 'Click Stats to see your company metrics' },
  },
  {
    id: 'ch8-q2',
    chapter: 8,
    title: 'Save your progress',
    description: 'Tycono uses git to track all changes your AI team makes. Press Cmd+S (or click the save indicator) to commit your company\'s current state. Each save creates a git commit — you can view history and even restore previous states.',
    type: 'main',
    trigger: { type: 'save_committed' },
    rewards: { coins: 2000 },
    hint: { target: 'save-btn', message: 'Press Cmd+S or click Save to commit changes' },
  },
  {
    id: 'ch8-q3',
    chapter: 8,
    title: 'Open Settings',
    description: 'The Settings panel lets you configure your company — adjust API keys, execution engine preferences, and other system options. Click the gear icon in the bottom bar to access it.',
    type: 'main',
    trigger: { type: 'settings_visited' },
    rewards: { coins: 2000 },
    hint: { target: 'settings-btn', message: 'Click the Settings gear to configure your company' },
  },

  // ═══ Chapter 9: Scaling Up ═══
  {
    id: 'ch9-q1',
    chapter: 9,
    title: 'Hire a Designer',
    description: 'A Designer handles UI/UX work — wireframes, mockups, and visual design decisions. They complement your Engineer by focusing on the user experience side. Hire one to round out your product team.',
    type: 'main',
    trigger: { type: 'role_hired', condition: { roleId: 'designer' } },
    rewards: { coins: 2500 },
    hint: { target: 'hire-btn', message: 'Hire a Designer for your creative team' },
  },
  {
    id: 'ch9-q2',
    chapter: 9,
    title: 'Hire a QA Engineer',
    description: 'QA Engineers test your product, find bugs, and ensure quality. They review code changes, write test plans, and validate that features work as expected. Essential for any serious product team.',
    type: 'main',
    trigger: { type: 'role_hired', condition: { roleId: 'qa' } },
    rewards: { coins: 3000 },
    hint: { target: 'hire-btn', message: 'Hire a QA Engineer for quality assurance' },
  },
  {
    id: 'ch9-q3',
    chapter: 9,
    title: 'Build a 5-person team',
    description: 'Growing your team unlocks the full potential of delegation. With 5+ members, your C-Level roles can distribute work across specialized team members, creating a real organizational hierarchy.',
    type: 'main',
    trigger: { type: 'role_hired', condition: { minRoles: 5 } },
    rewards: { badge: 'growing-company', coins: 5000 },
    hint: { target: 'hire-btn', message: 'Keep hiring until you have 5+ team members' },
  },

  // ═══ Chapter 10: Tycoon Master ═══
  {
    id: 'ch10-q1',
    chapter: 10,
    title: 'Build a 7-person team',
    description: 'A full-size team with diverse roles means your company can handle any challenge. CEO at the top, C-Levels managing domains, and specialists executing. You\'ve built a real AI-powered organization.',
    type: 'main',
    trigger: { type: 'role_hired', condition: { minRoles: 7 } },
    rewards: { badge: 'tycoon-master', coins: 10000 },
    hint: { target: 'hire-btn', message: 'Keep hiring until you have 7+ team members' },
  },
];

export const CHAPTERS = [
  { num: 1, title: 'Getting Started', questIds: ['ch1-q1', 'ch1-q2', 'ch1-q3'] },
  { num: 2, title: 'First Project', questIds: ['ch2-q1', 'ch2-q2'] },
  { num: 3, title: 'Team Communication', questIds: ['ch3-q1', 'ch3-q2'] },
  { num: 4, title: 'Building the Team', questIds: ['ch4-q1', 'ch4-q2', 'ch4-q3'] },
  { num: 5, title: 'Knowledge & Docs', questIds: ['ch5-q1', 'ch5-q2'] },
  { num: 6, title: 'Customization', questIds: ['ch6-q1', 'ch6-q2', 'ch6-q3'] },
  { num: 7, title: 'Office Design', questIds: ['ch7-q1', 'ch7-q2'] },
  { num: 8, title: 'Operations', questIds: ['ch8-q1', 'ch8-q2', 'ch8-q3'] },
  { num: 9, title: 'Scaling Up', questIds: ['ch9-q1', 'ch9-q2', 'ch9-q3'] },
  { num: 10, title: 'Tycoon Master', questIds: ['ch10-q1'] },
];

/* ── Quest Logic ── */

const DEFAULT_PROGRESS: QuestProgress = {
  completedQuests: [],
  activeChapter: 1,
  sideQuestsCompleted: [],
};

export function getDefaultProgress(): QuestProgress {
  return { ...DEFAULT_PROGRESS };
}

export function getQuestStatus(quest: Quest, progress: QuestProgress): 'active' | 'completed' {
  if (progress.completedQuests.includes(quest.id)) return 'completed';
  return 'active';
}

export function getActiveQuests(progress: QuestProgress): Quest[] {
  // All incomplete quests across all chapters (allows retroactive completion)
  return QUESTS.filter(q => getQuestStatus(q, progress) === 'active');
}

/** Get first active quest (for hint bar / spotlight) — prefers current chapter */
export function getActiveQuest(progress: QuestProgress): Quest | null {
  const all = getActiveQuests(progress);
  // Prefer current chapter quest for hint bar
  const currentCh = all.find(q => q.chapter === progress.activeChapter);
  return currentCh ?? all[0] ?? null;
}

export function completeQuest(progress: QuestProgress, questId: string): { progress: QuestProgress; quest: Quest | null } {
  const quest = QUESTS.find(q => q.id === questId);
  if (!quest) return { progress, quest: null };
  if (progress.completedQuests.includes(questId)) return { progress, quest: null };

  const newProgress = {
    ...progress,
    completedQuests: [...progress.completedQuests, questId],
    firstCompletedAt: progress.firstCompletedAt ?? new Date().toISOString(),
  };

  return { progress: newProgress, quest };
}

/** Recalculate activeChapter from completedQuests (migration for expanded chapters) */
export function recalcActiveChapter(progress: QuestProgress): QuestProgress {
  let active = 1;
  for (const ch of CHAPTERS) {
    if (ch.questIds.every(qid => progress.completedQuests.includes(qid))) {
      const next = CHAPTERS.find(c => c.num === ch.num + 1);
      if (next) active = next.num;
    }
  }
  if (active !== progress.activeChapter) {
    return { ...progress, activeChapter: active };
  }
  return progress;
}

export function getChapterProgress(progress: QuestProgress): { completed: number; total: number } {
  const total = QUESTS.filter(q => q.type === 'main').length;
  const completed = progress.completedQuests.filter(id => QUESTS.find(q => q.id === id)?.type === 'main').length;
  return { completed, total };
}

export function checkTrigger(quest: Quest, event: QuestTrigger): boolean {
  if (quest.trigger.type !== event.type) return false;
  if (quest.trigger.condition && event.condition) {
    for (const [key, val] of Object.entries(quest.trigger.condition)) {
      if (key === 'minRoles') {
        // Special: check >= instead of ===
        if ((event.condition['roleCount'] as number) < (val as number)) return false;
      } else {
        if (event.condition[key] !== val) return false;
      }
    }
  }
  return true;
}
