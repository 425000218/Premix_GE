import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  breadcrumbs,
  actions,
}) => {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        {breadcrumbs && (
          <nav className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            {breadcrumbs.map((b, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span>/</span>}
                <span className={i === breadcrumbs.length - 1 ? 'text-slate-700 font-medium' : ''}>
                  {b.label}
                </span>
              </React.Fragment>
            ))}
          </nav>
        )}
        <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
      </div>

      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </div>
  );
};
