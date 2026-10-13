import React from 'react';
import { WarningLevel } from '../../types';
import { getWarningLevelConfig } from '../../utils/warningLevel';

interface WarningBadgeProps {
  level: WarningLevel;
  doi?: number | null;
  short?: boolean;
  className?: string;
}

export const WarningBadge: React.FC<WarningBadgeProps> = ({ level, doi, short = false, className = '' }) => {
  const config = getWarningLevelConfig(level);
  const hasDoi = doi !== undefined && doi !== null && !isNaN(Number(doi)) && level !== 'NO_DEMAND';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.badgeClasses} ${className}`}
      title={hasDoi ? `DOI: ${Number(doi).toFixed(1)} ngày - ${config.label}` : config.label}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
      <span>{short ? config.shortLabel : config.label}</span>
      {hasDoi && (
        <span className="opacity-75 font-mono text-[11px]">({Number(doi).toFixed(1)}d)</span>
      )}
    </span>
  );
};
