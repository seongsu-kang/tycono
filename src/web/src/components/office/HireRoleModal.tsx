import { useState, useRef, useEffect, useMemo } from 'react';
import type { CreateRoleInput } from '../../types';
import type { CharacterAppearance } from '../../types/appearance';
import type { SkillExport } from '../../types/store';
import CharacterEditor, { randomAppearance } from './CharacterEditor';
import TopDownCharCanvas from './TopDownCharCanvas';
import { api } from '../../api/client';
import { cloudApi, type CloudCharacterSummary, type StoreSortOption } from '../../api/cloud';

interface Props {
  existingRoles: { id: string; name: string }[];
  onClose: () => void;
  onHire: (input: CreateRoleInput, appearance: CharacterAppearance) => Promise<void>;
  onStoreVisit?: () => void;
}

const LEVEL_OPTIONS: { value: CreateRoleInput['level']; label: string }[] = [
  { value: 'c-level', label: 'C-Level' },
  { value: 'team-lead', label: 'Team Lead' },
  { value: 'member', label: 'Member' },
];

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
}

function defaultsForLevel(level: CreateRoleInput['level']) {
  switch (level) {
    case 'c-level':
      return {
        authority: { autonomous: ['Strategic decisions within domain', 'Task delegation to reports'], needsApproval: ['Budget over $5K', 'External commitments'] },
        knowledge: { reads: ['company/', 'operations/', 'projects/'], writes: ['operations/', 'knowledge/'] },
        reports: { daily: 'standup', weekly: 'summary' },
      };
    case 'team-lead':
      return {
        authority: { autonomous: ['Task planning', 'Sprint management'], needsApproval: ['Architecture changes', 'New tool adoption'] },
        knowledge: { reads: ['projects/', 'architecture/'], writes: ['projects/'] },
        reports: { daily: 'standup', weekly: 'summary' },
      };
    default:
      return {
        authority: { autonomous: ['Implementation within assigned tasks'], needsApproval: ['Design changes', 'New dependencies'] },
        knowledge: { reads: ['projects/'], writes: [] as string[] },
        reports: { daily: 'standup', weekly: '' },
      };
  }
}

/* ─── Instance ID for voting ─── */

let _cachedInstanceId: string | null = null;

/** Get persistent instance ID from server preferences. Falls back to localStorage. */
async function getInstanceId(): Promise<string> {
  if (_cachedInstanceId) return _cachedInstanceId;

  // Try server-side preferences first (persisted in .tycono/preferences.json)
  try {
    const prefs = await api.getPreferences();
    if ((prefs as { instanceId?: string }).instanceId) {
      _cachedInstanceId = (prefs as { instanceId?: string }).instanceId!;
      localStorage.setItem('tycono_instance_id', _cachedInstanceId);
      return _cachedInstanceId;
    }
  } catch { /* server unavailable — fall through */ }

  // Fallback to localStorage
  const key = 'tycono_instance_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  _cachedInstanceId = id;
  return id;
}

const TOTAL_STEPS = 4;

/* ─── Bulk hire types ─── */

interface BulkEntry {
  name: string;
  id: string;
  level: CreateRoleInput['level'];
  reportsTo: string;
  error?: string;
}

function parseBulkLine(line: string, existingIds: Set<string>, seenIds: Set<string>): BulkEntry | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const parts = trimmed.split(',').map(s => s.trim());
  const name = parts[0];
  if (!name) return null;
  const id = slugify(name);
  const levelRaw = (parts[1] || 'member').toLowerCase();
  const level: CreateRoleInput['level'] =
    levelRaw === 'c-level' ? 'c-level' :
    levelRaw === 'team-lead' ? 'team-lead' : 'member';
  const reportsTo = parts[2] || 'ceo';
  let error: string | undefined;
  if (existingIds.has(id)) error = 'ID already exists';
  else if (seenIds.has(id)) error = 'Duplicate ID in batch';
  seenIds.add(id);
  return { name, id, level, reportsTo, error };
}

export default function HireRoleModal({ existingRoles, onClose, onHire, onStoreVisit }: Props) {
  const [mode, setMode] = useState<'single' | 'bulk' | 'store'>('single');

  /* ─── Store browse state ─── */
  const [storeChars, setStoreChars] = useState<CloudCharacterSummary[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeSort, setStoreSort] = useState<StoreSortOption>('popular');
  const [storeSearch, setStoreSearch] = useState('');
  const [storeCharacter, setStoreCharacter] = useState<Record<string, any> | null>(null);
  const [storeFetching, setStoreFetching] = useState(false);
  const [storeError, setStoreError] = useState('');
  const [storeStep, setStoreStep] = useState<'browse' | 'review'>('browse');
  const [storeName, setStoreName] = useState('');
  const [storeRoleId, setStoreRoleId] = useState('');
  const [storeReportsTo, setStoreReportsTo] = useState('ceo');
  const [storeToken, setStoreToken] = useState<string | null>(null); // logged-in instanceId

  /* ─── Single mode state ─── */
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [idEdited, setIdEdited] = useState(false);
  const [level, setLevel] = useState<CreateRoleInput['level']>('member');
  const [reportsTo, setReportsTo] = useState('ceo');
  const [persona, setPersona] = useState('');
  const [appearance, setAppearance] = useState<CharacterAppearance>(randomAppearance);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [availableSkills, setAvailableSkills] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());

  /* ─── Bulk mode state ─── */
  const [bulkText, setBulkText] = useState('');
  const [bulkStep, setBulkStep] = useState<'input' | 'review'>('input');
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });

  const nameRef = useRef<HTMLInputElement>(null);
  const personaRef = useRef<HTMLTextAreaElement>(null);
  const bulkRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.getSkills().then((skills) => setAvailableSkills(skills.filter(s => s.installed))).catch(() => {});
    // Auto-login: fetch instanceId from local API (preferences.json)
    getInstanceId().then(id => setStoreToken(id)).catch(() => {});
  }, []);

  useEffect(() => {
    if (mode === 'single') {
      if (step === 1) nameRef.current?.focus();
      if (step === 2) personaRef.current?.focus();
    } else if (mode === 'bulk') {
      if (bulkStep === 'input') bulkRef.current?.focus();
    }
  }, [step, mode, bulkStep]);

  /* ─── Load store characters ─── */
  useEffect(() => {
    if (mode === 'store' && storeStep === 'browse' && storeChars.length === 0) {
      loadStoreChars();
    }
  }, [mode, storeStep]);

  const loadStoreChars = async () => {
    setStoreLoading(true);
    try {
      const data = await cloudApi.getCharacters({ sort: storeSort, instanceId: storeToken ?? undefined });
      setStoreChars(data.characters);
    } catch { setStoreError('Failed to load store'); }
    setStoreLoading(false);
  };

  // Reload on sort change or token change
  useEffect(() => {
    if (mode === 'store' && storeStep === 'browse') {
      loadStoreChars();
    }
  }, [storeSort, storeToken]);

  const filteredChars = useMemo(() => {
    if (!storeSearch.trim()) return storeChars;
    const q = storeSearch.toLowerCase();
    return storeChars.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      (c.tagline ?? '').toLowerCase().includes(q)
    );
  }, [storeChars, storeSearch]);

  /* ─── Bulk parsing ─── */
  const existingIds = useMemo(() => new Set(existingRoles.map(r => r.id)), [existingRoles]);

  const bulkEntries = useMemo(() => {
    const lines = bulkText.split('\n');
    const seenIds = new Set<string>();
    return lines.map(l => parseBulkLine(l, existingIds, seenIds)).filter((e): e is BulkEntry => e !== null);
  }, [bulkText, existingIds]);

  const bulkValid = bulkEntries.length > 0 && bulkEntries.every(e => !e.error);

  /* ─── Single mode handlers ─── */
  const handleNameChange = (v: string) => {
    setName(v);
    if (!idEdited) setId(slugify(v));
  };

  const canNext1 = name.trim().length > 0 && id.trim().length > 0 && !existingRoles.some((r) => r.id === id);
  const canNext2 = persona.trim().length > 0;

  const handleHire = async () => {
    setBusy(true);
    setError('');
    const defaults = defaultsForLevel(level);
    try {
      await onHire({
        id,
        name: name.trim(),
        level,
        reportsTo,
        persona: persona.trim(),
        ...defaults,
        skills: selectedSkills.size > 0 ? [...selectedSkills] : undefined,
      }, appearance);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create role');
      setBusy(false);
    }
  };

  const canNext = (s: number) => {
    if (s === 1) return canNext1;
    if (s === 2) return canNext2;
    return true;
  };

  /* ─── Bulk mode handler ─── */
  const handleBulkHire = async () => {
    setBusy(true);
    setError('');
    setBulkProgress({ done: 0, total: bulkEntries.length });
    try {
      for (let i = 0; i < bulkEntries.length; i++) {
        const entry = bulkEntries[i];
        const defaults = defaultsForLevel(entry.level);
        const ap = randomAppearance();
        const autoPersona = `${entry.name}. A ${entry.level} role reporting to ${entry.reportsTo}.`;
        await onHire({
          id: entry.id,
          name: entry.name,
          level: entry.level,
          reportsTo: entry.reportsTo,
          persona: autoPersona,
          ...defaults,
        }, ap);
        setBulkProgress({ done: i + 1, total: bulkEntries.length });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create roles');
      setBusy(false);
    }
  };

  /* ─── Store handlers ─── */
  const handleStoreSelect = async (charId: string) => {
    setStoreFetching(true);
    setStoreError('');
    try {
      const ch = await cloudApi.getCharacter(charId);
      setStoreCharacter(ch);
      setStoreName(ch.name || '');
      setStoreRoleId(slugify(ch.name || charId));
      setStoreStep('review');
    } catch {
      setStoreError('Failed to load character details');
    } finally {
      setStoreFetching(false);
    }
  };

  const handleVote = async (charId: string, vote: 1 | -1) => {
    if (!storeToken) return; // must be logged in
    const existing = storeChars.find(c => c.id === charId);
    if (!existing) return;
    const newVote = existing.my_vote === vote ? 0 : vote;
    try {
      const result = await cloudApi.voteCharacter(charId, storeToken, newVote as 1 | -1 | 0);
      setStoreChars(prev => prev.map(c => c.id === charId ? {
        ...c,
        upvotes: result.upvotes,
        downvotes: result.downvotes,
        vote_score: result.upvotes - result.downvotes,
        my_vote: newVote === 0 ? null : newVote,
      } : c));
    } catch { /* silently fail */ }
  };

  const handleStoreHire = async () => {
    if (!storeCharacter) return;
    setBusy(true);
    setError('');
    const ch = storeCharacter;
    const lvl = (ch.level === 'c-level' || ch.level === 'team-lead') ? ch.level : 'member' as const;
    const defaults = defaultsForLevel(lvl);

    const isSkillExp = ch.skills != null && typeof ch.skills === 'object' && !Array.isArray(ch.skills) && 'primary' in ch.skills;

    try {
      await onHire({
        id: storeRoleId,
        name: storeName.trim(),
        level: lvl,
        reportsTo: storeReportsTo,
        persona: ch.persona || `${storeName}. Imported from Tycono Store.`,
        authority: ch.authority || defaults.authority,
        knowledge: defaults.knowledge,
        reports: defaults.reports,
        source: { id: `tycono/${ch.id}`, sync: 'manual', forked_at: '1.0.0', upstream_version: '1.0.0' },
        skillContent: isSkillExp ? (ch.skills as SkillExport) : undefined,
      }, ch.appearance ? ch.appearance : randomAppearance());
      // Track install
      cloudApi.trackInstall(ch.id).catch(() => {});
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to hire');
      setBusy(false);
    }
  };

  const handleStoreDelete = async (charId: string) => {
    if (!storeToken) return;
    try {
      await cloudApi.deleteCharacter(charId, storeToken);
      setStoreChars(prev => prev.filter(c => c.id !== charId));
    } catch { /* ignore */ }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      if (mode === 'single') {
        if (step < TOTAL_STEPS && canNext(step)) setStep(step + 1);
        else if (step === TOTAL_STEPS) handleHire();
      } else if (mode === 'bulk') {
        if (bulkStep === 'input' && bulkValid) setBulkStep('review');
        else if (bulkStep === 'review') handleBulkHire();
      } else if (mode === 'store') {
        if (storeStep === 'review') handleStoreHire();
      }
    }
  };

  const idConflict = existingRoles.some((r) => r.id === id) && id.length > 0;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] max-h-[90vh] z-[61] bg-[var(--wall)] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="p-5 text-white" style={{ background: 'linear-gradient(135deg, #2E7D32, #43A047)' }}>
          <div className="flex items-center justify-between">
            <div className="text-lg font-bold">Hire New Role</div>
            <div className="flex bg-black/20 rounded-lg p-0.5">
              <button
                onClick={() => { setMode('single'); setError(''); }}
                className={`px-3 py-1 text-xs font-semibold rounded-md cursor-pointer transition-colors ${mode === 'single' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/70'}`}
              >
                Single
              </button>
              <button
                onClick={() => { setMode('bulk'); setError(''); }}
                className={`px-3 py-1 text-xs font-semibold rounded-md cursor-pointer transition-colors ${mode === 'bulk' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/70'}`}
              >
                Bulk
              </button>
              <button
                onClick={() => { setMode('store'); setError(''); onStoreVisit?.(); }}
                className={`px-3 py-1 text-xs font-semibold rounded-md cursor-pointer transition-colors ${mode === 'store' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/70'}`}
              >
                Store
              </button>
            </div>
          </div>
          <div className="text-sm opacity-80 mt-0.5 flex items-center gap-2">
            <span>{mode === 'single' ? `Step ${step} of ${TOTAL_STEPS}` : mode === 'bulk' ? (bulkStep === 'input' ? 'Enter roles, one per line' : `Review ${bulkEntries.length} roles`) : (storeStep === 'browse' ? `${storeChars.length} characters available` : 'Review & customize')}</span>
            {mode === 'store' && storeStep === 'browse' && (
              <a
                href="https://tycono.ai/store.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] opacity-60 hover:opacity-100 transition-opacity"
                onClick={e => e.stopPropagation()}
              >Open in browser ↗</a>
            )}
          </div>
        </div>

        {/* Step indicator (single only) */}
        {mode === 'single' && (
          <div className="flex gap-1 px-5 pt-4">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
              <div
                key={s}
                className="flex-1 h-1 rounded-full transition-colors"
                style={{ background: s <= step ? '#2E7D32' : 'rgba(255,255,255,0.1)' }}
              />
            ))}
          </div>
        )}

        {/* Body */}
        <div className="p-5 min-h-[240px] overflow-y-auto flex-1">
          {mode === 'store' ? (
            /* ─── Store browse mode ─── */
            <>
              {storeStep === 'browse' && (
                <div className="space-y-3">
                  {/* Auth banner */}
                  {!storeToken ? (
                    <StoreLoginBanner onLogin={(token) => {
                      _cachedInstanceId = token;
                      localStorage.setItem('tycono_instance_id', token);
                      setStoreToken(token);
                    }} />
                  ) : (
                    <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-green-900/10 border border-green-800/20 text-[10px]">
                      <span className="text-green-400/70">Signed in · <span className="font-mono text-white/40">{storeToken.slice(0, 8)}...</span></span>
                      <button
                        onClick={() => { _cachedInstanceId = null; localStorage.removeItem('tycono_instance_id'); setStoreToken(null); }}
                        className="text-white/30 hover:text-white/60 cursor-pointer"
                      >Sign out</button>
                    </div>
                  )}

                  {/* Search + Sort bar */}
                  <div className="flex gap-2">
                    <input
                      value={storeSearch}
                      onChange={(e) => setStoreSearch(e.target.value)}
                      placeholder="Search characters..."
                      className="flex-1 p-2 rounded-lg border border-white/10 bg-white/5 text-sm text-white/90 placeholder-white/25 focus:outline-none focus:border-white/25 transition-colors"
                      autoFocus
                    />
                    <select
                      value={storeSort}
                      onChange={(e) => setStoreSort(e.target.value as StoreSortOption)}
                      className="px-2 py-2 rounded-lg border border-white/10 bg-white/5 text-xs text-white/70 focus:outline-none cursor-pointer"
                    >
                      <option value="popular" className="bg-[var(--wall)]">Popular</option>
                      <option value="installs" className="bg-[var(--wall)]">Most Hired</option>
                      <option value="newest" className="bg-[var(--wall)]">Newest</option>
                      <option value="name" className="bg-[var(--wall)]">A-Z</option>
                    </select>
                  </div>

                  {/* Characters list */}
                  {storeLoading ? (
                    <div className="text-center py-8 text-sm text-white/40">Loading store...</div>
                  ) : storeError ? (
                    <div className="text-center py-8">
                      <div className="text-xs text-red-400 mb-2">{storeError}</div>
                      <button onClick={loadStoreChars} className="text-xs text-green-400 hover:underline cursor-pointer">Retry</button>
                    </div>
                  ) : filteredChars.length === 0 ? (
                    <div className="text-center py-8 text-sm text-white/40">
                      {storeSearch ? 'No matches found' : 'No characters in store yet'}
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                      {filteredChars.map((ch) => (
                        <StoreCharCard
                          key={ch.id}
                          char={ch}
                          isHired={existingIds.has(ch.id)}
                          onSelect={() => handleStoreSelect(ch.id)}
                          onVote={(vote) => handleVote(ch.id, vote)}
                          onDelete={() => handleStoreDelete(ch.id)}
                          fetching={storeFetching}
                          token={storeToken}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {storeStep === 'review' && storeCharacter && (
                <div className="space-y-4">
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <div className="flex gap-4">
                      {storeCharacter.appearance && (
                        <div className="flex-shrink-0 rounded-lg overflow-hidden" style={{ background: '#0d1117', padding: 8 }}>
                          <TopDownCharCanvas roleId="store-preview" appearance={storeCharacter.appearance} scale={4} />
                        </div>
                      )}
                      <div className="flex-1 space-y-2.5">
                        <div>
                          <label className="block text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Name</label>
                          <input
                            value={storeName}
                            onChange={(e) => setStoreName(e.target.value)}
                            className="w-full p-2 rounded-lg border border-white/10 bg-white/5 text-sm text-white/90 focus:outline-none focus:border-white/25 transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Role ID</label>
                          <input
                            value={storeRoleId}
                            onChange={(e) => setStoreRoleId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                            className="w-full p-2 rounded-lg border border-white/10 bg-white/5 text-sm text-white/90 font-mono focus:outline-none focus:border-white/25 transition-colors"
                          />
                          {existingRoles.some(r => r.id === storeRoleId) && storeRoleId.length > 0 && (
                            <div className="text-xs text-red-500 mt-1">ID already exists</div>
                          )}
                        </div>
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="block text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Level</label>
                            <div className="text-sm text-white/70 p-2 rounded-lg bg-white/5 border border-white/10">
                              {storeCharacter.level === 'c-level' ? 'C-Level' : storeCharacter.level === 'team-lead' ? 'Lead' : 'Member'}
                            </div>
                          </div>
                          <div className="flex-1">
                            <label className="block text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Reports To</label>
                            <select
                              value={storeReportsTo}
                              onChange={(e) => setStoreReportsTo(e.target.value)}
                              className="w-full p-2 rounded-lg border border-white/10 bg-white/5 text-sm text-white/90 focus:outline-none focus:border-white/25 transition-colors"
                            >
                              <option value="ceo" className="bg-[var(--wall)] text-white">CEO</option>
                              {existingRoles.map((r) => (
                                <option key={r.id} value={r.id} className="bg-[var(--wall)] text-white">{r.name} ({r.id})</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                    {storeCharacter.persona && (
                      <div className="pt-3 mt-3 border-t border-white/10">
                        <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Persona</div>
                        <div className="text-xs text-white/60 leading-relaxed line-clamp-3">{storeCharacter.persona}</div>
                      </div>
                    )}
                    {storeCharacter.skills && (
                      <div className="pt-3 mt-3 border-t border-white/10">
                        <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Skills</div>
                        <div className="flex flex-wrap gap-1.5">
                          {(() => {
                            const sk = storeCharacter.skills;
                            const isExp = sk && typeof sk === 'object' && !Array.isArray(sk) && 'primary' in sk;
                            if (isExp) {
                              const names: string[] = [];
                              if (sk.primary?.frontmatter?.name) names.push(sk.primary.frontmatter.name);
                              if (sk.shared) sk.shared.forEach((s: any) => names.push(s.frontmatter?.name || s.id));
                              return names.map((n: string) => (
                                <span key={n} className="px-2 py-0.5 rounded text-[10px] font-mono bg-green-900/20 border border-green-800/30 text-green-400">{n}</span>
                              ));
                            }
                            const arr = Array.isArray(sk) ? sk : [];
                            return arr.map((s: any, i: number) => (
                              <span key={i} className="px-2 py-0.5 rounded text-[10px] font-mono bg-green-900/20 border border-green-800/30 text-green-400">
                                {typeof s === 'string' ? s : s.name}
                              </span>
                            ));
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                  {error && (
                    <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded-lg border border-red-800/30">{error}</div>
                  )}
                </div>
              )}
            </>
          ) : mode === 'single' ? (
            <>
              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--desk-dark)] uppercase tracking-wider mb-1">Role Name</label>
                    <input
                      ref={nameRef}
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="e.g. Data Analyst"
                      className="w-full p-2.5 rounded-lg border border-white/10 bg-white/5 text-sm text-white/90 placeholder-white/25 focus:outline-none focus:border-white/25 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--desk-dark)] uppercase tracking-wider mb-1">Role ID (slug)</label>
                    <input
                      value={id}
                      onChange={(e) => { setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setIdEdited(true); }}
                      className={`w-full p-2.5 rounded-lg border bg-white/5 text-sm text-white/90 font-mono focus:outline-none transition-colors ${idConflict ? 'border-red-400' : 'border-white/10 focus:border-white/25'}`}
                    />
                    {idConflict && <div className="text-xs text-red-500 mt-1">ID already exists</div>}
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--desk-dark)] uppercase tracking-wider mb-1">Level</label>
                    <div className="flex gap-2">
                      {LEVEL_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setLevel(opt.value)}
                          className={`flex-1 p-2 text-xs font-semibold rounded-lg border cursor-pointer transition-colors ${level === opt.value ? 'border-green-600 bg-green-900/30 text-green-400' : 'border-white/10 text-white/50 hover:border-white/20'}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--desk-dark)] uppercase tracking-wider mb-1">Reports To</label>
                    <select
                      value={reportsTo}
                      onChange={(e) => setReportsTo(e.target.value)}
                      className="w-full p-2.5 rounded-lg border border-white/10 bg-white/5 text-sm text-white/90 focus:outline-none focus:border-white/25 transition-colors"
                    >
                      <option value="ceo" className="bg-[var(--wall)] text-white">CEO</option>
                      {existingRoles.map((r) => (
                        <option key={r.id} value={r.id} className="bg-[var(--wall)] text-white">{r.name} ({r.id})</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--desk-dark)] uppercase tracking-wider mb-2">Persona</label>
                    <textarea
                      ref={personaRef}
                      value={persona}
                      onChange={(e) => setPersona(e.target.value)}
                      placeholder="Describe this role's personality, expertise, and working style..."
                      className="w-full h-32 p-3 rounded-lg border border-white/10 bg-white/5 text-sm text-white/90 placeholder-white/25 resize-none focus:outline-none focus:border-white/25 transition-colors"
                    />
                    <div className="text-[10px] text-gray-400 mt-1">This defines how the AI agent will behave in this role</div>
                  </div>
                  {availableSkills.length > 0 && (
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--desk-dark)] uppercase tracking-wider mb-2">Skills</label>
                      <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                        {availableSkills.map((skill) => (
                          <label
                            key={skill.id}
                            className="flex items-center gap-2 p-2 rounded-lg border border-white/10 bg-white/5 cursor-pointer hover:border-white/20 transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={selectedSkills.has(skill.id)}
                              onChange={() => setSelectedSkills(prev => {
                                const next = new Set(prev);
                                if (next.has(skill.id)) next.delete(skill.id);
                                else next.add(skill.id);
                                return next;
                              })}
                              className="accent-green-600"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold text-white/80">{skill.name}</div>
                              <div className="text-[10px] text-white/40 truncate">{skill.description}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="customize-body" style={{ padding: 0 }}>
                  <CharacterEditor
                    roleId="default"
                    appearance={appearance}
                    onChange={setAppearance}
                    onRandomize={() => setAppearance(randomAppearance())}
                    onReset={() => setAppearance(randomAppearance())}
                    label={
                      <span>
                        {id || 'new-role'} — {name || 'New Role'}
                      </span>
                    }
                  />
                </div>
              )}

              {step === 4 && (
                <div className="space-y-3">
                  <div className="text-[11px] font-bold text-[var(--desk-dark)] uppercase tracking-wider mb-2">Review</div>
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 rounded-lg overflow-hidden" style={{ background: '#0d1117', padding: 8 }}>
                        <TopDownCharCanvas roleId="default" appearance={appearance} scale={4} />
                      </div>
                      <div className="flex-1 space-y-2.5">
                        <ReviewRow label="Name" value={name} />
                        <ReviewRow label="ID" value={id} mono />
                        <ReviewRow label="Level" value={level} />
                        <ReviewRow label="Reports To" value={reportsTo} />
                        {selectedSkills.size > 0 && (
                          <ReviewRow label="Skills" value={[...selectedSkills].join(', ')} />
                        )}
                      </div>
                    </div>
                    <div className="pt-3 mt-3 border-t border-white/10">
                      <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Persona</div>
                      <div className="text-xs text-white/60 leading-relaxed">{persona}</div>
                    </div>
                  </div>
                  {error && (
                    <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded-lg border border-red-800/30">{error}</div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* ─── Bulk mode ─── */
            <>
              {bulkStep === 'input' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--desk-dark)] uppercase tracking-wider mb-2">Roles (one per line)</label>
                    <textarea
                      ref={bulkRef}
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                      placeholder={"Name, Level, ReportsTo\ne.g.\nData Analyst\nDevOps Engineer, member, cto\nVP Marketing, c-level, ceo"}
                      className="w-full h-40 p-3 rounded-lg border border-white/10 bg-white/5 text-sm text-white/90 placeholder-white/25 resize-none focus:outline-none focus:border-white/25 transition-colors font-mono"
                    />
                    <div className="text-[10px] text-gray-400 mt-1">
                      Format: Name, Level (member/team-lead/c-level), ReportsTo. Level and ReportsTo are optional.
                    </div>
                  </div>
                  {bulkEntries.length > 0 && (
                    <div>
                      <div className="text-[11px] font-bold text-[var(--desk-dark)] uppercase tracking-wider mb-2">
                        Preview ({bulkEntries.length} role{bulkEntries.length !== 1 ? 's' : ''})
                      </div>
                      <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="text-left p-2 text-white/40 font-semibold">Name</th>
                              <th className="text-left p-2 text-white/40 font-semibold">ID</th>
                              <th className="text-left p-2 text-white/40 font-semibold">Level</th>
                              <th className="text-left p-2 text-white/40 font-semibold">Reports To</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bulkEntries.map((entry, i) => (
                              <tr key={i} className={`border-b border-white/5 ${entry.error ? 'bg-red-900/10' : ''}`}>
                                <td className="p-2 text-white/80">{entry.name}</td>
                                <td className="p-2 text-white/60 font-mono">{entry.id}</td>
                                <td className="p-2 text-white/60">{entry.level}</td>
                                <td className="p-2 text-white/60">{entry.reportsTo}</td>
                                {entry.error && (
                                  <td className="p-2 text-red-400 text-[10px]">{entry.error}</td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {bulkStep === 'review' && (
                <div className="space-y-4">
                  <div className="text-[11px] font-bold text-[var(--desk-dark)] uppercase tracking-wider mb-2">
                    Confirm Bulk Hire — {bulkEntries.length} roles
                  </div>
                  <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden max-h-[300px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[var(--wall)]">
                        <tr className="border-b border-white/10">
                          <th className="text-left p-2 text-white/40 font-semibold">#</th>
                          <th className="text-left p-2 text-white/40 font-semibold">Name</th>
                          <th className="text-left p-2 text-white/40 font-semibold">ID</th>
                          <th className="text-left p-2 text-white/40 font-semibold">Level</th>
                          <th className="text-left p-2 text-white/40 font-semibold">Reports To</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkEntries.map((entry, i) => (
                          <tr key={i} className="border-b border-white/5">
                            <td className="p-2 text-white/30">{i + 1}</td>
                            <td className="p-2 text-white/80">{entry.name}</td>
                            <td className="p-2 text-white/60 font-mono">{entry.id}</td>
                            <td className="p-2 text-white/60">{entry.level}</td>
                            <td className="p-2 text-white/60">{entry.reportsTo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {busy && bulkProgress.total > 0 && (
                    <div>
                      <div className="flex justify-between text-[10px] text-white/40 mb-1">
                        <span>Hiring...</span>
                        <span>{bulkProgress.done}/{bulkProgress.total}</span>
                      </div>
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%`, background: '#2E7D32' }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="text-[10px] text-white/30">
                    Each role will get a random appearance and auto-generated persona. You can customize them later.
                  </div>
                  {error && (
                    <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded-lg border border-red-800/30">{error}</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between px-5 pb-5">
          <div>
            {mode === 'single' && step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-4 py-2 text-sm rounded-lg border border-white/15 text-white/60 hover:bg-white/5 cursor-pointer"
              >
                Back
              </button>
            )}
            {mode === 'bulk' && bulkStep === 'review' && (
              <button
                onClick={() => setBulkStep('input')}
                disabled={busy}
                className="px-4 py-2 text-sm rounded-lg border border-white/15 text-white/60 hover:bg-white/5 cursor-pointer disabled:opacity-40"
              >
                Back
              </button>
            )}
            {mode === 'store' && storeStep === 'review' && (
              <button
                onClick={() => { setStoreStep('browse'); setStoreCharacter(null); setError(''); }}
                disabled={busy}
                className="px-4 py-2 text-sm rounded-lg border border-white/15 text-white/60 hover:bg-white/5 cursor-pointer disabled:opacity-40"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-white/15 text-white/60 hover:bg-white/5 cursor-pointer"
            >
              Cancel
            </button>
            {mode === 'single' ? (
              step < TOTAL_STEPS ? (
                <button
                  onClick={() => setStep(step + 1)}
                  disabled={!canNext(step)}
                  className="px-5 py-2 text-sm text-white rounded-lg font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: '#2E7D32' }}
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleHire}
                  disabled={busy}
                  className="px-5 py-2 text-sm text-white rounded-lg font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: '#2E7D32' }}
                >
                  {busy ? 'Hiring...' : 'HIRE'}
                </button>
              )
            ) : mode === 'bulk' ? (
              bulkStep === 'input' ? (
                <button
                  onClick={() => setBulkStep('review')}
                  disabled={!bulkValid}
                  className="px-5 py-2 text-sm text-white rounded-lg font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: '#2E7D32' }}
                >
                  Review ({bulkEntries.length})
                </button>
              ) : (
                <button
                  onClick={handleBulkHire}
                  disabled={busy}
                  className="px-5 py-2 text-sm text-white rounded-lg font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: '#2E7D32' }}
                >
                  {busy ? `Hiring ${bulkProgress.done}/${bulkProgress.total}...` : `HIRE ALL (${bulkEntries.length})`}
                </button>
              )
            ) : (
              storeStep === 'review' ? (
                <button
                  onClick={handleStoreHire}
                  disabled={busy || !storeName.trim() || !storeRoleId.trim() || existingRoles.some(r => r.id === storeRoleId)}
                  className="px-5 py-2 text-sm text-white rounded-lg font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: '#2E7D32' }}
                >
                  {busy ? 'Hiring...' : 'HIRE'}
                </button>
              ) : null
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Store Login Banner ─── */

function StoreLoginBanner({ onLogin }: { onLogin: (token: string) => void }) {
  const [tokenInput, setTokenInput] = useState('');
  const [showTokenField, setShowTokenField] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const t = tokenInput.trim();
    if (!t) return;
    // Basic UUID format check
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) {
      setError('Invalid token format');
      return;
    }
    onLogin(t);
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
      <div className="text-[11px] text-white/50">
        Sign in to vote, publish, and manage your characters.
      </div>
      {!showTokenField ? (
        <div className="flex gap-2">
          <button
            onClick={setShowTokenField.bind(null, true)}
            className="px-3 py-1.5 text-[11px] font-semibold rounded-lg cursor-pointer text-amber-400 bg-amber-900/20 border border-amber-800/30 hover:bg-amber-900/40 transition-colors"
          >
            Paste Token
          </button>
          <span className="text-[10px] text-white/20 self-center">from Settings → Token</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <input
              value={tokenInput}
              onChange={(e) => { setTokenInput(e.target.value); setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              placeholder="Paste your token here..."
              className="flex-1 px-2 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs text-white/90 font-mono placeholder-white/20 focus:outline-none focus:border-amber-800/40"
              autoFocus
            />
            <button
              onClick={handleSubmit}
              disabled={!tokenInput.trim()}
              className="px-3 py-1.5 text-[11px] font-semibold rounded-lg cursor-pointer text-green-400 bg-green-900/20 border border-green-800/30 hover:bg-green-900/40 disabled:opacity-30 transition-colors"
            >
              Sign in
            </button>
          </div>
          {error && <div className="text-[10px] text-red-400">{error}</div>}
          <button
            onClick={setShowTokenField.bind(null, false)}
            className="text-[10px] text-white/30 hover:text-white/50 cursor-pointer"
          >Cancel</button>
        </div>
      )}
    </div>
  );
}

/* ─── Store Character Card ─── */

function StoreCharCard({ char, isHired, onSelect, onVote, onDelete, fetching, token }: {
  char: CloudCharacterSummary;
  isHired: boolean;
  onSelect: () => void;
  onVote: (vote: 1 | -1) => void;
  onDelete: () => void;
  fetching: boolean;
  token: string | null;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isOwner = token && char.publisher_id === token;
  const canVote = !!token;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors group">
      {/* Vote column */}
      <div className="flex flex-col items-center gap-0.5 shrink-0 w-8">
        <button
          onClick={(e) => { e.stopPropagation(); onVote(1); }}
          disabled={!canVote}
          className={`text-[14px] leading-none transition-colors ${canVote ? 'cursor-pointer' : 'cursor-not-allowed opacity-30'} ${char.my_vote === 1 ? 'text-green-400' : 'text-white/20 hover:text-green-400/60'}`}
          title={canVote ? 'Upvote' : 'Sign in to vote'}
        >
          {'\u25B2'}
        </button>
        <span className={`text-[11px] font-bold tabular-nums ${(char.vote_score ?? 0) > 0 ? 'text-green-400/80' : (char.vote_score ?? 0) < 0 ? 'text-red-400/80' : 'text-white/30'}`}>
          {char.vote_score ?? 0}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onVote(-1); }}
          disabled={!canVote}
          className={`text-[14px] leading-none transition-colors ${canVote ? 'cursor-pointer' : 'cursor-not-allowed opacity-30'} ${char.my_vote === -1 ? 'text-red-400' : 'text-white/20 hover:text-red-400/60'}`}
          title={canVote ? 'Downvote' : 'Sign in to vote'}
        >
          {'\u25BC'}
        </button>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onSelect}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white/90 truncate">{char.name}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase ${
            char.level === 'c-level' ? 'bg-amber-900/30 text-amber-400 border border-amber-800/30' :
            char.level === 'team-lead' ? 'bg-blue-900/30 text-blue-400 border border-blue-800/30' :
            'bg-white/5 text-white/40 border border-white/10'
          }`}>
            {char.level}
          </span>
          {isHired && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-900/20 text-green-400/60 border border-green-800/20">Hired</span>
          )}
        </div>
        {char.tagline && (
          <div className="text-[11px] text-white/40 truncate mt-0.5">{char.tagline}</div>
        )}
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[10px] text-white/25">{char.installs ?? 0} installs</span>
          <span className="text-[10px] text-white/25">v{char.version}</span>
          <span className="text-[10px] text-white/25 font-mono">{char.id}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onSelect}
          disabled={fetching}
          className="px-3 py-1.5 text-[11px] font-semibold rounded-lg cursor-pointer transition-colors disabled:opacity-40 text-green-400 bg-green-900/20 border border-green-800/30 hover:bg-green-900/40"
        >
          Hire
        </button>
        {isOwner && (showDeleteConfirm ? (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); setShowDeleteConfirm(false); }}
              className="px-2 py-1.5 text-[10px] font-semibold rounded cursor-pointer text-red-400 bg-red-900/30 border border-red-800/40 hover:bg-red-900/50"
            >
              Confirm
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }}
              className="px-2 py-1.5 text-[10px] rounded cursor-pointer text-white/40 hover:text-white/60"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer text-white/15 hover:text-red-400/60 hover:bg-red-900/10 transition-colors opacity-0 group-hover:opacity-100"
            title="Delete from store"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-white/40">{label}</span>
      <span className={`font-semibold text-white/80 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
