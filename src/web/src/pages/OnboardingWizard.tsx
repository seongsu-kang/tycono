import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api } from '../api/client';
import type { EngineDetection, TeamTemplate, ScaffoldInput, BrowseResult, ImportJob } from '../types';

/* ─── Reusable Folder Browser ─────────── */

function FolderBrowser({ onSelect, onClose }: { onSelect: (path: string) => void; onClose: () => void }) {
  const [data, setData] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(true);

  const browse = useCallback(async (targetPath?: string) => {
    setLoading(true);
    try {
      const result = await api.browse(targetPath);
      setData(result);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { browse(); }, [browse]);

  if (loading && !data) {
    return (
      <div className="mt-3 rounded-lg p-4 text-xs text-center" style={{ background: 'var(--terminal-bg)', border: '1px solid var(--terminal-border)', color: 'var(--terminal-text-muted)' }}>
        Loading...
      </div>
    );
  }

  if (!data) return null;

  return (
    <div
      className="mt-3 rounded-lg overflow-hidden text-xs"
      style={{ background: 'var(--terminal-bg)', border: '1px solid var(--terminal-border)', maxHeight: 220, overflowY: 'auto' }}
    >
      <div
        className="px-3 py-2 flex items-center gap-2 sticky top-0"
        style={{ background: 'var(--terminal-surface)', borderBottom: '1px solid var(--terminal-border)' }}
      >
        <span style={{ color: 'var(--terminal-text-secondary)', fontFamily: 'var(--pixel-font)' }} className="truncate flex-1">
          {data.current}
        </span>
        <button
          onClick={() => onSelect(data.current)}
          className="px-2 py-1 rounded text-[10px] font-medium shrink-0"
          style={{ background: 'var(--active-green)', color: '#fff' }}
        >
          Select
        </button>
        <button
          onClick={onClose}
          className="opacity-50 hover:opacity-100 shrink-0"
          style={{ color: 'var(--terminal-text)' }}
        >
          {'\u2715'}
        </button>
      </div>

      {data.parent && (
        <div
          className="px-3 py-1.5 cursor-pointer flex items-center gap-2 hover:bg-[var(--terminal-surface-light)]"
          style={{ color: 'var(--terminal-text-secondary)' }}
          onClick={() => browse(data.parent!)}
        >
          <span>{'\u2B06\uFE0F'}</span>
          <span>..</span>
        </div>
      )}

      {data.dirs.map(dir => (
        <div
          key={dir.path}
          className="px-3 py-1.5 cursor-pointer flex items-center gap-2 hover:bg-[var(--terminal-surface-light)]"
          style={{ color: 'var(--terminal-text)' }}
          onClick={() => browse(dir.path)}
        >
          <span>{'\uD83D\uDCC1'}</span>
          <span>{dir.name}</span>
        </div>
      ))}

      {data.dirs.length === 0 && (
        <div className="px-3 py-3 text-center" style={{ color: 'var(--terminal-text-muted)' }}>
          No subdirectories
        </div>
      )}
    </div>
  );
}

/* ─── Main Wizard ─────────────────────── */

interface Props {
  onComplete: (importJob?: ImportJob) => void;
}

type EngineChoice = 'claude-cli' | 'direct-api' | 'none';
type ProjectMode = 'fresh' | 'existing';
type KnowledgeMode = 'skip' | 'import' | 'existing-akb';

type StepId = 'engine' | 'company' | 'project' | 'knowledge' | 'team' | 'create';

const STEP_LABELS: Record<StepId, string> = {
  engine: 'AI Engine',
  company: 'Company Info',
  project: 'Project',
  knowledge: 'Knowledge',
  team: 'Team Template',
  create: 'Create',
};

function getStepsForKnowledgeMode(knowledgeMode: KnowledgeMode): StepId[] {
  switch (knowledgeMode) {
    case 'skip':
      return ['engine', 'company', 'project', 'knowledge', 'team', 'create'];
    case 'import':
      return ['engine', 'company', 'project', 'knowledge', 'team', 'create'];
    case 'existing-akb':
      // AKB already has structure — skip company, project, team
      return ['engine', 'knowledge', 'create'];
  }
}

export default function OnboardingWizard({ onComplete }: Props) {
  const [stepIndex, setStepIndex] = useState(0);

  // Step: Engine
  const [engineDetection, setEngineDetection] = useState<EngineDetection | null>(null);
  const [engineChoice, setEngineChoice] = useState<EngineChoice>('none');
  const [apiKey, setApiKey] = useState('');
  const [detectingEngine, setDetectingEngine] = useState(true);

  // Step: Company
  const [companyName, setCompanyName] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState('auto');
  const [location, setLocation] = useState('');
  const [locationBase, setLocationBase] = useState('');
  const [locationEdited, setLocationEdited] = useState(false);
  const [showLocationBrowser, setShowLocationBrowser] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Step: Project (code repo)
  const [projectMode, setProjectMode] = useState<ProjectMode>('fresh');
  const [existingPath, setExistingPath] = useState('');
  const [pathValid, setPathValid] = useState<boolean | null>(null);
  const [pathValidating, setPathValidating] = useState(false);
  const [showProjectBrowser, setShowProjectBrowser] = useState(false);

  // Step: Knowledge (3 modes)
  const [knowledgeMode, setKnowledgeMode] = useState<KnowledgeMode>('skip');
  const [knowledgePaths, setKnowledgePaths] = useState<string[]>([]);
  const [knowledgeInput, setKnowledgeInput] = useState('');
  const [showKnowledgeBrowser, setShowKnowledgeBrowser] = useState(false);
  // existing-akb sub-state
  const [akbPath, setAkbPath] = useState('');
  const [akbPathValid, setAkbPathValid] = useState<boolean | null>(null);
  const [akbPathValidating, setAkbPathValidating] = useState(false);
  const [showAkbBrowser, setShowAkbBrowser] = useState(false);

  // Step: Team
  const [teams, setTeams] = useState<TeamTemplate[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>('startup');

  // Step: Create
  const [scaffolding, setScaffolding] = useState(false);
  const [scaffoldDone, setScaffoldDone] = useState(false);
  const [scaffoldError, setScaffoldError] = useState<string | null>(null);
  const [createdFiles, setCreatedFiles] = useState<string[]>([]);
  const [scaffoldProjectRoot, setScaffoldProjectRoot] = useState<string>('');
  const [connectingAkb, setConnectingAkb] = useState(false);

  // Dynamic steps based on knowledge mode
  const steps = useMemo(() => getStepsForKnowledgeMode(knowledgeMode), [knowledgeMode]);
  const currentStep = steps[stepIndex] ?? 'engine';

  // Detect engine + fetch CWD on mount
  useEffect(() => {
    api.detectEngine().then(result => {
      setEngineDetection(result);
      setEngineChoice(result.recommended);
      setDetectingEngine(false);
    }).catch(() => setDetectingEngine(false));

    api.getTeams().then(setTeams).catch(() => {});

    api.getStatus().then(status => {
      setLocationBase(status.companyRoot || '');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (currentStep === 'company') nameRef.current?.focus();
  }, [currentStep]);

  // Auto-generate location path from company name (unless user manually edited)
  useEffect(() => {
    if (locationEdited || !locationBase) return;
    const slug = companyName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setLocation(slug ? `${locationBase}/${slug}` : locationBase);
  }, [companyName, locationBase, locationEdited]);

  const canNext = (): boolean => {
    switch (currentStep) {
      case 'engine': return engineChoice !== 'none' || apiKey.length > 10;
      case 'company': return companyName.trim().length > 0;
      case 'project': return projectMode === 'fresh' || (projectMode === 'existing' && pathValid === true);
      case 'knowledge': {
        if (knowledgeMode === 'existing-akb') return akbPathValid === true;
        if (knowledgeMode === 'import') return knowledgePaths.length > 0;
        return true; // skip
      }
      case 'team': return true;
      case 'create': return !scaffoldDone;
      default: return false;
    }
  };

  const handleNext = () => {
    if (stepIndex < steps.length - 1 && canNext()) {
      setStepIndex(stepIndex + 1);
    }
    if (currentStep === 'create' && !scaffolding && !connectingAkb) {
      if (knowledgeMode === 'existing-akb') {
        handleConnectAkb();
      } else {
        handleScaffold();
      }
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  };

  // When knowledgeMode changes, clamp stepIndex to valid range
  useEffect(() => {
    const newSteps = getStepsForKnowledgeMode(knowledgeMode);
    if (stepIndex >= newSteps.length) {
      setStepIndex(newSteps.length - 1);
    }
  }, [knowledgeMode, stepIndex]);

  const validatePath = async () => {
    if (!existingPath.trim()) return;
    setPathValidating(true);
    try {
      const result = await api.validatePath(existingPath.trim());
      setPathValid(result.valid);
    } catch {
      setPathValid(false);
    } finally {
      setPathValidating(false);
    }
  };

  const validateAkbPath = async () => {
    if (!akbPath.trim()) return;
    setAkbPathValidating(true);
    try {
      const result = await api.validatePath(akbPath.trim());
      setAkbPathValid(result.valid && (result.hasClaudeMd === true));
    } catch {
      setAkbPathValid(false);
    } finally {
      setAkbPathValidating(false);
    }
  };

  const addKnowledgePath = () => {
    const p = knowledgeInput.trim();
    if (p && !knowledgePaths.includes(p)) {
      setKnowledgePaths([...knowledgePaths, p]);
      setKnowledgeInput('');
    }
  };

  const handleScaffold = async () => {
    setScaffolding(true);
    setScaffoldError(null);
    try {
      const input: ScaffoldInput = {
        companyName: companyName.trim(),
        description: description.trim() || 'An AI-powered organization',
        team: selectedTeam as ScaffoldInput['team'],
        existingProjectPath: projectMode === 'existing' ? existingPath.trim() : undefined,
        knowledgePaths: knowledgeMode === 'import' && knowledgePaths.length > 0 ? knowledgePaths : undefined,
        language: language !== 'auto' ? language : undefined,
        location: location.trim() || undefined,
      };
      if (engineChoice === 'direct-api' || apiKey) {
        input.apiKey = apiKey || undefined;
      }
      const result = await api.scaffold(input);
      setCreatedFiles(result.created);
      setScaffoldProjectRoot(result.projectRoot);
      setScaffoldDone(true);
    } catch (err) {
      setScaffoldError(err instanceof Error ? err.message : 'Scaffold failed');
    } finally {
      setScaffolding(false);
    }
  };

  const handleConnectAkb = async () => {
    setConnectingAkb(true);
    setScaffoldError(null);
    try {
      const result = await api.connectAkb(akbPath.trim());
      if (result.ok) {
        setScaffoldDone(true);
        setCreatedFiles([`Connected to: ${result.companyRoot}`]);
      } else {
        setScaffoldError(result.error || 'Failed to connect');
      }
    } catch (err) {
      setScaffoldError(err instanceof Error ? err.message : 'Connect failed');
    } finally {
      setConnectingAkb(false);
    }
  };

  const handleEnterOffice = () => {
    if (knowledgeMode === 'import' && knowledgePaths.length > 0) {
      onComplete({ paths: knowledgePaths, companyRoot: '' });
    } else {
      onComplete();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canNext()) {
      e.preventDefault();
      handleNext();
    }
  };

  const inputClass = `w-full px-3 py-2 rounded text-sm outline-none transition-colors
    bg-[var(--terminal-bg)] text-[var(--terminal-text)]
    border border-[var(--terminal-border)]
    focus:border-[var(--terminal-border-hover)]
    placeholder:text-[var(--terminal-text-muted)]`;

  const cardClass = (selected: boolean) =>
    `p-4 rounded-lg border-2 cursor-pointer transition-all text-[var(--terminal-text)] ${
      selected
        ? 'border-[var(--accent)] bg-[var(--accent)]/10'
        : 'border-[var(--terminal-border)] bg-[var(--hud-bg-alt)] hover:border-[var(--accent)]/50'
    }`;

  return (
    <div
      className="h-full flex items-center justify-center"
      style={{ background: 'var(--floor-dark)' }}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-xl rounded-xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--hud-bg)', border: '1px solid var(--terminal-border)' }}
      >
        {/* Header */}
        <div
          className="px-6 py-5"
          style={{ background: 'var(--terminal-bg)', borderBottom: '1px solid var(--terminal-border)' }}
        >
          <div className="text-lg font-bold" style={{ color: 'var(--terminal-text)', fontFamily: 'var(--pixel-font)' }}>
            tycono
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--terminal-text-secondary)' }}>
            Build an AI company. Watch them work.
          </div>
          <div className="flex gap-1.5 mt-4">
            {steps.map((id, i) => (
              <div key={id} className="flex-1">
                <div
                  className="h-1 rounded-full transition-colors"
                  style={{ background: i <= stepIndex ? 'var(--accent)' : 'var(--terminal-surface-light)' }}
                />
                <div
                  className="text-[9px] mt-1 truncate"
                  style={{ color: i === stepIndex ? 'var(--terminal-text)' : 'var(--terminal-text-muted)' }}
                >
                  {STEP_LABELS[id]}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 min-h-[280px]">

          {/* ── Step: AI Engine ── */}
          {currentStep === 'engine' && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold" style={{ color: 'var(--terminal-text)' }}>AI Engine Setup</h2>
              {detectingEngine ? (
                <div className="text-sm" style={{ color: 'var(--terminal-text-secondary)' }}>Detecting AI engine...</div>
              ) : (
                <>
                  <div
                    className={cardClass(engineChoice === 'claude-cli')}
                    onClick={() => engineDetection?.claudeCli && setEngineChoice('claude-cli')}
                    style={{ opacity: engineDetection?.claudeCli ? 1 : 0.4 }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{engineDetection?.claudeCli ? '\u2705' : '\u274C'}</span>
                      <div>
                        <div className="font-medium text-sm">Claude Code CLI</div>
                        <div className="text-xs opacity-70">
                          {engineDetection?.claudeCli
                            ? 'Detected! Recommended — zero config needed.'
                            : 'Not installed. Get it at claude.ai/download'}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div
                    className={cardClass(engineChoice === 'direct-api')}
                    onClick={() => setEngineChoice('direct-api')}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{engineDetection?.apiKey ? '\u2705' : '\uD83D\uDD11'}</span>
                      <div className="flex-1">
                        <div className="font-medium text-sm">Anthropic API Key (BYOK)</div>
                        <div className="text-xs opacity-70">
                          {engineDetection?.apiKey ? 'API key found in environment.' : 'Enter your ANTHROPIC_API_KEY'}
                        </div>
                      </div>
                    </div>
                    {engineChoice === 'direct-api' && !engineDetection?.apiKey && (
                      <input
                        type="password"
                        className={`${inputClass} mt-3`}
                        placeholder="sk-ant-..."
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        autoFocus
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Step: Company Info ── */}
          {currentStep === 'company' && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold" style={{ color: 'var(--terminal-text)' }}>Company Info</h2>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--terminal-text-secondary)' }}>Company Name *</label>
                <input ref={nameRef} className={inputClass} placeholder="e.g. Acme Corp" value={companyName} onChange={e => setCompanyName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--terminal-text-secondary)' }}>Description</label>
                <textarea className={`${inputClass} resize-none`} rows={3} placeholder="What does your AI company do?" value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--terminal-text-secondary)' }}>Location</label>
                <div className="flex gap-2">
                  <input
                    className={`${inputClass} flex-1`}
                    placeholder="/path/to/your-company"
                    value={location}
                    onChange={e => { setLocation(e.target.value); setLocationEdited(true); }}
                  />
                  <button
                    onClick={() => setShowLocationBrowser(!showLocationBrowser)}
                    className="px-3 py-2 rounded text-xs font-medium transition-colors shrink-0"
                    style={{ background: 'var(--hud-bg-alt)', color: 'var(--terminal-text)', border: '1px solid var(--terminal-border)' }}
                    title="Browse folders"
                  >
                    {'\uD83D\uDCC1'}
                  </button>
                </div>
                <div className="text-[10px] mt-1" style={{ color: 'var(--terminal-text-muted)' }}>
                  Where your AI company files will be created.
                </div>
                {showLocationBrowser && (
                  <FolderBrowser
                    onSelect={(p) => { setLocation(p); setLocationEdited(true); setShowLocationBrowser(false); }}
                    onClose={() => setShowLocationBrowser(false)}
                  />
                )}
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--terminal-text-secondary)' }}>AI Response Language</label>
                <select className={inputClass} value={language} onChange={e => setLanguage(e.target.value)}>
                  <option value="auto">Auto</option>
                  <option value="en">English</option>
                  <option value="ko">한국어</option>
                  <option value="ja">日本語</option>
                </select>
              </div>
            </div>
          )}

          {/* ── Step: Project (code repo) ── */}
          {currentStep === 'project' && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold" style={{ color: 'var(--terminal-text)' }}>Project Setup</h2>
              <div className={cardClass(projectMode === 'fresh')} onClick={() => { setProjectMode('fresh'); setPathValid(null); }}>
                <div className="font-medium text-sm">{'\uD83C\uDF31'} Start Fresh</div>
                <div className="text-xs opacity-70 mt-1">Create a new AI company from scratch with clean directory structure.</div>
              </div>
              <div className={cardClass(projectMode === 'existing')} onClick={() => setProjectMode('existing')}>
                <div className="font-medium text-sm">{'\uD83D\uDCC2'} Connect Existing Project</div>
                <div className="text-xs opacity-70 mt-1">Add AI company structure to an existing codebase or knowledge base.</div>
                {projectMode === 'existing' && (
                  <div className="mt-3" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-2">
                      <input
                        className={`${inputClass} flex-1`}
                        placeholder="/path/to/your/project"
                        value={existingPath}
                        onChange={e => { setExistingPath(e.target.value); setPathValid(null); }}
                        autoFocus
                      />
                      <button
                        onClick={() => setShowProjectBrowser(!showProjectBrowser)}
                        className="px-3 py-2 rounded text-xs font-medium transition-colors"
                        style={{ background: 'var(--hud-bg-alt)', color: 'var(--terminal-text)' }}
                        title="Browse folders"
                      >
                        {'\uD83D\uDCC1'}
                      </button>
                      <button
                        onClick={validatePath}
                        disabled={pathValidating || !existingPath.trim()}
                        className="px-3 py-2 rounded text-xs font-medium transition-colors"
                        style={{ background: 'var(--accent)', color: '#fff', opacity: pathValidating || !existingPath.trim() ? 0.5 : 1 }}
                      >
                        {pathValidating ? '...' : 'Verify'}
                      </button>
                    </div>
                    {pathValid === true && (
                      <div className="text-xs mt-2" style={{ color: 'var(--active-green)' }}>{'\u2705'} Path verified: {existingPath}</div>
                    )}
                    {pathValid === false && (
                      <div className="text-xs mt-2" style={{ color: '#EF4444' }}>{'\u274C'} Invalid path</div>
                    )}
                    {showProjectBrowser && (
                      <FolderBrowser
                        onSelect={(p) => { setExistingPath(p); setPathValid(true); setShowProjectBrowser(false); }}
                        onClose={() => setShowProjectBrowser(false)}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step: Knowledge (3 modes) ── */}
          {currentStep === 'knowledge' && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold" style={{ color: 'var(--terminal-text)' }}>Knowledge Strategy</h2>
              <p className="text-xs" style={{ color: 'var(--terminal-text-secondary)' }}>
                How should AI handle your knowledge base?
              </p>

              {/* Option 1: Skip */}
              <div className={cardClass(knowledgeMode === 'skip')} onClick={() => setKnowledgeMode('skip')}>
                <div className="font-medium text-sm">{'\uD83C\uDF31'} Start Fresh</div>
                <div className="text-xs opacity-70 mt-1">Empty knowledge base. Add documents later from the office.</div>
              </div>

              {/* Option 2: Import & Build */}
              <div className={cardClass(knowledgeMode === 'import')} onClick={() => setKnowledgeMode('import')}>
                <div className="font-medium text-sm">{'\uD83D\uDCDA'} Import & Build</div>
                <div className="text-xs opacity-70 mt-1">Select folders with documents — AI reads, summarizes, and organizes them.</div>
                {knowledgeMode === 'import' && (
                  <div className="mt-3 space-y-2" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-2">
                      <input
                        className={`${inputClass} flex-1`}
                        placeholder="/path/to/docs"
                        value={knowledgeInput}
                        onChange={e => setKnowledgeInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKnowledgePath(); } }}
                        autoFocus
                      />
                      <button
                        onClick={() => setShowKnowledgeBrowser(!showKnowledgeBrowser)}
                        className="px-3 py-2 rounded text-xs font-medium transition-colors"
                        style={{ background: 'var(--hud-bg-alt)', color: 'var(--terminal-text)' }}
                        title="Browse folders"
                      >
                        {'\uD83D\uDCC1'}
                      </button>
                      <button
                        onClick={addKnowledgePath}
                        disabled={!knowledgeInput.trim()}
                        className="px-3 py-2 rounded text-xs font-medium"
                        style={{ background: 'var(--accent)', color: '#fff', opacity: !knowledgeInput.trim() ? 0.5 : 1 }}
                      >
                        Add
                      </button>
                    </div>
                    {showKnowledgeBrowser && (
                      <FolderBrowser
                        onSelect={(p) => {
                          if (!knowledgePaths.includes(p)) setKnowledgePaths([...knowledgePaths, p]);
                          setShowKnowledgeBrowser(false);
                        }}
                        onClose={() => setShowKnowledgeBrowser(false)}
                      />
                    )}
                    {knowledgePaths.length > 0 && (
                      <div className="space-y-1">
                        {knowledgePaths.map((p, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 px-3 py-1.5 rounded text-xs"
                            style={{ background: 'var(--terminal-bg)', color: 'var(--terminal-text)', border: '1px solid var(--terminal-border)' }}
                          >
                            <span className="flex-1 truncate" style={{ fontFamily: 'var(--pixel-font)' }}>{p}</span>
                            <button onClick={() => setKnowledgePaths(knowledgePaths.filter((_, j) => j !== i))} className="opacity-50 hover:opacity-100">{'\u2715'}</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {knowledgePaths.length === 0 && (
                      <div className="text-[10px] text-center py-2" style={{ color: 'var(--terminal-text-muted)' }}>
                        Add at least one folder to import.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Option 3: Connect Existing AKB */}
              <div className={cardClass(knowledgeMode === 'existing-akb')} onClick={() => setKnowledgeMode('existing-akb')}>
                <div className="font-medium text-sm">{'\uD83D\uDD17'} Connect Existing AKB</div>
                <div className="text-xs opacity-70 mt-1">Connect a directory that already has CLAUDE.md and AKB structure.</div>
                {knowledgeMode === 'existing-akb' && (
                  <div className="mt-3" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-2">
                      <input
                        className={`${inputClass} flex-1`}
                        placeholder="/path/to/your/akb"
                        value={akbPath}
                        onChange={e => { setAkbPath(e.target.value); setAkbPathValid(null); }}
                        autoFocus
                      />
                      <button
                        onClick={() => setShowAkbBrowser(!showAkbBrowser)}
                        className="px-3 py-2 rounded text-xs font-medium transition-colors"
                        style={{ background: 'var(--hud-bg-alt)', color: 'var(--terminal-text)' }}
                        title="Browse folders"
                      >
                        {'\uD83D\uDCC1'}
                      </button>
                      <button
                        onClick={validateAkbPath}
                        disabled={akbPathValidating || !akbPath.trim()}
                        className="px-3 py-2 rounded text-xs font-medium transition-colors"
                        style={{ background: 'var(--accent)', color: '#fff', opacity: akbPathValidating || !akbPath.trim() ? 0.5 : 1 }}
                      >
                        {akbPathValidating ? '...' : 'Verify'}
                      </button>
                    </div>
                    {akbPathValid === true && (
                      <div className="text-xs mt-2" style={{ color: 'var(--active-green)' }}>{'\u2705'} Valid AKB found: {akbPath}</div>
                    )}
                    {akbPathValid === false && (
                      <div className="text-xs mt-2" style={{ color: '#EF4444' }}>{'\u274C'} No valid AKB (CLAUDE.md required)</div>
                    )}
                    {showAkbBrowser && (
                      <FolderBrowser
                        onSelect={(p) => { setAkbPath(p); setAkbPathValid(null); setShowAkbBrowser(false); }}
                        onClose={() => setShowAkbBrowser(false)}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step: Team Template ── */}
          {currentStep === 'team' && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold" style={{ color: 'var(--terminal-text)' }}>Team Template</h2>
              <p className="text-xs" style={{ color: 'var(--terminal-text-secondary)' }}>
                Choose a starting team. You can add or remove roles later.
              </p>
              {teams.map(team => (
                <div key={team.id} className={cardClass(selectedTeam === team.id)} onClick={() => setSelectedTeam(team.id)}>
                  <div className="font-medium text-sm capitalize">{team.id}</div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {team.roles.map(r => (
                      <span key={r.id} className="px-2 py-0.5 rounded text-[10px]" style={{ background: 'var(--terminal-bg)', color: 'var(--terminal-text)', border: '1px solid var(--terminal-border)' }}>
                        {r.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              <div className={cardClass(selectedTeam === 'custom')} onClick={() => setSelectedTeam('custom')}>
                <div className="font-medium text-sm">Custom</div>
                <div className="text-xs opacity-70 mt-1">Start with no pre-built roles. Hire them from the office.</div>
              </div>
            </div>
          )}

          {/* ── Step: Create ── */}
          {currentStep === 'create' && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold" style={{ color: 'var(--terminal-text)' }}>
                {scaffoldDone
                  ? (knowledgeMode === 'existing-akb' ? 'AKB Connected!' : 'Company Created!')
                  : 'Review & Create'}
              </h2>
              {!scaffoldDone && !scaffolding && !connectingAkb && (
                <>
                  <div
                    className="rounded-lg p-4 space-y-2 text-xs"
                    style={{ background: 'var(--terminal-bg)', color: 'var(--terminal-text)', border: '1px solid var(--terminal-border)', fontFamily: 'var(--pixel-font)' }}
                  >
                    {knowledgeMode === 'existing-akb' ? (
                      <>
                        <div><span className="opacity-50">Mode:</span> Connect Existing AKB</div>
                        <div><span className="opacity-50">Path:</span> {akbPath}</div>
                        <div><span className="opacity-50">Engine:</span> {engineChoice === 'claude-cli' ? 'Claude Code CLI' : 'Direct API'}</div>
                      </>
                    ) : (
                      <>
                        <div><span className="opacity-50">Company:</span> {companyName}</div>
                        <div><span className="opacity-50">Location:</span> {location || '(default)'}</div>
                        <div><span className="opacity-50">Engine:</span> {engineChoice === 'claude-cli' ? 'Claude Code CLI' : 'Direct API'}</div>
                        <div><span className="opacity-50">Project:</span> {projectMode === 'fresh' ? 'Start Fresh' : `Existing (${existingPath})`}</div>
                        <div><span className="opacity-50">Knowledge:</span> {knowledgeMode === 'skip' ? 'Fresh (empty)' : `Import ${knowledgePaths.length} source(s)`}</div>
                        <div><span className="opacity-50">Team:</span> {selectedTeam}</div>
                        {knowledgeMode === 'import' && knowledgePaths.length > 0 && (
                          <div className="text-[10px] mt-1" style={{ color: 'var(--idle-amber)' }}>
                            Knowledge import will run in the background after entering the office.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  {scaffoldError && (
                    <div className="text-xs p-3 rounded" style={{ background: 'rgba(220,38,38,0.15)', color: '#f87171' }}>{scaffoldError}</div>
                  )}
                </>
              )}
              {(scaffolding || connectingAkb) && (
                <div className="flex flex-col items-center py-8 gap-3">
                  <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--terminal-border)', borderTopColor: 'var(--accent)' }} />
                  <div className="text-sm" style={{ color: 'var(--terminal-text-secondary)' }}>
                    {connectingAkb ? 'Connecting to AKB...' : 'Scaffolding your company...'}
                  </div>
                </div>
              )}
              {scaffoldDone && (
                <>
                  <div className="text-center py-4 text-4xl">{'\uD83C\uDFE2'}</div>
                  {scaffoldProjectRoot && (
                    <div
                      className="rounded-lg p-3 text-xs"
                      style={{ background: 'var(--terminal-bg)', color: 'var(--terminal-text)', border: '1px solid var(--terminal-border)', fontFamily: 'var(--pixel-font)' }}
                    >
                      <span className="opacity-50">Location:</span> {scaffoldProjectRoot}
                    </div>
                  )}
                  <div
                    className="rounded-lg p-4 text-xs max-h-40 overflow-y-auto"
                    style={{ background: 'var(--terminal-bg)', color: 'var(--terminal-text)', border: '1px solid var(--terminal-border)', fontFamily: 'var(--pixel-font)' }}
                  >
                    {createdFiles.map((f, i) => (
                      <div key={i} className="py-0.5">
                        <span style={{ color: 'var(--active-green)' }}>{'\u2713'}</span> {f}
                      </div>
                    ))}
                  </div>
                  {knowledgeMode === 'import' && knowledgePaths.length > 0 && (
                    <div className="text-xs p-3 rounded" style={{ background: 'var(--accent)', color: '#fff', opacity: 0.9 }}>
                      Knowledge import will start in the background after entering the office.
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex justify-between items-center" style={{ borderTop: '1px solid var(--terminal-border)' }}>
          <div>
            {stepIndex > 0 && !scaffoldDone && (
              <button
                onClick={handleBack}
                className="px-4 py-2 rounded text-sm transition-colors"
                style={{ color: 'var(--terminal-text-secondary)', border: '1px solid var(--terminal-border)' }}
              >
                Back
              </button>
            )}
          </div>
          <div className="text-xs" style={{ color: 'var(--terminal-text-muted)' }}>{stepIndex + 1} / {steps.length}</div>
          <div>
            {scaffoldDone ? (
              <button
                onClick={handleEnterOffice}
                className="px-5 py-2 rounded text-sm font-medium transition-colors"
                style={{ background: 'var(--active-green)', color: '#fff' }}
              >
                Enter Office
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={!canNext() || scaffolding || connectingAkb}
                className="px-5 py-2 rounded text-sm font-medium transition-colors"
                style={{ background: canNext() ? 'var(--accent)' : 'var(--terminal-border)', color: '#fff', opacity: canNext() && !scaffolding && !connectingAkb ? 1 : 0.5 }}
              >
                {currentStep === 'create'
                  ? (scaffolding || connectingAkb
                    ? (connectingAkb ? 'Connecting...' : 'Creating...')
                    : (knowledgeMode === 'existing-akb' ? 'Connect AKB' : 'Create Company'))
                  : 'Next'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
