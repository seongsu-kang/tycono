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
type WorkspaceMode = 'new' | 'existing-akb';

type StepId = 'engine' | 'company' | 'workspace' | 'team' | 'create';

const STEP_LABELS: Record<StepId, string> = {
  engine: 'AI Engine',
  company: 'Company',
  workspace: 'Workspace',
  team: 'Team',
  create: 'Create',
};

function getSteps(workspaceMode: WorkspaceMode): StepId[] {
  if (workspaceMode === 'existing-akb') {
    return ['engine', 'workspace', 'create'];
  }
  return ['engine', 'company', 'workspace', 'team', 'create'];
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
  const nameRef = useRef<HTMLInputElement>(null);

  // Step: Workspace
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('new');
  // Location (company_root)
  const [location, setLocation] = useState('');
  const [locationBase, setLocationBase] = useState('');
  const [locationEdited, setLocationEdited] = useState(false);
  const [showLocationBrowser, setShowLocationBrowser] = useState(false);
  // Code repo (optional)
  const [showCodeRepo, setShowCodeRepo] = useState(false);
  const [codeRootPath, setCodeRootPath] = useState('');
  const [showCodeRootBrowser, setShowCodeRootBrowser] = useState(false);
  // Knowledge import (optional)
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [knowledgePaths, setKnowledgePaths] = useState<string[]>([]);
  const [knowledgeInput, setKnowledgeInput] = useState('');
  const [showKnowledgeBrowser, setShowKnowledgeBrowser] = useState(false);
  // Existing AKB
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

  // Tool installation
  const [installingTools, setInstallingTools] = useState(false);
  const [toolLogs, setToolLogs] = useState<Array<{ event: string; tool: string; detail?: string }>>([]);

  // Dynamic steps
  const steps = useMemo(() => getSteps(workspaceMode), [workspaceMode]);
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

  // Auto-generate location from company name
  useEffect(() => {
    if (locationEdited || !locationBase) return;
    const slug = companyName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setLocation(slug ? `${locationBase}/${slug}` : locationBase);
  }, [companyName, locationBase, locationEdited]);

  const canNext = (): boolean => {
    switch (currentStep) {
      case 'engine': return engineChoice !== 'none' || apiKey.length > 10;
      case 'company': return companyName.trim().length > 0;
      case 'workspace': {
        if (workspaceMode === 'existing-akb') return akbPathValid === true;
        return true; // location auto-fills; code repo & knowledge are optional
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
      if (workspaceMode === 'existing-akb') {
        handleConnectAkb();
      } else {
        handleScaffold();
      }
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  };

  // When workspace mode changes (not on mount), navigate to workspace step
  const workspaceModeRef = useRef(workspaceMode);
  useEffect(() => {
    if (workspaceModeRef.current === workspaceMode) return; // skip mount
    workspaceModeRef.current = workspaceMode;
    const newSteps = getSteps(workspaceMode);
    const wsIdx = newSteps.indexOf('workspace');
    if (wsIdx >= 0) {
      setStepIndex(wsIdx);
    }
  }, [workspaceMode]);

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

  const handleInstallTools = async (team: string) => {
    setInstallingTools(true);
    setToolLogs([]);
    try {
      const { tools } = await api.getRequiredTools(team);
      const pending = tools.filter(t => !t.installed);
      if (pending.length === 0) {
        setInstallingTools(false);
        return;
      }

      await api.installTools(team, (event, data) => {
        const tool = (data.tool as string) || '';
        if (event === 'checking') {
          setToolLogs(prev => [...prev, { event, tool, detail: 'checking...' }]);
        } else if (event === 'installing') {
          setToolLogs(prev => [...prev, { event, tool, detail: 'installing...' }]);
        } else if (event === 'installed') {
          setToolLogs(prev => [...prev, { event, tool, detail: 'installed' }]);
        } else if (event === 'skipped') {
          setToolLogs(prev => [...prev, { event, tool, detail: (data.reason as string) || 'skipped' }]);
        } else if (event === 'error') {
          setToolLogs(prev => [...prev, { event, tool, detail: (data.error as string) || 'failed' }]);
        }
      });
    } catch {
      // Tool install failure is non-blocking
    } finally {
      setInstallingTools(false);
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
        knowledgePaths: knowledgePaths.length > 0 ? knowledgePaths : undefined,
        language: language !== 'auto' ? language : undefined,
        location: location.trim() || undefined,
        codeRoot: codeRootPath.trim() || undefined,
      };
      if (engineChoice === 'direct-api' || apiKey) {
        input.apiKey = apiKey || undefined;
      }
      const result = await api.scaffold(input);
      setCreatedFiles(result.created);
      setScaffoldProjectRoot(result.projectRoot);
      setScaffoldDone(true);
      setScaffolding(false);

      if (selectedTeam !== 'custom') {
        handleInstallTools(selectedTeam);
      }
    } catch (err) {
      setScaffoldError(err instanceof Error ? err.message : 'Scaffold failed');
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
    if (knowledgePaths.length > 0) {
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
        <div className="px-6 py-5 min-h-[280px] max-h-[480px] overflow-y-auto">

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

          {/* ── Step: Company ── */}
          {currentStep === 'company' && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold" style={{ color: 'var(--terminal-text)' }}>Company</h2>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--terminal-text-secondary)' }}>Company Name *</label>
                <input ref={nameRef} className={inputClass} placeholder="e.g. Acme Corp" value={companyName} onChange={e => setCompanyName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--terminal-text-secondary)' }}>Description</label>
                <textarea className={`${inputClass} resize-none`} rows={3} placeholder="What does your AI company do?" value={description} onChange={e => setDescription(e.target.value)} />
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

          {/* ── Step: Workspace ── */}
          {currentStep === 'workspace' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold" style={{ color: 'var(--terminal-text)' }}>Workspace</h2>
                <HelpTip text={'"New Company" creates a fresh workspace with roles, knowledge base, and project structure.\n\n"Connect Existing" links to an existing Tycono workspace you\'ve set up before.'} />
              </div>

              {/* Mode toggle */}
              <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--terminal-border)' }}>
                <button
                  className="flex-1 px-3 py-2 text-xs font-medium transition-colors"
                  style={{
                    background: workspaceMode === 'new' ? 'var(--accent)' : 'var(--hud-bg-alt)',
                    color: workspaceMode === 'new' ? '#fff' : 'var(--terminal-text-muted)',
                  }}
                  onClick={() => setWorkspaceMode('new')}
                >
                  New Company
                </button>
                <button
                  className="flex-1 px-3 py-2 text-xs font-medium transition-colors"
                  style={{
                    background: workspaceMode === 'existing-akb' ? 'var(--accent)' : 'var(--hud-bg-alt)',
                    color: workspaceMode === 'existing-akb' ? '#fff' : 'var(--terminal-text-muted)',
                    borderLeft: '1px solid var(--terminal-border)',
                  }}
                  onClick={() => setWorkspaceMode('existing-akb')}
                >
                  Connect Existing
                </button>
              </div>

              {workspaceMode === 'new' ? (
                <div className="space-y-3">
                  {/* Section 1: Company Location (required) */}
                  <WorkspaceSection icon={'\uD83D\uDCC1'} title="Company Location" hint="Where your AI company files will be created." help="Roles, knowledge, decisions, and project files are stored here. This is your AI company's home directory. Auto-generated from your company name — change it if needed.">
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
                    {showLocationBrowser && (
                      <FolderBrowser
                        onSelect={(p) => { setLocation(p); setLocationEdited(true); setShowLocationBrowser(false); }}
                        onClose={() => setShowLocationBrowser(false)}
                      />
                    )}
                  </WorkspaceSection>

                  {/* Section 2: Code Repository (optional, collapsible) */}
                  <CollapsibleSection
                    icon={'\uD83D\uDCBB'}
                    title="Code Repository"
                    hint="Connect a separate code repo."
                    help={"Link your existing code repo so AI roles can read and write code there.\n\nSkip this if you don't have a codebase yet — you can connect one later from Settings."}
                    tag="optional"
                    open={showCodeRepo}
                    onToggle={() => setShowCodeRepo(!showCodeRepo)}
                  >
                    <div className="flex gap-2">
                      <input
                        className={`${inputClass} flex-1`}
                        placeholder="/path/to/code/repo"
                        value={codeRootPath}
                        onChange={e => setCodeRootPath(e.target.value)}
                      />
                      <button
                        onClick={() => setShowCodeRootBrowser(!showCodeRootBrowser)}
                        className="px-3 py-2 rounded text-xs font-medium transition-colors shrink-0"
                        style={{ background: 'var(--hud-bg-alt)', color: 'var(--terminal-text)', border: '1px solid var(--terminal-border)' }}
                        title="Browse folders"
                      >
                        {'\uD83D\uDCC1'}
                      </button>
                    </div>
                    {showCodeRootBrowser && (
                      <FolderBrowser
                        onSelect={(p) => { setCodeRootPath(p); setShowCodeRootBrowser(false); }}
                        onClose={() => setShowCodeRootBrowser(false)}
                      />
                    )}
                  </CollapsibleSection>

                  {/* Section 3: Knowledge Import (optional, collapsible) */}
                  <CollapsibleSection
                    icon={'\uD83D\uDCDA'}
                    title="Knowledge Import"
                    hint="Import existing documents into knowledge base."
                    help={"Point to folders with docs (.md, .txt, etc.) — AI will read, summarize, and organize them into a searchable knowledge base.\n\nSkip this to start with an empty knowledge base. You can import documents anytime from the office."}
                    tag="optional"
                    open={showKnowledge}
                    onToggle={() => setShowKnowledge(!showKnowledge)}
                  >
                    <div className="flex gap-2">
                      <input
                        className={`${inputClass} flex-1`}
                        placeholder="/path/to/docs"
                        value={knowledgeInput}
                        onChange={e => setKnowledgeInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKnowledgePath(); } }}
                      />
                      <button
                        onClick={() => setShowKnowledgeBrowser(!showKnowledgeBrowser)}
                        className="px-3 py-2 rounded text-xs font-medium transition-colors shrink-0"
                        style={{ background: 'var(--hud-bg-alt)', color: 'var(--terminal-text)', border: '1px solid var(--terminal-border)' }}
                        title="Browse folders"
                      >
                        {'\uD83D\uDCC1'}
                      </button>
                      <button
                        onClick={addKnowledgePath}
                        disabled={!knowledgeInput.trim()}
                        className="px-3 py-2 rounded text-xs font-medium shrink-0"
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
                      <div className="space-y-1 mt-2">
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
                  </CollapsibleSection>
                </div>
              ) : (
                /* Existing AKB mode */
                <div className="space-y-3">
                  <WorkspaceSection icon={'\uD83D\uDD17'} title="AKB Path" hint="Directory with existing CLAUDE.md and AKB structure." help="Connect to a directory that was previously set up with Tycono. It must contain a CLAUDE.md file. All existing roles, knowledge, and settings will be loaded.">
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
                        className="px-3 py-2 rounded text-xs font-medium transition-colors shrink-0"
                        style={{ background: 'var(--hud-bg-alt)', color: 'var(--terminal-text)', border: '1px solid var(--terminal-border)' }}
                        title="Browse folders"
                      >
                        {'\uD83D\uDCC1'}
                      </button>
                      <button
                        onClick={validateAkbPath}
                        disabled={akbPathValidating || !akbPath.trim()}
                        className="px-3 py-2 rounded text-xs font-medium transition-colors shrink-0"
                        style={{ background: 'var(--accent)', color: '#fff', opacity: akbPathValidating || !akbPath.trim() ? 0.5 : 1 }}
                      >
                        {akbPathValidating ? '...' : 'Verify'}
                      </button>
                    </div>
                    {akbPathValid === true && (
                      <div className="text-xs mt-2" style={{ color: 'var(--active-green)' }}>{'\u2705'} Valid AKB found</div>
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
                  </WorkspaceSection>
                </div>
              )}
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
                  ? (workspaceMode === 'existing-akb' ? 'AKB Connected!' : 'Company Created!')
                  : 'Review & Create'}
              </h2>
              {!scaffoldDone && !scaffolding && !connectingAkb && (
                <>
                  <div
                    className="rounded-lg p-4 space-y-2 text-xs"
                    style={{ background: 'var(--terminal-bg)', color: 'var(--terminal-text)', border: '1px solid var(--terminal-border)', fontFamily: 'var(--pixel-font)' }}
                  >
                    {workspaceMode === 'existing-akb' ? (
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
                        {codeRootPath.trim() && <div><span className="opacity-50">Code Repo:</span> {codeRootPath}</div>}
                        <div><span className="opacity-50">Knowledge:</span> {knowledgePaths.length > 0 ? `Import ${knowledgePaths.length} source(s)` : 'Fresh (empty)'}</div>
                        <div><span className="opacity-50">Team:</span> {selectedTeam}</div>
                        {knowledgePaths.length > 0 && (
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
                  {(installingTools || toolLogs.length > 0) && (
                    <div
                      className="rounded-lg p-4 text-xs space-y-1"
                      style={{ background: 'var(--terminal-bg)', color: 'var(--terminal-text)', border: '1px solid var(--terminal-border)', fontFamily: 'var(--pixel-font)' }}
                    >
                      <div className="font-medium mb-2" style={{ color: 'var(--terminal-text-secondary)' }}>
                        {installingTools ? 'Installing skill tools...' : 'Skill tools'}
                      </div>
                      {toolLogs.map((log, i) => (
                        <div key={i} className="py-0.5 flex items-center gap-2">
                          <span style={{ color: log.event === 'installed' || log.event === 'skipped' ? 'var(--active-green)' : log.event === 'error' ? '#f87171' : 'var(--terminal-text-muted)' }}>
                            {log.event === 'installed' ? '\u2713' : log.event === 'skipped' ? '\u2713' : log.event === 'error' ? '\u2717' : '\u2026'}
                          </span>
                          <span>{log.tool}</span>
                          <span style={{ color: 'var(--terminal-text-muted)' }}>{log.detail}</span>
                        </div>
                      ))}
                      {installingTools && (
                        <div className="flex items-center gap-2 mt-1" style={{ color: 'var(--terminal-text-muted)' }}>
                          <div className="w-3 h-3 border border-current rounded-full animate-spin" style={{ borderTopColor: 'var(--accent)' }} />
                          <span>Please wait...</span>
                        </div>
                      )}
                    </div>
                  )}
                  {knowledgePaths.length > 0 && (
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
                disabled={installingTools}
                className="px-5 py-2 rounded text-sm font-medium transition-colors"
                style={{ background: 'var(--active-green)', color: '#fff', opacity: installingTools ? 0.5 : 1 }}
              >
                {installingTools ? 'Setting up tools...' : 'Enter Office'}
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
                    : (workspaceMode === 'existing-akb' ? 'Connect AKB' : 'Create Company'))
                  : 'Next'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Helper Components ────────────────── */

function HelpTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLSpanElement>(null);

  const handleShow = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: rect.left });
    }
    setShow(true);
  };

  return (
    <span className="inline-flex" ref={ref}>
      <span
        className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center cursor-help shrink-0 select-none"
        style={{ background: 'var(--terminal-surface)', color: 'var(--terminal-text-muted)', border: '1px solid var(--terminal-border)' }}
        onMouseEnter={handleShow}
        onMouseLeave={() => setShow(false)}
        onClick={(e) => { e.stopPropagation(); show ? setShow(false) : handleShow(); }}
      >
        ?
      </span>
      {show && (
        <div
          className="fixed z-[9999] px-3 py-2 rounded-lg text-[11px] leading-relaxed whitespace-pre-line w-60 shadow-lg pointer-events-none"
          style={{ top: pos.top, left: Math.min(pos.left, window.innerWidth - 260), background: 'var(--terminal-bg)', color: 'var(--terminal-text-secondary)', border: '1px solid var(--terminal-border)' }}
        >
          <div
            className="absolute bottom-full w-0 h-0"
            style={{ left: 8, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '5px solid var(--terminal-border)' }}
          />
          {text}
        </div>
      )}
    </span>
  );
}

function WorkspaceSection({ icon, title, hint, help, children }: { icon: string; title: string; hint: string; help?: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg p-3 space-y-2"
      style={{ background: 'var(--hud-bg-alt)', border: '1px solid var(--terminal-border)' }}
    >
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <span className="text-xs font-medium" style={{ color: 'var(--terminal-text)' }}>{title}</span>
          {help && <HelpTip text={help} />}
        </div>
        <div className="text-[10px] mt-0.5 ml-6" style={{ color: 'var(--terminal-text-muted)' }}>{hint}</div>
      </div>
      {children}
    </div>
  );
}

function CollapsibleSection({ icon, title, hint, help, tag, open, onToggle, children }: {
  icon: string; title: string; hint: string; help?: string; tag?: string;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg"
      style={{ background: 'var(--hud-bg-alt)', border: '1px solid var(--terminal-border)' }}
    >
      <div
        className="p-3 cursor-pointer flex items-center gap-2 hover:bg-[var(--terminal-surface-light)] transition-colors"
        onClick={onToggle}
      >
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-medium flex-1" style={{ color: 'var(--terminal-text)' }}>{title}</span>
        {help && <HelpTip text={help} />}
        {tag && (
          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'var(--terminal-surface)', color: 'var(--terminal-text-muted)' }}>
            {tag}
          </span>
        )}
        <span className="text-[10px]" style={{ color: 'var(--terminal-text-muted)' }}>{open ? '\u25B2' : '\u25BC'}</span>
      </div>
      {!open && (
        <div className="px-3 pb-2 -mt-1">
          <div className="text-[10px] ml-6" style={{ color: 'var(--terminal-text-muted)' }}>{hint}</div>
        </div>
      )}
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}
