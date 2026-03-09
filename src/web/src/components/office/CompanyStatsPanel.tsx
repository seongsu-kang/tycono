import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { cloudApi } from '../../api/cloud';
import type { CompanyStats, RoleLevelInfo } from '../../types';

interface CompanyStatsPanelProps {
  onClose: () => void;
}

export default function CompanyStatsPanel({ onClose }: CompanyStatsPanelProps) {
  const [stats, setStats] = useState<CompanyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setSynced] = useState(false);

  useEffect(() => {
    Promise.all([api.getCompanyStats(), api.getPreferences()])
      .then(async ([s, p]) => {
        setStats(s);
        // Auto-sync stats to Cloud (fire-and-forget)
        const prefs = p as { instanceId?: string };
        if (prefs.instanceId) {
          try {
            await cloudApi.syncStats({
              instanceId: prefs.instanceId,
              roleCount: s.company.roleCount,
              totalTokens: s.company.totalTokens,
              rolesData: s.roles.map(r => ({ roleId: r.roleId, name: r.name, tokens: r.totalTokens })),
            });
            setSynced(true);
          } catch { /* silent — Cloud unavailable is fine */ }
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 24, color: 'rgba(255,255,255,0.6)' }}>Loading stats...</div>
    );
  }

  if (error || !stats) {
    return (
      <div style={{ padding: 24, color: '#ff6b6b' }}>
        {error || 'Failed to load stats'}
        <button onClick={onClose} style={{ marginLeft: 12, color: 'rgba(255,255,255,0.6)', background: 'none', border: 'none', cursor: 'pointer' }}>Close</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, color: 'rgba(255,255,255,0.9)', maxHeight: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Company Stats</h3>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 18 }}
        >×</button>
      </div>

      {/* Company Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <StatCard label="Roles" value={String(stats.company.roleCount)} />
        <StatCard label="Avg Level" value={`Lv.${stats.company.avgLevel}`} />
        <StatCard label="Total Tokens" value={stats.company.formattedTokens} />
        <StatCard label="Total Cost" value={`$${stats.company.totalCostUsd.toFixed(2)}`} />
      </div>

      {/* Role Leaderboard */}
      <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1 }}>
        Role Leaderboard
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {stats.roles.map((role, i) => (
          <RoleLevelRow key={role.roleId} role={role} rank={i + 1} />
        ))}
        {stats.roles.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '8px 0' }}>
            No role activity yet. Assign tasks to start leveling up!
          </div>
        )}
      </div>

      {/* Model Usage */}
      {Object.keys(stats.byModel).length > 0 && (
        <>
          <h4 style={{ margin: '20px 0 12px', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Model Usage
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.entries(stats.byModel).map(([model, data]) => (
              <div key={model} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, fontSize: 12,
              }}>
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>{formatModelName(model)}</span>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>${data.costUsd.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: '12px 14px',
      background: 'rgba(255,255,255,0.04)',
      borderRadius: 8,
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function RoleLevelRow({ role, rank }: { role: RoleLevelInfo; rank: number }) {
  const medals = ['🥇', '🥈', '🥉'];
  const medal = rank <= 3 ? medals[rank - 1] : `#${rank}`;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8,
    }}>
      {/* Rank */}
      <span style={{ fontSize: 14, width: 28, textAlign: 'center', flexShrink: 0 }}>{medal}</span>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {role.name}
          </span>
          <span style={{ fontSize: 12, color: getLevelColor(role.level), fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>
            Lv.{role.level}
          </span>
        </div>

        {/* XP Progress Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${role.progress * 100}%`,
              height: '100%',
              background: getLevelColor(role.level),
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }} />
          </div>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
            {role.formattedTokens}
          </span>
        </div>
      </div>
    </div>
  );
}

function getLevelColor(level: number): string {
  if (level >= 9) return '#FFD700';  // Gold
  if (level >= 7) return '#C0A0FF';  // Purple
  if (level >= 5) return '#4FC3F7';  // Blue
  if (level >= 3) return '#81C784';  // Green
  return 'rgba(255,255,255,0.4)';    // Gray
}

function formatModelName(model: string): string {
  if (model.includes('opus')) return 'Opus';
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('haiku')) return 'Haiku';
  return model.split('-').slice(0, 2).join(' ');
}
