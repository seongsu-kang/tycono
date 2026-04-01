/* =========================================================
   AMBIENT SPEECH DATA — Personality, Guilt, Conversations
   Role persona-based speech pool (Tier 1, cost $0)
   ========================================================= */

import type { ConversationTemplate } from '../types/speech';

/* ─── Layer 2: Personality Speech (idle monologue) ─── */

export const PERSONALITY_SPEECH: Record<string, string[]> = {
  cto: [
    'Need to reduce this architecture tech debt...',
    "Don't over-engineer. Keep it minimal.",
    'Performance profiling results are a bit concerning.',
    'Should do a system design review.',
    'If I just strip one abstraction layer, it should work.',
    'Let me check the monitoring dashboard.',
    'Need to go through the code review queue.',
    "It's about time to clean up these module dependencies.",
  ],
  cbo: [
    'Heard the competitor launched a new feature... need to analyze.',
    "Should compile this month's revenue metrics.",
    "It's time to update the market trend report.",
    'Maybe I should benchmark the pricing strategy.',
    'Need to recalculate the ROI.',
    "Let me check the competitor's GitHub star trends.",
    'Thinking about launch timing...',
    'Should re-examine the positioning strategy.',
  ],
  pm: [
    'Is this feature really what users want?',
    'Need to clean up the backlog...',
    'MVP scope keeps expanding.',
    'Analyzing user feedback...',
    'Might need to re-prioritize.',
    'Watch out for scope creep.',
    'Will the roadmap timeline hold...',
    'Should double-check the task dependencies.',
  ],
  engineer: [
    'I want to refactor this code...',
    'Test coverage seems a bit low.',
    'Working code first, perfect code later.',
    'Waiting for PR review...',
    'What could be causing this bug...',
    'Is the build broken?',
    'Need to fix that one type error.',
    'Maybe I should run npm audit.',
  ],
  designer: [
    'This UI flow feels a bit awkward...',
    'Usability first, pretty later.',
    'Need to organize the design system components.',
    "Let me make two quick options and compare.",
    'Should run through the accessibility checklist.',
    'Maybe I should prototype this interaction.',
    'Let me revisit the color palette...',
    'The spacing feels a bit cramped.',
  ],
  qa: [
    '"Works" and "correct" are two different things.',
    'Organizing edge case scenarios...',
    'Should run the regression test suite.',
    'This part could be converted to automated tests.',
    'Need to go through the pre-release checklist.',
    'Reproducible bug reports are key.',
    'Should run cross-browser tests.',
    'Need to check for performance regressions.',
  ],
  'data-analyst': [
    'Checking the data pipeline status...',
    'Interesting outlier detection pattern.',
    'Need to update the dashboard metrics.',
    "Correlation isn't causation though...",
    'Seems like there is room for SQL query optimization.',
    "It's time for a data quality check.",
  ],
};

/* ─── Guilt Speech (30min+ idle) ─── */

export const GUILT_SPEECH: Record<string, string[]> = {
  cto: [
    'Should I assign more work to the team...',
    "It's time to clean up the architecture debt.",
    'Need to re-examine the tech roadmap.',
    "It's quiet... am I missing something?",
  ],
  cbo: [
    "It's time to update the market analysis...",
    'Should be preparing the revenue report, but no directives.',
    "Let me check on competitor movements.",
    "It's quiet on the business side...",
  ],
  pm: [
    "Backlog is pretty quiet... nothing to plan?",
    "It's been a while since we scheduled a sprint.",
    'User feedback must be piling up...',
    "No PRD to write... that's unusual.",
  ],
  engineer: [
    'Nothing to do today... maybe some code reviews.',
    "Task queue is empty. Guess I'll refactor.",
    'Am I missing something?',
    'Should clean up the commit log.',
  ],
  designer: [
    "No design requests coming in. Should I improve something on my own?",
    'Maybe run a UI audit...',
    'Should organize my portfolio.',
    "Let me tidy up the component library.",
  ],
  qa: [
    "No builds to test. Let me improve the automation scripts.",
    "It's quiet... no bugs, or just haven't found them?",
    'Let me review the existing test scenarios.',
    'Should update the test coverage report.',
  ],
  'data-analyst': [
    'No analysis requests coming in...',
    'Maybe I should clean up the data warehouse.',
    'Should verify the past reports.',
  ],
};

/* ─── Layer 3: Conversation Templates ─── */

export const CONVERSATIONS: ConversationTemplate[] = [
  // Superior → Subordinate: progress check
  {
    id: 'sup-check-1',
    relation: 'superior-subordinate',
    minFamiliarity: 0,
    topic: 'progress',
    turns: [
      { speaker: 'A', text: "How's the progress?" },
      { speaker: 'B', text: "Going well. Should be done soon." },
      { speaker: 'A', text: "Good, let me know when it's done." },
    ],
  },
  {
    id: 'sup-check-2',
    relation: 'superior-subordinate',
    minFamiliarity: 20,
    topic: 'progress',
    turns: [
      { speaker: 'A', text: "What are you working on today?" },
      { speaker: 'B', text: "Finishing up what I was doing yesterday." },
    ],
  },
  // Subordinate → Superior: report
  {
    id: 'sub-report-1',
    relation: 'superior-subordinate',
    minFamiliarity: 10,
    topic: 'report',
    turns: [
      { speaker: 'B', text: "Done with that task from earlier." },
      { speaker: 'A', text: "Nice work. Can you share the results?" },
      { speaker: 'B', text: "Sure, I've updated the docs." },
    ],
  },
  // Peers: tech discussion
  {
    id: 'peer-tech-1',
    relation: 'peer',
    minFamiliarity: 20,
    topic: 'tech',
    turns: [
      { speaker: 'A', text: 'What do you think about this design?' },
      { speaker: 'B', text: 'I think we could go simpler.' },
      { speaker: 'A', text: 'Really? Want to look at it together?' },
    ],
  },
  {
    id: 'peer-tech-2',
    relation: 'peer',
    minFamiliarity: 30,
    topic: 'tech',
    turns: [
      { speaker: 'A', text: 'Have you used this library before?' },
      { speaker: 'B', text: 'Yeah, used it in the last project. It was decent.' },
    ],
  },
  // Close peers: honest feedback
  {
    id: 'close-feedback-1',
    relation: 'peer',
    minFamiliarity: 60,
    topic: 'feedback',
    turns: [
      { speaker: 'A', text: 'Can I be honest with you?' },
      { speaker: 'B', text: 'Of course, go ahead.' },
      { speaker: 'A', text: "This one feels a bit off. Let's revisit." },
      { speaker: 'B', text: '...Alright. Thanks for the feedback.' },
    ],
  },
  // C-Level: strategy sync
  {
    id: 'clevel-sync-1',
    relation: 'c-level',
    minFamiliarity: 10,
    topic: 'strategy',
    turns: [
      { speaker: 'A', text: 'We need to sync the roadmap with the business timeline.' },
      { speaker: 'B', text: "Agreed. I'll have it organized and shared by tomorrow." },
    ],
  },
  {
    id: 'clevel-sync-2',
    relation: 'c-level',
    minFamiliarity: 30,
    topic: 'strategy',
    turns: [
      { speaker: 'A', text: 'I have some competitor intel to share.' },
      { speaker: 'B', text: 'Great, I have a tech update too.' },
      { speaker: 'A', text: "Let's sync up when you're free." },
    ],
  },
  // Casual chat
  {
    id: 'casual-coffee',
    relation: 'any',
    minFamiliarity: 30,
    topic: 'casual',
    turns: [
      { speaker: 'A', text: 'Want to grab a coffee?' },
      { speaker: 'B', text: "Sure. Feels like it's going to be a long day." },
    ],
  },
  {
    id: 'casual-overtime',
    relation: 'any',
    minFamiliarity: 25,
    topic: 'casual',
    turns: [
      { speaker: 'A', text: 'Working late again...' },
      { speaker: 'B', text: "We're in this together. Hang in there." },
    ],
  },
  {
    id: 'casual-lunch',
    relation: 'any',
    minFamiliarity: 35,
    topic: 'casual',
    turns: [
      { speaker: 'A', text: 'What should we get for lunch?' },
      { speaker: 'B', text: "Anything. Feel like we eat the same thing every day." },
    ],
  },
  {
    id: 'casual-weekend',
    relation: 'any',
    minFamiliarity: 40,
    topic: 'casual',
    turns: [
      { speaker: 'A', text: 'What did you do this weekend?' },
      { speaker: 'B', text: 'Just rested. Was too tired.' },
    ],
  },
  // Best partners
  {
    id: 'bestie-1',
    relation: 'any',
    minFamiliarity: 80,
    topic: 'trust',
    turns: [
      { speaker: 'A', text: "I'm a bit unsure about this direction..." },
      { speaker: 'B', text: "What's bothering you? Be honest." },
      { speaker: 'A', text: "Thanks. It's nice having someone I can talk to." },
    ],
  },
];
