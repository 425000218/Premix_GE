import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Lock, User as UserIcon, AlertCircle, ArrowRight } from 'lucide-react';
import { authApi } from '../api/auth.api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/common/Button';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Admin@1234');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMessage('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await authApi.login({ username, password });
      login(res.token, res.user);
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.response?.status === 429) {
        setErrorMessage(
          err.response?.data?.message || 'IP tạm thời bị khóa do đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.'
        );
      } else if (err.response?.data?.message) {
        setErrorMessage(err.response.data.message);
      } else {
        setErrorMessage('Tên đăng nhập hoặc mật khẩu không chính xác.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickFill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand Banner */}
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 items-center justify-center text-white shadow-xl shadow-emerald-950/60 mb-3">
            <Layers className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">PremixTrack</h1>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-medium">
            Hệ thống Quản lý Tồn kho & Đặt hàng Premix Công nghiệp
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 p-8">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-900">Đăng nhập hệ thống</h2>
            <p className="text-xs text-slate-500 mt-0.5">Vui lòng nhập tài khoản được cấp quyền để tiếp tục</p>
          </div>

          {errorMessage && (
            <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Tên đăng nhập</label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nhập tên đăng nhập"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Mật khẩu</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
              className="w-full mt-2"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Đăng nhập ngay
            </Button>
          </form>

          {/* Quick Demo Access */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
              Chọn nhanh tài khoản mẫu:
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQuickFill('admin', 'Admin@1234')}
                className="py-1.5 px-2 text-[11px] font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 text-center transition-colors"
              >
                ADMIN
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('planner', 'Planner@1234')}
                className="py-1.5 px-2 text-[11px] font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 text-center transition-colors"
              >
                PLANNER
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('factory_dn', 'Factory@1234')}
                className="py-1.5 px-2 text-[11px] font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 text-center transition-colors"
              >
                FACTORY
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-slate-500 mt-6">
          PremixTrack Production Engine &copy; 2026. Chuẩn mực Dữ liệu Tấn/Kg & Đạo luật BR-33.
        </p>
      </div>
    </div>
  );
};
