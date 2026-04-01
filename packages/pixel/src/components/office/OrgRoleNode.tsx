import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { WaveNode } from '../../hooks/useWaveTree';
import { isWaveNodeActive } from '../../types';

const ROLE_COLORS: Record<string, string> = {
  ceo: '#B71C1C',
  cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#7C4DFF', designer: '#E91E63', qa: '#00897B',
  'data-analyst': '#0288D1', 'designer-seek': '#E91E63', test: '#78909C',
};

const ROLE_ICONS: Record<string, string> = {
  ceo: '👑', cto: '⚙️', cbo: '📊', pm: '📋',
  engineer: '🏗️', designer: '🎨', qa: '🔍',
  'data-analyst': '📈', 'designer-seek': '🎨', test: '🧪',
};

export type OrgRoleLevel = 'ceo' | 'c-level' | 'member';

export interface OrgRoleData {
  node: WaveNode;
  roleLevel: OrgRoleLevel;
  isSelected: boolean;
  isChecked: boolean;
  showCheckbox: boolean;
  isEligible: boolean;
  hasActiveChildren: boolean;
}

function statusColor(node: WaveNode): string {
  switch (node.status) {
    case 'streaming': return '#60A5FA';
    case 'awaiting_input': return '#FBBF24';
    case 'done': return '#4ADE80';
    case 'error': return '#F87171';
    case 'not-dispatched': return '#4B5563';
    default: return '#6B7280';
  }
}

function statusLabel(node: WaveNode, hasActiveChildren: boolean): string {
  switch (node.status) {
    case 'streaming': return '● Working...';
    case 'awaiting_input': return '◉ Awaiting Reply';
    case 'done': return hasActiveChildren ? '◎ Supervising' : '✓ Complete';
    case 'error': return '✗ Error';
    case 'waiting': return '○ Waiting';
    default: return '';
  }
}

/** Node dimensions by role level */
const DIMS: Record<OrgRoleLevel, { w: number; h: number }> = {
  ceo:      { w: 120, h: 48 },
  'c-level': { w: 170, h: 64 },
  member:   { w: 156, h: 56 },
};

function OrgRoleNode({ data, id }: NodeProps) {
  const d = data as unknown as OrgRoleData;
  const { node, roleLevel, isSelected, isChecked, showCheckbox, isEligible, hasActiveChildren } = d;
  const roleColor = ROLE_COLORS[node.roleId] ?? '#6B7280';
  const stColor = statusColor(node);
  const active = isWaveNodeActive(node.status);
  const isCeo = roleLevel === 'ceo';
  const dim = DIMS[roleLevel];
  const icon = ROLE_ICONS[node.roleId] ?? '👤';
  const notDispatched = node.status === 'not-dispatched';
  const opacity = isCeo ? (isSelected ? 0.9 : 0.65) : notDispatched && !isChecked ? 0.4 : 1;

  return (
    <div
      className="org-rf-node"
      style={{
        width: dim.w,
        height: dim.h,
        borderRadius: isCeo ? 24 : 12,
        background: isCeo
          ? 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'
          : `linear-gradient(180deg, ${roleColor}10 0%, var(--terminal-bg-deeper, #181825) 40%)`,
        border: isSelected
          ? `2px solid ${roleColor}`
          : isChecked
            ? '2px solid #EF5350'
            : `1px solid ${notDispatched ? '#333' : roleColor + '30'}`,
        borderStyle: notDispatched && !isChecked ? 'dashed' : 'solid',
        cursor: 'pointer',
        opacity,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: active
          ? `0 0 20px ${roleColor}30, 0 4px 12px rgba(0,0,0,0.3)`
          : isSelected
            ? `0 0 12px ${roleColor}20, 0 2px 8px rgba(0,0,0,0.2)`
            : '0 2px 6px rgba(0,0,0,0.15)',
      }}
      /* click handled by ReactFlow onNodeClick */
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1 }} />

      {/* Animated glow ring for active nodes */}
      {active && (
        <div style={{
          position: 'absolute',
          inset: -2,
          borderRadius: isCeo ? 26 : 14,
          border: `2px solid ${stColor}`,
          animation: 'org-rf-glow 2s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      )}

      {/* CEO — distinctive */}
      {isCeo ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 8,
          padding: '0 16px',
        }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>👑</span>
          <span style={{
            fontSize: 13,
            fontWeight: 900,
            color: '#fff',
            fontFamily: 'var(--pixel-font)',
            letterSpacing: 2,
          }}>CEO</span>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: roleLevel === 'c-level' ? '10px 12px' : '8px 10px',
          flex: 1,
        }}>
          {/* Role icon */}
          <div style={{
            width: roleLevel === 'c-level' ? 32 : 28,
            height: roleLevel === 'c-level' ? 32 : 28,
            borderRadius: 8,
            background: `${roleColor}18`,
            border: `1px solid ${roleColor}30`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: roleLevel === 'c-level' ? 16 : 14,
            flexShrink: 0,
          }}>
            {icon}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={{
              fontSize: roleLevel === 'c-level' ? 12 : 11,
              fontWeight: 800,
              color: roleColor,
              fontFamily: 'var(--pixel-font)',
              letterSpacing: 0.5,
              lineHeight: 1.2,
            }}>
              {node.roleId.toUpperCase()}
            </div>
            {node.roleName && node.roleName !== node.roleId && (
              <div style={{
                fontSize: 9,
                color: 'var(--terminal-text-secondary, #aaa)',
                fontFamily: 'var(--pixel-font)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginTop: 1,
              }}>
                {node.roleName}
              </div>
            )}
            <div style={{
              fontSize: 9,
              color: stColor,
              fontFamily: 'var(--pixel-font)',
              fontWeight: 600,
              marginTop: 2,
            }}>
              {statusLabel(node, hasActiveChildren)}
            </div>
          </div>

          {/* Checkbox / status icon */}
          {showCheckbox && !isCeo ? (
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (isEligible) {
                  window.dispatchEvent(new CustomEvent('org-toggle-check', { detail: { roleId: id } }));
                }
              }}
              style={{ cursor: isEligible ? 'pointer' : 'default', opacity: isEligible ? 1 : 0.2, flexShrink: 0 }}
            >
              <div style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                background: isChecked ? '#EF5350' : 'transparent',
                border: `2px solid ${isChecked ? '#EF5350' : '#555'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 700,
                color: '#fff',
                transition: 'all 0.15s',
              }}>
                {isChecked && '\u2713'}
              </div>
            </div>
          ) : !showCheckbox && node.status === 'done' ? (
            <span style={{ fontSize: 14, color: '#4ADE80', flexShrink: 0, fontWeight: 700 }}>{'\u2713'}</span>
          ) : !showCheckbox && node.status === 'error' ? (
            <span style={{ fontSize: 14, color: '#F87171', flexShrink: 0, fontWeight: 700 }}>{'\u2717'}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default memo(OrgRoleNode);
export { DIMS };
