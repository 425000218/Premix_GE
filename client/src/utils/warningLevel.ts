import { WarningLevel } from '../types';

export interface WarningLevelConfig {
  label: string;
  shortLabel: string;
  bgLight: string;
  textColor: string;
  borderColor: string;
  dotColor: string;
  badgeClasses: string;
}

export const WARNING_LEVEL_MAP: Record<WarningLevel, WarningLevelConfig> = {
  CRITICAL: {
    label: 'Nguy cấp (DOI < 7)',
    shortLabel: 'Nguy cấp',
    bgLight: 'bg-red-50',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
    dotColor: 'bg-red-500',
    badgeClasses: 'bg-red-50 text-red-700 border-red-200 ring-red-600/10',
  },
  WARNING: {
    label: 'Cảnh báo (7 ≤ DOI ≤ 15)',
    shortLabel: 'Cảnh báo',
    bgLight: 'bg-amber-50',
    textColor: 'text-amber-800',
    borderColor: 'border-amber-200',
    dotColor: 'bg-amber-500',
    badgeClasses: 'bg-amber-50 text-amber-800 border-amber-200 ring-amber-600/10',
  },
  BALANCED: {
    label: 'Cân đối (15 < DOI ≤ 75)',
    shortLabel: 'Cân đối',
    bgLight: 'bg-emerald-50',
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-200',
    dotColor: 'bg-emerald-500',
    badgeClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-600/10',
  },
  OVERSTOCK: {
    label: 'Dư thừa (DOI > 75)',
    shortLabel: 'Dư thừa',
    bgLight: 'bg-purple-50',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200',
    dotColor: 'bg-purple-500',
    badgeClasses: 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-600/10',
  },
  NO_DEMAND: {
    label: 'Không có nhu cầu',
    shortLabel: 'Không nhu cầu',
    bgLight: 'bg-slate-100',
    textColor: 'text-slate-600',
    borderColor: 'border-slate-200',
    dotColor: 'bg-slate-400',
    badgeClasses: 'bg-slate-100 text-slate-700 border-slate-200 ring-slate-500/10',
  },
};

export function getWarningLevelConfig(level: WarningLevel): WarningLevelConfig {
  return WARNING_LEVEL_MAP[level] || WARNING_LEVEL_MAP.NO_DEMAND;
}
