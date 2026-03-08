import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { cloudApi } from '../../api/cloud';
import type { TrackedRole } from '../../types';

interface SyncPanelProps {
  onClose: () => void;
  onSyncComplete?: () => void;
}

interface RoleDiff {
  roleId: string;
  roleName: string;
  sourceId: string;
  currentVersion: string;
  latestVersion: string;
  fields: Array<{
    field: string;
    local: string;
    upstream: string;
  }>;
}

export default function SyncPanel({ onClose, onSyncComplete }: SyncPanelProps) {
  const [trackedRoles, setTrackedRoles] = useState<TrackedRole[]>([]);
  const [diffs, setDiffs] = useState<RoleDiff[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [cloudConnected, setCloudConnected] = useState<boolean | null>(null);

  const checkForUpdates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Get local tracked roles from local API
      const { roles } = await api.getSyncRoles();
      setTrackedRoles(roles);

      const syncableRoles = roles.filter(r => r.source.sync !== 'off');
      if (syncableRoles.length === 0) {
        setDiffs([]);
        setCloudConnected(null);
        return;
      }

      // 2. Check Cloud API for updates
      let cloudAvailable = false;
      try {
        const checkResult = await cloudApi.syncCheck(
          syncableRoles.map(r => ({
            roleId: r.roleId,
            sourceId: r.source.id,
            currentVersion: r.source.upstream_version ?? r.source.forked_at ?? '0.0.0',
          }))
        );
        cloudAvailable = true;
        setCloudConnected(true);

        // 3. For roles with updates, pull full data to compute diffs
        const foundDiffs: RoleDiff[] = [];
        for (const update of checkResult.updates) {
          if (!update.hasUpdate) continue;

          const localRole = syncableRoles.find(r => r.roleId === update.roleId);
          if (!localRole) continue;

          // Pull upstream character data
          const { character } = await cloudApi.syncPull(update.sourceId);

          const fields: RoleDiff['fields'] = [];

          // Compare persona
          if (localRole.persona.trim() !== character.persona.trim()) {
            fields.push({
              field: 'persona',
              local: localRole.persona.slice(0, 120) + (localRole.persona.length > 120 ? '...' : ''),
              upstream: character.persona.slice(0, 120) + (character.persona.length > 120 ? '...' : ''),
            });
          }

          // Compare authority
          const localAut = JSON.stringify(localRole.authority);
          const upstreamAut = JSON.stringify(character.authority);
          if (localAut !== upstreamAut) {
            fields.push({
              field: 'authority',
              local: `${localRole.authority.autonomous.length} autonomous, ${localRole.authority.needsApproval.length} approval`,
              upstream: `${character.authority.autonomous.length} autonomous, ${character.authority.needsApproval.length} approval`,
            });
          }

          if (fields.length > 0) {
            foundDiffs.push({
              roleId: update.roleId,
              roleName: localRole.name,
              sourceId: update.sourceId,
              currentVersion: update.currentVersion,
              latestVersion: update.latestVersion,
              fields,
            });
          }
        }

        setDiffs(foundDiffs);
      } catch {
        // Cloud API unreachable — show warning but don't fail
        setCloudConnected(false);
        setDiffs([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check for updates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  const handleApply = async (diff: RoleDiff) => {
    setApplying(diff.roleId);
    try {
      // Pull latest from Cloud API
      const { character, version } = await cloudApi.syncPull(diff.sourceId);

      // Apply to local role via local API
      await api.applySyncUpdate({
        roleId: diff.roleId,
        changes: {
          persona: character.persona,
          authority: character.authority,
        },
        upstreamVersion: version,
      });

      setApplied(prev => new Set(prev).add(diff.roleId));
      onSyncComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply update');
    } finally {
      setApplying(null);
    }
  };

  return (
    <div style={{ padding: 20, color: 'rgba(255,255,255,0.9)', maxHeight: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Role Sync</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={checkForUpdates}
            disabled={loading}
            style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.7)', borderRadius: 6, padding: '4px 10px', fontSize: 12,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'Checking...' : 'Refresh'}
          </button>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 18 }}
          >×</button>
        </div>
      </div>

      {/* Cloud connection status */}
      {cloudConnected === false && (
        <div style={{ padding: '8px 12px', background: 'rgba(255,180,0,0.1)', borderRadius: 6, color: '#FFB74D', fontSize: 12, marginBottom: 12 }}>
          Cloud API unreachable. Sync requires connection to api.tycono.ai.
        </div>
      )}

      {error && (
        <div style={{ padding: '8px 12px', background: 'rgba(255,100,100,0.1)', borderRadius: 6, color: '#ff6b6b', fontSize: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Tracked Roles Summary */}
      <div style={{
        padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16, fontSize: 13,
      }}>
        <span style={{ color: 'rgba(255,255,255,0.5)' }}>Tracked roles: </span>
        <span style={{ fontWeight: 500 }}>{trackedRoles.length}</span>
        <span style={{ color: 'rgba(255,255,255,0.3)', margin: '0 8px' }}>·</span>
        <span style={{ color: 'rgba(255,255,255,0.5)' }}>Updates available: </span>
        <span style={{ fontWeight: 500, color: diffs.length > 0 ? '#4FC3F7' : 'rgba(255,255,255,0.7)' }}>
          {diffs.filter(d => !applied.has(d.roleId)).length}
        </span>
        {cloudConnected === true && (
          <>
            <span style={{ color: 'rgba(255,255,255,0.3)', margin: '0 8px' }}>·</span>
            <span style={{ fontSize: 11, color: '#81C784' }}>Cloud connected</span>
          </>
        )}
      </div>

      {/* Diffs */}
      {diffs.length === 0 && !loading && (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
          {trackedRoles.length === 0
            ? 'No roles with source tracking. Hire from the Store to enable sync.'
            : 'All roles are up to date!'}
        </div>
      )}

      {diffs.map(diff => (
        <div key={diff.roleId} style={{
          marginBottom: 12, padding: 14, background: 'rgba(255,255,255,0.03)',
          borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{diff.roleName}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                {diff.sourceId} · v{diff.currentVersion} → v{diff.latestVersion}
              </div>
            </div>
            {applied.has(diff.roleId) ? (
              <span style={{ fontSize: 12, color: '#81C784' }}>Applied ✓</span>
            ) : (
              <button
                onClick={() => handleApply(diff)}
                disabled={applying === diff.roleId}
                style={{
                  background: '#1565C0', border: 'none', color: 'white',
                  borderRadius: 6, padding: '5px 12px', fontSize: 12,
                  cursor: applying === diff.roleId ? 'wait' : 'pointer',
                  opacity: applying === diff.roleId ? 0.6 : 1,
                }}
              >
                {applying === diff.roleId ? 'Applying...' : 'Apply Update'}
              </button>
            )}
          </div>

          {/* Field Diffs */}
          {diff.fields.map(f => (
            <div key={f.field} style={{ marginBottom: 6, fontSize: 12 }}>
              <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 2, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
                {f.field}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div style={{ padding: '4px 8px', background: 'rgba(255,100,100,0.08)', borderRadius: 4, color: 'rgba(255,255,255,0.6)' }}>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>LOCAL</span><br />
                  {f.local}
                </div>
                <div style={{ padding: '4px 8px', background: 'rgba(100,255,100,0.08)', borderRadius: 4, color: 'rgba(255,255,255,0.6)' }}>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>UPSTREAM</span><br />
                  {f.upstream}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Untracked Roles Info */}
      {trackedRoles.length > 0 && (
        <div style={{ marginTop: 16, fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
          Roles hired from the Store are tracked automatically.
          Set <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 3 }}>sync: off</code> in role.yaml to stop tracking.
        </div>
      )}
    </div>
  );
}
