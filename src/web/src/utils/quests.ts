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
    | 'settings_visited' | 'furniture_purchased';
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
  // ═══ Chapter 1: 첫 팀원 영입 ═══
  {
    id: 'ch1-q1',
    chapter: 1,
    title: 'Hire your first employee',
    description: 'Open the Hire menu and bring a PM on board.',
    type: 'main',
    trigger: { type: 'role_hired' },
    rewards: { nextQuest: 'ch2-q1', coins: 1000 },
    hint: { target: 'hire-button', message: 'Click HIRE to recruit your first team member' },
  },

  // ═══ Chapter 2: 첫 프로젝트 ═══
  {
    id: 'ch2-q1',
    chapter: 2,
    title: 'Create a project',
    description: 'Head to the Meeting Room and start a new project.',
    type: 'main',
    trigger: { type: 'project_created' },
    rewards: { nextQuest: 'ch2-q2', coins: 1500 },
    hint: { target: 'meeting-room', message: 'Click the Meeting Room to create a project' },
  },
  {
    id: 'ch2-q2',
    chapter: 2,
    title: 'Give your first order',
    description: 'Select a role in the terminal and send them a task.',
    type: 'main',
    trigger: { type: 'task_executed' },
    rewards: { badge: 'first-launch', nextQuest: 'ch3-q1', coins: 2000 },
    hint: { target: 'terminal', message: 'Open the terminal and talk to your team' },
  },

  // ═══ Chapter 3: 기술 리더 영입 ═══
  {
    id: 'ch3-q1',
    chapter: 3,
    title: 'Hire a CTO',
    description: 'Your company needs technical leadership. Hire a CTO.',
    type: 'main',
    trigger: { type: 'role_hired', condition: { roleId: 'cto' } },
    rewards: { nextQuest: 'ch3-q2', coins: 2000 },
    hint: { target: 'hire-button', message: 'Hire a CTO to lead your tech team' },
  },
  {
    id: 'ch3-q2',
    chapter: 3,
    title: 'Request architecture design',
    description: 'Ask your CTO to design the system architecture.',
    type: 'main',
    trigger: { type: 'task_executed', condition: { roleId: 'cto' } },
    rewards: { nextQuest: 'ch4-q1', coins: 2500 },
    hint: { target: 'terminal-btn', message: 'Open the terminal and talk to your CTO' },
  },

  // ═══ Chapter 4: 팀 빌딩 ═══
  {
    id: 'ch4-q1',
    chapter: 4,
    title: 'Hire an Engineer',
    description: 'Time to build. Bring an Engineer onto the team.',
    type: 'main',
    trigger: { type: 'role_hired', condition: { roleId: 'engineer' } },
    rewards: { nextQuest: 'ch4-q2', coins: 2500 },
    hint: { target: 'hire-btn', message: 'Hire an Engineer to start building' },
  },
  {
    id: 'ch4-q2',
    chapter: 4,
    title: 'Dispatch a Wave',
    description: 'Use CEO Wave to broadcast a directive to your whole team.',
    type: 'main',
    trigger: { type: 'wave_dispatched' },
    rewards: { badge: 'team-builder', nextQuest: 'ch5-q1', coins: 3000 },
    hint: { target: 'wave-button', message: 'Click CEO WAVE to dispatch your first wave' },
  },

  // ═══ Chapter 5: 성장과 발견 ═══
  {
    id: 'ch5-q1',
    chapter: 5,
    title: 'Visit the Character Store',
    description: 'Check out community characters in the Store.',
    type: 'main',
    trigger: { type: 'store_visited' },
    rewards: { nextQuest: 'ch5-q2', coins: 3000 },
    hint: { target: 'hire-btn', message: 'Open HIRE and check out the Store tab' },
  },
  {
    id: 'ch5-q2',
    chapter: 5,
    title: 'Customize a character',
    description: 'Give one of your team members a new look.',
    type: 'main',
    trigger: { type: 'accessory_changed' },
    rewards: { badge: 'explorer', nextQuest: 'ch6-q1', coins: 5000 },
    hint: { target: 'hire-btn', message: 'Click a team member to customize their look' },
  },

  // ═══ Chapter 6: 지식 경영 ═══
  {
    id: 'ch6-q1',
    chapter: 6,
    title: 'Explore the Knowledge Base',
    description: 'Open the Knowledge Hub and browse your company docs.',
    type: 'main',
    trigger: { type: 'knowledge_visited' },
    rewards: { nextQuest: 'ch6-q2', coins: 2000 },
    hint: { target: 'knowledge-hub', message: 'Click the Knowledge Hub to explore your docs' },
  },
  {
    id: 'ch6-q2',
    chapter: 6,
    title: 'Check the Bulletin Board',
    description: 'Visit the Bulletin Board to see company updates and quests.',
    type: 'main',
    trigger: { type: 'bulletin_visited' },
    rewards: { badge: 'scholar', nextQuest: 'ch7-q1', coins: 2000 },
    hint: { target: 'bulletin-board', message: 'Click the Bulletin Board for company updates' },
  },

  // ═══ Chapter 7: 오피스 꾸미기 ═══
  {
    id: 'ch7-q1',
    chapter: 7,
    title: 'Decorate your office',
    description: 'Enter Edit mode and place a piece of furniture.',
    type: 'main',
    trigger: { type: 'furniture_placed' },
    rewards: { nextQuest: 'ch7-q2', coins: 2000 },
    hint: { target: 'edit-btn', message: 'Click EDIT to enter furniture layout mode' },
  },
  {
    id: 'ch7-q2',
    chapter: 7,
    title: 'Buy premium furniture',
    description: 'Purchase a furniture item from the shop using your coins.',
    type: 'main',
    trigger: { type: 'furniture_purchased' },
    rewards: { badge: 'interior-designer', nextQuest: 'ch8-q1', coins: 3000 },
    hint: { target: 'edit-btn', message: 'Enter EDIT mode and buy furniture with coins' },
  },

  // ═══ Chapter 8: 운영 관리 ═══
  {
    id: 'ch8-q1',
    chapter: 8,
    title: 'Review company stats',
    description: 'Check your company performance in the Stats panel.',
    type: 'main',
    trigger: { type: 'stats_visited' },
    rewards: { nextQuest: 'ch8-q2', coins: 2000 },
    hint: { target: 'stats-btn', message: 'Click the Stats panel to see your company metrics' },
  },
  {
    id: 'ch8-q2',
    chapter: 8,
    title: 'Save your progress',
    description: 'Commit your company changes with the Save feature.',
    type: 'main',
    trigger: { type: 'save_committed' },
    rewards: { nextQuest: 'ch8-q3', coins: 2000 },
    hint: { target: 'save-btn', message: 'Press Cmd+S or click Save to commit changes' },
  },
  {
    id: 'ch8-q3',
    chapter: 8,
    title: 'Change the office theme',
    description: 'Pick a new color scheme for your office.',
    type: 'main',
    trigger: { type: 'theme_changed' },
    rewards: { badge: 'stylist', nextQuest: 'ch9-q1', coins: 2000 },
    hint: { target: 'theme-btn', message: 'Click the Theme button to change your office look' },
  },

  // ═══ Chapter 9: 풀 팀 운영 ═══
  {
    id: 'ch9-q1',
    chapter: 9,
    title: 'Hire a Designer',
    description: 'Bring a UI/UX Designer onto the team.',
    type: 'main',
    trigger: { type: 'role_hired', condition: { roleId: 'designer' } },
    rewards: { nextQuest: 'ch9-q2', coins: 2500 },
    hint: { target: 'hire-btn', message: 'Hire a Designer for your creative team' },
  },
  {
    id: 'ch9-q2',
    chapter: 9,
    title: 'Build a 5-person team',
    description: 'Grow your company to at least 5 team members.',
    type: 'main',
    trigger: { type: 'role_hired', condition: { minRoles: 5 } },
    rewards: { badge: 'growing-company', nextQuest: 'ch10-q1', coins: 5000 },
    hint: { target: 'hire-btn', message: 'Keep hiring until you have 5+ team members' },
  },

  // ═══ Chapter 10: 마스터 CEO ═══
  {
    id: 'ch10-q1',
    chapter: 10,
    title: 'Hire a QA Engineer',
    description: 'Quality matters. Bring a QA specialist onto the team.',
    type: 'main',
    trigger: { type: 'role_hired', condition: { roleId: 'qa' } },
    rewards: { nextQuest: 'ch10-q2', coins: 3000 },
    hint: { target: 'hire-btn', message: 'Hire a QA Engineer for quality assurance' },
  },
  {
    id: 'ch10-q2',
    chapter: 10,
    title: 'Open Settings',
    description: 'Fine-tune your company configuration.',
    type: 'main',
    trigger: { type: 'settings_visited' },
    rewards: { nextQuest: 'ch10-q3', coins: 2000 },
    hint: { target: 'settings-btn', message: 'Click the Settings gear to configure your company' },
  },
  {
    id: 'ch10-q3',
    chapter: 10,
    title: 'Build a 7-person team',
    description: 'Grow your company to full capacity with 7+ members.',
    type: 'main',
    trigger: { type: 'role_hired', condition: { minRoles: 7 } },
    rewards: { badge: 'tycoon-master', coins: 10000 },
    hint: { target: 'hire-btn', message: 'Keep hiring until you have 7+ team members' },
  },
];

export const CHAPTERS = [
  { num: 1, title: 'First Hire', questIds: ['ch1-q1'] },
  { num: 2, title: 'First Project', questIds: ['ch2-q1', 'ch2-q2'] },
  { num: 3, title: 'Tech Leadership', questIds: ['ch3-q1', 'ch3-q2'] },
  { num: 4, title: 'Team Building', questIds: ['ch4-q1', 'ch4-q2'] },
  { num: 5, title: 'Growth & Discovery', questIds: ['ch5-q1', 'ch5-q2'] },
  { num: 6, title: 'Knowledge Management', questIds: ['ch6-q1', 'ch6-q2'] },
  { num: 7, title: 'Office Design', questIds: ['ch7-q1', 'ch7-q2'] },
  { num: 8, title: 'Operations & Style', questIds: ['ch8-q1', 'ch8-q2', 'ch8-q3'] },
  { num: 9, title: 'Full Team', questIds: ['ch9-q1', 'ch9-q2'] },
  { num: 10, title: 'Tycoon Master', questIds: ['ch10-q1', 'ch10-q2', 'ch10-q3'] },
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

export function getQuestStatus(quest: Quest, progress: QuestProgress): 'locked' | 'active' | 'completed' {
  if (progress.completedQuests.includes(quest.id)) return 'completed';
  // Active: quest's chapter is active AND all previous quests in same chapter are done
  if (quest.chapter > progress.activeChapter) return 'locked';
  if (quest.chapter < progress.activeChapter) return 'active'; // leftover from earlier chapter

  // Within active chapter: sequential unlock
  const chapter = CHAPTERS.find(c => c.num === quest.chapter);
  if (!chapter) return 'locked';
  for (const qid of chapter.questIds) {
    if (qid === quest.id) return 'active';
    if (!progress.completedQuests.includes(qid)) return 'locked';
  }
  return 'locked';
}

export function getActiveQuest(progress: QuestProgress): Quest | null {
  for (const quest of QUESTS) {
    if (getQuestStatus(quest, progress) === 'active') return quest;
  }
  return null;
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

  // Check if current chapter is fully complete → advance
  const chapter = CHAPTERS.find(c => c.num === quest.chapter);
  if (chapter && chapter.questIds.every(qid => newProgress.completedQuests.includes(qid))) {
    const nextChapter = CHAPTERS.find(c => c.num === quest.chapter + 1);
    if (nextChapter) {
      newProgress.activeChapter = nextChapter.num;
    }
  }

  return { progress: newProgress, quest };
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
