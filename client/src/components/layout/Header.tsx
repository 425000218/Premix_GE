import React from 'react';
import { LogOut, User as UserIcon, Building2, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const Header: React.FC = () => {
  const { user, logout, selectedFactory, setSelectedFactory } = useAuth();

  const factories = [
    { code: 'ALL', name: 'Tất cả 6 Nhà máy' },
    { code: 'DN', name: 'Đồng Nai (DN)' },
    { code: 'BD', name: 'Bình Dương (BD)' },
    { code: 'VL2', name: 'Vĩnh Long 2 (VL2)' },
    { code: 'HG', name: 'Hậu Giang (HG)' },
    { code: 'BD1', name: 'Bình Định 1 (BD1)' },
    { code: 'BD2', name: 'Bình Định 2 (BD2)' },
  ];

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between shrink-0 sticky top-0 z-20">
      {/* Left: Factory Scope Switcher */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700">
          <Building2 className="w-4 h-4 text-emerald-600" />
          <span className="text-slate-400">Phạm vi:</span>
          <select
            value={selectedFactory}
            onChange={(e) => setSelectedFactory(e.target.value)}
            className="bg-transparent font-semibold text-slate-900 border-none focus:outline-hidden cursor-pointer"
          >
            {factories.map((f) => (
              <option key={f.code} value={f.code}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 text-[11px] font-medium border border-emerald-200/60">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Chuẩn đơn vị: <strong>Tấn</strong> (nhập & hiển thị) / <strong>Kg</strong> (lưu trữ CSDL)</span>
        </div>
      </div>

      {/* Right: User Profile & Actions */}
      <div className="flex items-center gap-4">
        {/* User Card */}
        <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 font-semibold text-xs">
            {user?.fullName?.charAt(0) || <UserIcon className="w-4 h-4" />}
          </div>
          <div className="hidden sm:block text-left">
            <div className="text-xs font-semibold text-slate-900">{user?.fullName || user?.username}</div>
            <div className="flex items-center gap-1 text-[10px] text-slate-500">
              <Shield className="w-3 h-3 text-emerald-600" />
              <span>{user?.roleName || user?.roleCode}</span>
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={logout}
          title="Đăng xuất"
          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
