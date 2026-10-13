import React from 'react';

interface MetricCardProps {
  title: string;
  valueTons: number | string;
  subValueKg?: number | string;
  unit?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'critical' | 'warning' | 'success' | 'purple';
  trend?: {
    label: string;
    isUp?: boolean;
  };
  onClick?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  valueTons,
  subValueKg,
  unit = 'Tấn',
  icon,
  variant = 'default',
  trend,
  onClick,
}) => {
  const variantStyles = {
    default: {
      border: 'border-slate-200 hover:border-slate-300',
      iconBg: 'bg-slate-100 text-slate-600',
      textColor: 'text-slate-900',
    },
    critical: {
      border: 'border-red-200 bg-red-50/20 hover:border-red-300',
      iconBg: 'bg-red-100 text-red-600',
      textColor: 'text-red-700',
    },
    warning: {
      border: 'border-amber-200 bg-amber-50/20 hover:border-amber-300',
      iconBg: 'bg-amber-100 text-amber-700',
      textColor: 'text-amber-800',
    },
    success: {
      border: 'border-emerald-200 bg-emerald-50/20 hover:border-emerald-300',
      iconBg: 'bg-emerald-100 text-emerald-600',
      textColor: 'text-emerald-700',
    },
    purple: {
      border: 'border-purple-200 bg-purple-50/20 hover:border-purple-300',
      iconBg: 'bg-purple-100 text-purple-600',
      textColor: 'text-purple-700',
    },
  };

  const style = variantStyles[variant];

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl p-5 border shadow-2xs transition-all duration-150 ${style.border} ${
        onClick ? 'cursor-pointer hover:shadow-xs' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</span>
        {icon && (
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${style.iconBg}`}>
            {icon}
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold tracking-tight font-mono ${style.textColor}`}>
          {valueTons}
        </span>
        {unit && <span className="text-xs font-medium text-slate-500">{unit}</span>}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        {subValueKg && (
          <span className="font-mono text-slate-400">
            {subValueKg} kg
          </span>
        )}
        {trend && (
          <span className="font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full text-[11px]">
            {trend.label}
          </span>
        )}
      </div>
    </div>
  );
};
