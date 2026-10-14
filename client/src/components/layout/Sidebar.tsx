import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  PackageSearch,
  Truck,
  ShoppingCart,
  Lock,
  Database,
  UploadCloud,
  ShieldCheck,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const Sidebar: React.FC = () => {
  const { user } = useAuth();

  const navItems = [
    {
      to: '/dashboard',
      label: 'Tổng quan hệ thống',
      subLabel: 'KPI & Ma trận 6 Nhà máy',
      icon: LayoutDashboard,
    },
    {
      to: '/positions',
      label: 'Vị thế tồn kho',
      subLabel: 'DOI, Dự phóng & Ngưỡng an toàn',
      icon: PackageSearch,
    },
    {
      to: '/delivery-plan',
      label: 'Kế hoạch giao hàng',
      subLabel: 'Lưới tuần & Đối chiếu POR',
      icon: Truck,
    },
    {
      to: '/purchase-requests',
      label: 'Đề nghị mua hàng (PR)',
      subLabel: 'Gợi ý mua & Quản lý PR',
      icon: ShoppingCart,
    },
    {
      to: '/blocks',
      label: 'Quản lý tồn bị khóa',
      subLabel: 'Chặn tồn kho & Kiểm tra SOH',
      icon: Lock,
    },
    {
      to: '/catalog',
      label: 'Danh mục Master Data',
      subLabel: 'Nhà máy, Nguyên liệu, NCC, Ngưỡng',
      icon: Database,
    },
    {
      to: '/import',
      label: 'Nạp dữ liệu ERP',
      subLabel: 'Bộ 5 file ngày chốt & Forecast',
      icon: UploadCloud,
    },
    {
      to: '/roles',
      label: 'Vai trò & Phân quyền',
      subLabel: 'Ma trận 27 quyền & Roles (F01c)',
      icon: ShieldCheck,
    },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 min-h-screen border-r border-slate-800 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800/80 bg-slate-950/40">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-md shadow-emerald-950/50">
          <Layers className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-white text-base tracking-tight">PremixTrack</span>
            <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-sm">V1.0</span>
          </div>
          <p className="text-[10px] text-slate-400 tracking-wider uppercase font-medium">Hệ thống Điều hành Premix</p>
        </div>
      </div>

      {/* Navigation Menu */}
      <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-bold text-slate-300 uppercase tracking-wider">
          Phân hệ tác nghiệp
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all group ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-white' : 'text-slate-400 group-hover:text-emerald-400'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{item.label}</div>
                    <div
                      className={`text-[10px] truncate ${
                        isActive ? 'text-emerald-100' : 'text-slate-400'
                      }`}
                    >
                      {item.subLabel}
                    </div>
                  </div>
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-emerald-200" />}
                </>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* System Status Footer */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/30 text-[11px] text-slate-400">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-300 font-medium">Hệ thống trực tuyến</span>
          </span>
          <span className="font-mono text-[10px] text-slate-300 font-semibold">{user?.roleCode || 'USER'}</span>
        </div>
      </div>
    </aside>
  );
};
