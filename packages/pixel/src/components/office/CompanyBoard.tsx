/**
 * CompanyBoard — Preset (Team Package) management modal
 *
 * Two tabs:
 *   Installed — local presets from company/presets/
 *   Browse   — cloud marketplace (api.tycono.ai)
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { cloudApi, type CloudPresetSummary } from '../../api/cloud';

interface PresetSummary {
  id: string;
  name: string;
  description?: string;
  rolesCount: number;
  roles: string[];
  isDefault: boolean;
}

interface PresetDetail {
  spec?: string;
  id: string;
  name: string;
  tagline?: string;
  version: string;
  description?: string;
  author?: { id: string; name: string; verified?: boolean };
  category?: string;
  roles: string[];
  tags?: string[];
  pricing?: { type: string; price: number };
  wave_scoped?: {
    recommended_tasks?: string[];
    avg_wave_duration?: string;
    complexity?: string;
  };
}

interface Props {
  onClose: () => void;
}

type Tab = 'installed' | 'browse';
type View = 'list' | 'detail';

export default function CompanyBoard({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('installed');
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [cloudPresets, setCloudPresets] = useState<CloudPresetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('list');
  const [selectedPreset, setSelectedPreset] = useState<PresetDetail | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [cloudLoaded, setCloudLoaded] = useState(false);

  const loadPresets = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getPresets();
      setPresets(data);
      setError('');
    } catch {
      setError('Failed to load presets');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCloudPresets = useCallback(async () => {
    try {
      setLoading(true);
      const { presets: data } = await cloudApi.getCloudPresets({ sort: 'popular' });
      setCloudPresets(data);
      setCloudLoaded(true);
      setError('');
    } catch {
      setError('Marketplace unavailable — check your connection');
      setCloudPresets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPresets(); }, [loadPresets]);

  useEffect(() => {
    if (tab === 'browse' && !cloudLoaded) {
      loadCloudPresets();
    }
  }, [tab, cloudLoaded, loadCloudPresets]);

  const handleViewDetail = async (id: string, source: 'local' | 'cloud') => {
    try {
      if (source === 'local') {
        const detail = await api.getPreset(id) as unknown as PresetDetail;
        setSelectedPreset(detail);
      } else {
        const detail = await cloudApi.getCloudPreset(id) as unknown as PresetDetail;
        setSelectedPreset(detail);
      }
      setView('detail');
    } catch {
      setError(`Failed to load preset: ${id}`);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm(`Remove preset "${id}"?`)) return;
    try {
      setRemoving(id);
      await api.removePreset(id);
      await loadPresets();
      if (view === 'detail' && selectedPreset?.id === id) {
        setView('list');
        setSelectedPreset(null);
      }
    } catch (err) {
      setError(`Failed to remove: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setRemoving(null);
    }
  };

  const handleInstallFromCloud = async (preset: CloudPresetSummary) => {
    try {
      setInstalling(preset.id);
      // Install preset locally via local API
      await api.installPreset(preset.id, {
        spec: 'preset/v1',
        id: preset.id,
        name: preset.name,
        version: preset.version,
        description: preset.description,
        tagline: preset.tagline,
        author: preset.author,
        category: preset.category,
        roles: preset.roles,
        tags: preset.tags,
        pricing: preset.pricing,
        wave_scoped: preset.wave_scoped,
      });
      // Track install on cloud
      try { await cloudApi.trackPresetInstall(preset.id); } catch { /* non-critical */ }
      await loadPresets();
      setError('');
      // Switch to installed tab
      setTab('installed');
    } catch (err) {
      setError(`Install failed: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setInstalling(null);
    }
  };

  const installedIds = new Set(presets.map(p => p.id));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (view === 'detail') {
        setView('list');
        setSelectedPreset(null);
      } else {
        onClose();
      }
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60] backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] max-h-[85vh] z-[61] bg-[var(--wall)] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="p-5 text-white" style={{ background: 'linear-gradient(135deg, #1565C0, #1E88E5)' }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-bold">
                {view === 'detail' ? selectedPreset?.name ?? 'Preset' : 'Team Presets'}
              </div>
              <div className="text-xs text-white/60">
                {view === 'detail'
                  ? selectedPreset?.tagline ?? ''
                  : 'Manage team packages for your waves'}
              </div>
            </div>
            <div className="flex gap-2">
              {view === 'detail' && (
                <button
                  onClick={() => { setView('list'); setSelectedPreset(null); }}
                  className="w-8 h-8 rounded-lg bg-white/20 text-white hover:bg-white/30 cursor-pointer flex items-center justify-center"
                >
                  ←
                </button>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-white/20 text-white hover:bg-white/30 cursor-pointer flex items-center justify-center"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Tabs */}
          {view === 'list' && (
            <div className="flex mt-3 bg-black/20 rounded-lg p-0.5">
              <button
                onClick={() => setTab('installed')}
                className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${tab === 'installed' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/70'}`}
              >
                Installed ({presets.length})
              </button>
              <button
                onClick={() => setTab('browse')}
                className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${tab === 'browse' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/70'}`}
              >
                Browse Marketplace
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {error && (
            <div className="text-red-400 text-sm mb-3 p-2 bg-red-500/10 rounded-lg">{error}</div>
          )}

          {loading ? (
            <div className="text-center text-[var(--text-secondary)] py-8">Loading...</div>
          ) : view === 'detail' && selectedPreset ? (
            <PresetDetailView
              preset={selectedPreset}
              isInstalled={installedIds.has(selectedPreset.id)}
              onRemove={handleRemove}
              removing={removing}
            />
          ) : tab === 'installed' ? (
            <PresetList
              presets={presets}
              removing={removing}
              onView={(id) => handleViewDetail(id, 'local')}
              onRemove={handleRemove}
            />
          ) : (
            <CloudPresetList
              presets={cloudPresets}
              installedIds={installedIds}
              installing={installing}
              onView={(id) => handleViewDetail(id, 'cloud')}
              onInstall={handleInstallFromCloud}
            />
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Installed Preset List ─── */

function PresetList({
  presets, removing, onView, onRemove,
}: {
  presets: PresetSummary[];
  removing: string | null;
  onView: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (presets.length === 0) {
    return (
      <div className="text-center text-[var(--text-secondary)] py-8">
        <div className="text-2xl mb-2">📦</div>
        <div>No presets installed yet.</div>
        <div className="text-xs mt-1">Browse the marketplace to find team packages.</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {presets.map(p => (
        <div
          key={p.id}
          className="flex items-center gap-3 p-3 rounded-xl bg-black/10 hover:bg-black/20 cursor-pointer transition-colors"
          onClick={() => onView(p.id)}
        >
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-lg shrink-0">
            {p.isDefault ? '🏠' : '📦'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[var(--text-primary)] text-sm">{p.name}</span>
              {p.isDefault && (
                <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded-full">default</span>
              )}
            </div>
            <div className="text-xs text-[var(--text-secondary)] truncate">
              {p.description || `${p.rolesCount} roles: ${p.roles.join(', ')}`}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs text-[var(--text-secondary)]">{p.rolesCount} roles</span>
            {!p.isDefault && (
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(p.id); }}
                disabled={removing === p.id}
                className="w-7 h-7 rounded-lg text-red-400 hover:bg-red-500/20 cursor-pointer flex items-center justify-center text-xs disabled:opacity-50"
              >
                {removing === p.id ? '...' : '🗑'}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Cloud Marketplace List ─── */

function CloudPresetList({
  presets, installedIds, installing, onView, onInstall,
}: {
  presets: CloudPresetSummary[];
  installedIds: Set<string>;
  installing: string | null;
  onView: (id: string) => void;
  onInstall: (preset: CloudPresetSummary) => void;
}) {
  if (presets.length === 0) {
    return (
      <div className="text-center text-[var(--text-secondary)] py-8">
        <div className="text-2xl mb-2">🌐</div>
        <div>No presets available yet.</div>
        <div className="text-xs mt-1">Check back later or publish your own!</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {presets.map(p => {
        const isInstalled = installedIds.has(p.id);
        return (
          <div
            key={p.id}
            className="flex items-center gap-3 p-3 rounded-xl bg-black/10 hover:bg-black/20 cursor-pointer transition-colors"
            onClick={() => onView(p.id)}
          >
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center text-lg shrink-0">
              🌐
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--text-primary)] text-sm">{p.name}</span>
                {p.author?.verified && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded-full">official</span>
                )}
                {isInstalled && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded-full">installed</span>
                )}
              </div>
              <div className="text-xs text-[var(--text-secondary)] truncate">
                {p.description || p.tagline || `${p.roles?.length ?? 0} roles`}
              </div>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-[var(--text-secondary)]">
                <span>▲ {p.vote_score}</span>
                <span>{p.installs ?? 0} installs</span>
                {p.roles && <span>{p.roles.length} roles</span>}
              </div>
            </div>
            <div className="shrink-0">
              {isInstalled ? (
                <span className="text-xs text-green-400">✓</span>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onInstall(p); }}
                  disabled={installing === p.id}
                  className="px-3 py-1.5 text-xs rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 cursor-pointer disabled:opacity-50"
                >
                  {installing === p.id ? '...' : 'Install'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Preset Detail View ─── */

function PresetDetailView({
  preset, isInstalled, onRemove, removing,
}: {
  preset: PresetDetail;
  isInstalled: boolean;
  onRemove: (id: string) => void;
  removing: string | null;
}) {
  const isDefault = preset.id === 'default';

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-black/10">
        {preset.description && (
          <p className="text-sm text-[var(--text-secondary)] mb-3 whitespace-pre-line">{preset.description}</p>
        )}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[var(--text-secondary)]">Version: </span>
            <span className="text-[var(--text-primary)]">{preset.version}</span>
          </div>
          {preset.category && (
            <div>
              <span className="text-[var(--text-secondary)]">Category: </span>
              <span className="text-[var(--text-primary)]">{preset.category}</span>
            </div>
          )}
          {preset.author && (
            <div>
              <span className="text-[var(--text-secondary)]">Author: </span>
              <span className="text-[var(--text-primary)]">
                {preset.author.name}{preset.author.verified && ' ✓'}
              </span>
            </div>
          )}
          {preset.pricing && (
            <div>
              <span className="text-[var(--text-secondary)]">Price: </span>
              <span className="text-[var(--text-primary)]">
                {preset.pricing.price === 0 ? 'Free' : `$${preset.pricing.price}`}
              </span>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          Roles ({preset.roles.length})
        </div>
        <div className="flex flex-wrap gap-1.5">
          {preset.roles.map(r => (
            <span key={r} className="px-2.5 py-1 text-xs rounded-lg bg-blue-500/15 text-blue-300">{r}</span>
          ))}
        </div>
      </div>

      {preset.wave_scoped?.recommended_tasks && preset.wave_scoped.recommended_tasks.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
            Recommended Tasks
          </div>
          <div className="space-y-1">
            {preset.wave_scoped.recommended_tasks.map((task, i) => (
              <div key={i} className="text-xs text-[var(--text-primary)] flex gap-2">
                <span className="text-[var(--text-secondary)]">→</span>{task}
              </div>
            ))}
          </div>
        </div>
      )}

      {preset.tags && preset.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {preset.tags.map(t => (
            <span key={t} className="px-2 py-0.5 text-[10px] rounded-full bg-white/5 text-[var(--text-secondary)]">#{t}</span>
          ))}
        </div>
      )}

      {!isDefault && isInstalled && (
        <div className="pt-2 border-t border-white/5">
          <button
            onClick={() => onRemove(preset.id)}
            disabled={removing === preset.id}
            className="px-4 py-2 text-sm rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 cursor-pointer disabled:opacity-50"
          >
            {removing === preset.id ? 'Removing...' : 'Remove Preset'}
          </button>
        </div>
      )}
    </div>
  );
}
