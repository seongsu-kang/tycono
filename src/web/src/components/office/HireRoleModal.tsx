import { useState, useRef, useEffect, useMemo } from 'react';
import type { CreateRoleInput } from '../../types';
import type { CharacterAppearance } from '../../types/appearance';
import type { SkillExport } from '../../types/store';
import CharacterEditor, { randomAppearance } from './CharacterEditor';
import TopDownCharCanvas from './TopDownCharCanvas';
import { api } from '../../api/client';
import { cloudApi } from '../../api/cloud';

interface Props {
  existingRoles: { id: string; name: string }[];
  onClose: () => void;
  onHire: (input: CreateRoleInput, appearance: CharacterAppearance) => Promise<void>;
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

export default function HireRoleModal({ existingRoles, onClose, onHire }: Props) {
  const [mode, setMode] = useState<'single' | 'bulk' | 'store'>('single');

  /* ─── Store import state ─── */
  const [storeId, setStoreId] = useState('');
  const [storeCharacter, setStoreCharacter] = useState<Record<string, any> | null>(null);
  const [storeFetching, setStoreFetching] = useState(false);
  const [storeError, setStoreError] = useState('');
  const [storeStep, setStoreStep] = useState<'input' | 'review'>('input');
  const [storeName, setStoreName] = useState('');
  const [storeRoleId, setStoreRoleId] = useState('');
  const [storeReportsTo, setStoreReportsTo] = useState('ceo');

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
  }, []);

  useEffect(() => {
    if (mode === 'single') {
      if (step === 1) nameRef.current?.focus();
      if (step === 2) personaRef.current?.focus();
    } else {
      if (bulkStep === 'input') bulkRef.current?.focus();
    }
  }, [step, mode, bulkStep]);

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

  /* ─── Store import handlers ─── */
  const handleStoreFetch = async () => {
    setStoreFetching(true);
    setStoreError('');
    try {
      const cleanId = storeId.replace(/^tycono:/, '').trim();
      if (!cleanId) { setStoreError('Please enter a character ID'); setStoreFetching(false); return; }
      const ch = await cloudApi.getCharacter(cleanId);
      setStoreCharacter(ch);
      setStoreName(ch.name || '');
      setStoreRoleId(slugify(ch.name || cleanId));
      setStoreStep('review');
    } catch {
      setStoreError('Character not found. Check the ID and try again.');
    } finally {
      setStoreFetching(false);
    }
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
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to hire');
      setBusy(false);
    }
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
        if (storeStep === 'input' && storeId.trim()) handleStoreFetch();
        else if (storeStep === 'review') handleStoreHire();
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
                onClick={() => { setMode('store'); setError(''); }}
                className={`px-3 py-1 text-xs font-semibold rounded-md cursor-pointer transition-colors ${mode === 'store' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/70'}`}
              >
                Import
              </button>
            </div>
          </div>
          <div className="text-sm opacity-80 mt-0.5">
            {mode === 'single' ? `Step ${step} of ${TOTAL_STEPS}` : mode === 'bulk' ? (bulkStep === 'input' ? 'Enter roles, one per line' : `Review ${bulkEntries.length} roles`) : (storeStep === 'input' ? 'Import from Tycono Store' : 'Review & customize')}
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
          {mode === 'single' ? (
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
            ) : (
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
            )}
          </div>
        </div>
      </div>
    </>
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
