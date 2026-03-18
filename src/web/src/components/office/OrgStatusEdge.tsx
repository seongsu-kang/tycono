import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

const ROLE_COLORS: Record<string, string> = {
  cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#7C4DFF', designer: '#E91E63', qa: '#00897B',
  'data-analyst': '#0288D1', 'designer-seek': '#E91E63', test: '#78909C',
};

export interface OrgEdgeData {
  childStatus?: string;
  parentStatus?: string;
  childRoleId?: string;
}

function OrgStatusEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, data } = props;
  const d = (data ?? {}) as OrgEdgeData;

  const [edgePath] = getSmoothStepPath({
    sourceX, sourceY,
    targetX, targetY,
    borderRadius: 16,
  });

  let stroke = 'rgba(180,200,240,0.08)';
  let strokeDasharray = '6 6';
  let animated = false;
  let strokeWidth = 1.5;

  if (d.childStatus === 'done' || d.parentStatus === 'done') {
    stroke = '#4ADE8040';
    strokeDasharray = '';
    strokeWidth = 2;
  } else if (d.childStatus === 'awaiting_input') {
    stroke = '#FBBF2466';
    strokeDasharray = '8 5';
    animated = true;
    strokeWidth = 2;
  } else if (d.childStatus === 'streaming') {
    const roleColor = ROLE_COLORS[d.childRoleId ?? ''] ?? '#60A5FA';
    stroke = roleColor + '55';
    strokeDasharray = '8 5';
    animated = true;
    strokeWidth = 2.2;
  }

  return (
    <BaseEdge
      path={edgePath}
      style={{
        stroke,
        strokeWidth,
        strokeDasharray,
      }}
      className={animated ? 'wave-edge-flow' : undefined}
    />
  );
}

export default memo(OrgStatusEdge);
