import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Shield,
  Key,
  Users,
  CheckCircle2,
  XCircle,
  Plus,
  Edit3,
  Trash2,
  Save,
  RefreshCw,
  Search,
  Lock,
  Building2,
  AlertCircle,
  Check,
  Info,
  Loader2,
} from 'lucide-react';
import { rolesApi } from '../api/roles.api';
import { Modal } from '../components/common/Modal';
import { useAuth } from '../context/AuthContext';
import { PermissionCatalogItem, RoleItem } from '../types';

export const RolesPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.roleCode === 'ADMIN';

  // Data states
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [catalog, setCatalog] = useState<PermissionCatalogItem[]>([]);
  const [rolePermissionsMap, setRolePermissionsMap] = useState<Record<string, string[]>>({});
  const [originalMap, setOriginalMap] = useState<Record<string, string[]>>({});

  // Loading states
  const [loading, setLoading] = useState<boolean>(true);
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Active view tab
  const [activeTab, setActiveTab] = useState<'matrix' | 'list'>('matrix');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedModule, setSelectedModule] = useState<string>('ALL');

  // Modal Create/Edit Role
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [formRoleCode, setFormRoleCode] = useState<string>('');
  const [formRoleName, setFormRoleName] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formFactoryScope, setFormFactoryScope] = useState<'ALL' | 'ASSIGNED'>('ALL');
  const [formPermissions, setFormPermissions] = useState<string[]>([]);

  // Load initial data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [rolesData, catalogData] = await Promise.all([
        rolesApi.getRoles(),
        rolesApi.getPermissionsCatalog(),
      ]);

      setRoles(rolesData);
      setCatalog(catalogData);

      // Fetch permissions for each role
      const permMap: Record<string, string[]> = {};
      await Promise.all(
        rolesData.map(async (role) => {
          if (role.roleCode === 'ADMIN') {
            // ADMIN has all permissions
            permMap['ADMIN'] = catalogData.map((c) => c.permissionCode);
          } else {
            const detail = await rolesApi.getRoleByCode(role.roleCode);
            permMap[role.roleCode] = detail.permissions || [];
          }
        })
      );

      setRolePermissionsMap(permMap);
      setOriginalMap(JSON.parse(JSON.stringify(permMap)));
    } catch (err: any) {
      console.error('Failed to load roles data:', err);
      setNotification({
        type: 'error',
        message: err?.response?.data?.error?.message || 'Không thể tải dữ liệu vai trò và quyền.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Show notification for 4 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Group catalog by Module
  const modulesGroup = useMemo(() => {
    const map = new Map<string, { moduleName: string; permissions: PermissionCatalogItem[] }>();
    catalog.forEach((item) => {
      if (!map.has(item.moduleCode)) {
        map.set(item.moduleCode, {
          moduleName: item.moduleName,
          permissions: [],
        });
      }
      map.get(item.moduleCode)!.permissions.push(item);
    });
    return Array.from(map.entries()).map(([moduleCode, data]) => ({
      moduleCode,
      moduleName: data.moduleName,
      permissions: data.permissions,
    }));
  }, [catalog]);

  // Filtered catalog
  const filteredModules = useMemo(() => {
    return modulesGroup
      .filter((mod) => selectedModule === 'ALL' || mod.moduleCode === selectedModule)
      .map((mod) => ({
        ...mod,
        permissions: mod.permissions.filter(
          (p) =>
            searchTerm === '' ||
            p.permissionName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.permissionCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.description.toLowerCase().includes(searchTerm.toLowerCase())
        ),
      }))
      .filter((mod) => mod.permissions.length > 0);
  }, [modulesGroup, selectedModule, searchTerm]);

  // Check if a role has unsaved changes
  const hasChanges = (roleCode: string) => {
    if (roleCode === 'ADMIN') return false;
    const current = rolePermissionsMap[roleCode] || [];
    const orig = originalMap[roleCode] || [];
    if (current.length !== orig.length) return true;
    return current.some((p) => !orig.includes(p));
  };

  // Toggle permission for a role in matrix
  const handleTogglePermission = (roleCode: string, permissionCode: string) => {
    if (roleCode === 'ADMIN') return; // Cannot modify ADMIN
    setRolePermissionsMap((prev) => {
      const current = prev[roleCode] || [];
      const updated = current.includes(permissionCode)
        ? current.filter((p) => p !== permissionCode)
        : [...current, permissionCode];
      return { ...prev, [roleCode]: updated };
    });
  };

  // Toggle all permissions of a module for a role
  const handleToggleModulePermissions = (roleCode: string, moduleCode: string, selectAll: boolean) => {
    if (roleCode === 'ADMIN') return;
    const modPerms = catalog
      .filter((p) => p.moduleCode === moduleCode)
      .map((p) => p.permissionCode);

    setRolePermissionsMap((prev) => {
      const current = prev[roleCode] || [];
      let updated: string[];
      if (selectAll) {
        updated = Array.from(new Set([...current, ...modPerms]));
      } else {
        updated = current.filter((p) => !modPerms.includes(p));
      }
      return { ...prev, [roleCode]: updated };
    });
  };

  // Save permissions for a specific role
  const handleSaveRolePermissions = async (roleCode: string) => {
    if (roleCode === 'ADMIN') return;
    try {
      setSavingRole(roleCode);
      const permsToSave = rolePermissionsMap[roleCode] || [];
      await rolesApi.setRolePermissions(roleCode, permsToSave);

      // Update original map
      setOriginalMap((prev) => ({ ...prev, [roleCode]: [...permsToSave] }));
      setNotification({
        type: 'success',
        message: `Đã lưu thành công ${permsToSave.length} quyền cho vai trò ${roleCode}.`,
      });
      // Refresh roles to update permission count
      const updatedRoles = await rolesApi.getRoles();
      setRoles(updatedRoles);
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err?.response?.data?.error?.message || `Lỗi khi lưu quyền cho vai trò ${roleCode}`,
      });
    } finally {
      setSavingRole(null);
    }
  };

  // Open Modal Create Role
  const handleOpenCreateModal = () => {
    setEditingRole(null);
    setFormRoleCode('');
    setFormRoleName('');
    setFormDescription('');
    setFormFactoryScope('ALL');
    setFormPermissions(['position.view', 'block.view']);
    setIsModalOpen(true);
  };

  // Open Modal Edit Role
  const handleOpenEditModal = (role: RoleItem) => {
    setEditingRole(role);
    setFormRoleCode(role.roleCode);
    setFormRoleName(role.roleName);
    setFormDescription(role.description || '');
    setFormFactoryScope(role.factoryScope);
    setFormPermissions(rolePermissionsMap[role.roleCode] || []);
    setIsModalOpen(true);
  };

  // Submit Modal Form
  const handleSubmitRoleForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRoleName.trim()) {
      alert('Vui lòng nhập tên vai trò');
      return;
    }

    try {
      setActionLoading(true);
      if (editingRole) {
        // Update
        await rolesApi.updateRole(editingRole.roleCode, {
          roleName: formRoleName.trim(),
          description: formDescription.trim(),
          factoryScope: formFactoryScope,
        });
        setNotification({
          type: 'success',
          message: `Cập nhật thông tin vai trò ${editingRole.roleCode} thành công.`,
        });
      } else {
        // Create
        if (!formRoleCode.trim()) {
          alert('Vui lòng nhập mã vai trò');
          return;
        }
        await rolesApi.createRole({
          roleCode: formRoleCode.trim().toUpperCase(),
          roleName: formRoleName.trim(),
          description: formDescription.trim(),
          factoryScope: formFactoryScope,
          permissionCodes: formPermissions,
        });
        setNotification({
          type: 'success',
          message: `Tạo vai trò mới ${formRoleCode.trim().toUpperCase()} thành công.`,
        });
      }

      setIsModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err?.response?.data?.error?.message || 'Có lỗi xảy ra khi lưu vai trò.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Role
  const handleDeleteRole = async (role: RoleItem) => {
    if (role.isSystem) {
      alert(`Vai trò hệ thống '${role.roleCode}' được bảo vệ không thể xóa.`);
      return;
    }
    if (role.userCount > 0) {
      alert(`Không thể xóa vai trò '${role.roleCode}' vì đang có ${role.userCount} tài khoản gán vai trò này.`);
      return;
    }
    if (!window.confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn vai trò '${role.roleCode}' không?`)) {
      return;
    }

    try {
      setActionLoading(true);
      await rolesApi.deleteRole(role.roleCode);
      setNotification({
        type: 'success',
        message: `Đã xóa vai trò '${role.roleCode}' thành công.`,
      });
      await fetchData();
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err?.response?.data?.error?.message || 'Lỗi khi xóa vai trò.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Count stats
  const totalRoles = roles.length;
  const systemRoles = roles.filter((r) => r.isSystem).length;
  const customRoles = roles.filter((r) => !r.isSystem).length;
  const totalPermissions = catalog.length;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold animate-in slide-in-from-top-2 duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
              : 'bg-red-50 text-red-800 border-red-300'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>Phân hệ Quản trị Hệ thống (F01c)</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Quản Lý Vai Trò & Ma Trận Phân Quyền (Roles & Dynamic RBAC)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Thiết lập vai trò tùy biến, phạm vi nhà máy và ma trận 27 mã quyền áp dụng theo thời gian thực (Real-time RBAC)
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-300 flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            <span>Làm mới</span>
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm vai trò mới</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tổng số vai trò</span>
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-2">{totalRoles}</div>
          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
            <Building2 className="w-3 h-3 text-slate-400" />
            <span>Phân quyền 6 nhà máy</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Vai trò hệ thống</span>
            <div className="p-2 bg-blue-50 text-blue-700 rounded-lg">
              <Lock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-blue-700 mt-2">{systemRoles}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            <span>ADMIN, PLANNER, FACTORY...</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Vai trò tùy biến</span>
            <div className="p-2 bg-amber-50 text-amber-700 rounded-lg">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600 mt-2">{customRoles}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            <span>Tự do thêm/sửa/xóa</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Danh mục mã quyền</span>
            <div className="p-2 bg-purple-50 text-purple-700 rounded-lg">
              <Key className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-purple-700 mt-2">
            {totalPermissions} <span className="text-xs font-normal text-slate-400">/ 27 mã</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            <span>9 phân hệ chức năng</span>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 pt-3 rounded-t-2xl">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('matrix')}
            className={`pb-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'matrix'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>Ma trận Phân quyền 2 chiều (Roles x 27 Permissions)</span>
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className={`pb-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'list'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Danh sách Chi tiết Vai trò ({roles.length})</span>
          </button>
        </div>

        {activeTab === 'matrix' && (
          <div className="flex items-center gap-3 pb-3">
            {/* Module Filter */}
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 font-medium"
            >
              <option value="ALL">Mọi phân hệ ({modulesGroup.length})</option>
              {modulesGroup.map((m) => (
                <option key={m.moduleCode} value={m.moduleCode}>
                  {m.moduleName}
                </option>
              ))}
            </select>

            {/* Search input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm mã hoặc tên quyền..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 w-52"
              />
            </div>
          </div>
        )}
      </div>

      {/* Tab 1: Permission Matrix */}
      {activeTab === 'matrix' && (
        <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 shadow-xs overflow-hidden">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <span className="text-xs text-slate-500 font-medium">Đang tải ma trận phân quyền...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-4 font-bold text-slate-700 min-w-[260px] border-r border-slate-200">
                      Mã quyền & Phân hệ chức năng
                    </th>
                    {roles.map((role) => {
                      const modified = hasChanges(role.roleCode);
                      const isSaving = savingRole === role.roleCode;
                      const currentCount = rolePermissionsMap[role.roleCode]?.length || 0;
                      return (
                        <th
                          key={role.roleCode}
                          className={`py-3 px-3 text-center min-w-[130px] border-r border-slate-200/80 transition-colors ${
                            modified ? 'bg-amber-50/70' : ''
                          }`}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-slate-900 text-xs">
                                {role.roleCode}
                              </span>
                              {role.isSystem && (
                                <span title="Vai trò hệ thống">
                                  <Lock className="w-3 h-3 text-slate-400" />
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
                              {role.roleName}
                            </span>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span
                                className={`px-1.5 py-0.2 rounded text-[9px] font-semibold ${
                                  role.factoryScope === 'ALL'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {role.factoryScope}
                              </span>
                              <span className="font-mono text-[10px] text-slate-600 font-bold">
                                {currentCount}/27
                              </span>
                            </div>

                            {/* Save Button for modified role */}
                            {modified && (
                              <button
                                onClick={() => handleSaveRolePermissions(role.roleCode)}
                                disabled={isSaving}
                                className="mt-1 px-2.5 py-1 text-[10px] font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-md shadow-xs flex items-center gap-1 transition-all"
                              >
                                {isSaving ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Save className="w-3 h-3" />
                                )}
                                <span>Lưu quyền</span>
                              </button>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredModules.map((module) => (
                    <React.Fragment key={module.moduleCode}>
                      {/* Module Header Row */}
                      <tr className="bg-slate-100/70 border-y border-slate-200">
                        <td
                          className="py-2 px-4 font-bold text-slate-800 text-xs border-r border-slate-200 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-600" />
                            <span>{module.moduleName}</span>
                            <span className="text-[10px] font-normal text-slate-500">
                              ({module.permissions.length} quyền)
                            </span>
                          </div>
                        </td>
                        {roles.map((role) => (
                          <td
                            key={role.roleCode}
                            className="py-2 px-2 text-center border-r border-slate-200/80"
                          >
                            {role.roleCode !== 'ADMIN' && (
                              <div className="flex items-center justify-center gap-1.5 text-[9px]">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleToggleModulePermissions(role.roleCode, module.moduleCode, true)
                                  }
                                  className="text-emerald-700 hover:text-emerald-800 font-semibold hover:underline"
                                >
                                  Tất cả
                                </button>
                                <span className="text-slate-300">|</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleToggleModulePermissions(role.roleCode, module.moduleCode, false)
                                  }
                                  className="text-red-600 hover:text-red-700 font-semibold hover:underline"
                                >
                                  Bỏ
                                </button>
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>

                      {/* Permissions in Module */}
                      {module.permissions.map((perm) => (
                        <tr
                          key={perm.permissionCode}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="py-2.5 px-4 border-r border-slate-200">
                            <div className="font-medium text-slate-900 text-xs">
                              {perm.permissionName}
                            </div>
                            <div className="text-[10px] font-mono text-emerald-700">
                              {perm.permissionCode}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-sm">
                              {perm.description}
                            </div>
                          </td>

                          {roles.map((role) => {
                            const isAssigned =
                              role.roleCode === 'ADMIN' ||
                              rolePermissionsMap[role.roleCode]?.includes(perm.permissionCode);
                            const isAdminRole = role.roleCode === 'ADMIN';

                            return (
                              <td
                                key={role.roleCode}
                                className={`py-2 px-3 text-center border-r border-slate-200/80 ${
                                  isAssigned ? 'bg-emerald-50/20' : ''
                                }`}
                              >
                                <label className="inline-flex items-center justify-center cursor-pointer p-1">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(isAssigned)}
                                    disabled={isAdminRole}
                                    onChange={() =>
                                      handleTogglePermission(role.roleCode, perm.permissionCode)
                                    }
                                    className={`w-4 h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 ${
                                      isAdminRole ? 'opacity-70 cursor-not-allowed' : ''
                                    }`}
                                  />
                                </label>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Detailed Roles List */}
      {activeTab === 'list' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
              <tr>
                <th className="py-3 px-4">Mã vai trò</th>
                <th className="py-3 px-4">Tên vai trò</th>
                <th className="py-3 px-4">Mô tả</th>
                <th className="py-3 px-3 text-center">Phạm vi</th>
                <th className="py-3 px-3 text-center">Loại</th>
                <th className="py-3 px-3 text-right">Số tài khoản</th>
                <th className="py-3 px-3 text-right">Số quyền</th>
                <th className="py-3 px-4 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {roles.map((role) => (
                <tr key={role.roleCode} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">
                    {role.roleCode}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-800">
                    {role.roleName}
                  </td>
                  <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                    {role.description || '—'}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        role.factoryScope === 'ALL'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {role.factoryScope === 'ALL' ? 'Toàn quốc (ALL)' : 'Được gán (ASSIGNED)'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    {role.isSystem ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                        <Lock className="w-3 h-3 text-slate-500" />
                        <span>Hệ thống</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                        Tùy biến
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900">
                    {role.userCount}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-emerald-700">
                    {role.roleCode === 'ADMIN' ? 27 : role.permissionCount} / 27
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleOpenEditModal(role)}
                        className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Sửa thông tin vai trò"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteRole(role)}
                        disabled={role.isSystem || role.userCount > 0}
                        className={`p-1.5 rounded-lg transition-colors ${
                          role.isSystem || role.userCount > 0
                            ? 'text-slate-300 cursor-not-allowed'
                            : 'text-red-500 hover:text-red-700 hover:bg-red-50'
                        }`}
                        title={
                          role.isSystem
                            ? 'Vai trò hệ thống không được xóa'
                            : role.userCount > 0
                            ? 'Không thể xóa vai trò đang có tài khoản sử dụng'
                            : 'Xóa vai trò'
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Create / Edit Role */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingRole ? `Sửa Vai Trò: ${editingRole.roleCode}` : 'Tạo Vai Trò Tùy Biến Mới (F01c)'}
        subtitle="Quản lý vai trò và phân quyền động theo từng chức năng"
        maxWidth="lg"
      >
        <form onSubmit={handleSubmitRoleForm} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mã vai trò (RoleCode) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="VD: QA_LEAD, SHIFT_SUPERVISOR..."
              value={formRoleCode}
              onChange={(e) => setFormRoleCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
              disabled={Boolean(editingRole)}
              required
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono disabled:bg-slate-100 disabled:text-slate-500"
            />
            <p className="text-[10px] text-slate-400 mt-1">Chỉ gồm chữ cái in hoa, số và dấu gạch dưới (_).</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tên hiển thị của vai trò <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="VD: Trưởng bộ phận Đảm bảo chất lượng"
              value={formRoleName}
              onChange={(e) => setFormRoleName(e.target.value)}
              required
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Mô tả nhiệm vụ</label>
            <textarea
              rows={2}
              placeholder="Mô tả trách nhiệm và phạm vi của vai trò..."
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Phạm vi nhà máy (Factory Scope) <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3 mt-1.5">
              <label
                className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                  formFactoryScope === 'ALL'
                    ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="factoryScope"
                  value="ALL"
                  checked={formFactoryScope === 'ALL'}
                  onChange={() => setFormFactoryScope('ALL')}
                  className="text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <div className="text-xs font-bold">Toàn bộ 6 Nhà máy (ALL)</div>
                  <div className="text-[10px] text-slate-500">Xem dữ liệu toàn quốc (VD: Planner, Director)</div>
                </div>
              </label>

              <label
                className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                  formFactoryScope === 'ASSIGNED'
                    ? 'border-amber-500 bg-amber-50/50 text-amber-900'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="factoryScope"
                  value="ASSIGNED"
                  checked={formFactoryScope === 'ASSIGNED'}
                  onChange={() => setFormFactoryScope('ASSIGNED')}
                  disabled={editingRole?.roleCode === 'ADMIN'}
                  className="text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <div className="text-xs font-bold">Nhà máy được gán (ASSIGNED)</div>
                  <div className="text-[10px] text-slate-500">Chỉ xem nhà máy gán (VD: Factory, Kho)</div>
                </div>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-100 rounded-xl border border-slate-300 transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {actionLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{editingRole ? 'Lưu thay đổi' : 'Tạo vai trò mới'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
