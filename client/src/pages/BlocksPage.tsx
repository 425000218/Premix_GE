import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/common/Button';
import { DataTable, Column } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { formatTons, formatKg, formatDate } from '../utils/formatters';
import { blocksApi, CreateBlockPayload } from '../api/blocks.api';
import { catalogApi } from '../api/catalog.api';
import { useAuth } from '../context/AuthContext';
import { BlockedItem } from '../types';
import { Lock, Unlock, Plus, AlertCircle, CheckCircle, ShieldAlert } from 'lucide-react';

export const BlocksPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('block.create');
  const canRelease = hasPermission('block.release');

  const [blocks, setBlocks] = useState<BlockedItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'RELEASED' | 'ALL'>('ALL');

  // Factories & Materials
  const [factories, setFactories] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [materials, setMaterials] = useState<Array<{ id: number; code: string; name: string }>>([]);

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateBlockPayload>({
    factoryId: 1,
    materialId: 1,
    blockedKg: 1000,
    reason: '',
  });

  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    catalogApi.getDropdowns().then((data) => {
      if (data?.factories) {
        setFactories(data.factories.map((f: any) => ({ id: f.factoryId, code: f.factoryCode, name: f.factoryName })));
      }
      if (data?.materials) {
        setMaterials(data.materials.map((m: any) => ({ id: m.materialId, code: m.materialCode, name: m.materialName })));
      }
    }).catch(console.error);
  }, []);

  const fetchBlocks = async () => {
    setIsLoading(true);
    try {
      const res = await blocksApi.getBlocks({
        status: statusFilter,
        pageSize: 'all',
      });
      setBlocks(res.items || []);
    } catch (err) {
      console.error('Failed to load blocks:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBlocks();
  }, [statusFilter]);

  const handleCreateBlock = async () => {
    if (!createForm.reason.trim()) {
      setFeedback({ type: 'error', text: 'Vui lòng nhập lý do khóa hàng' });
      return;
    }
    setActionLoading(true);
    setFeedback(null);

    try {
      await blocksApi.createBlock(createForm);
      setFeedback({ type: 'success', text: 'Tạo lệnh khóa tồn kho thành công!' });
      setIsCreateOpen(false);
      fetchBlocks();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Không thể khóa tồn kho (có thể vượt SOH khả dụng BR-28a)',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReleaseBlock = async (item: BlockedItem) => {
    if (!confirm(`Xác nhận mở khóa tồn kho cho ${item.materialName} (Lô: ${item.lotNumber})?`)) return;

    try {
      await blocksApi.releaseBlock(item.blockId);
      setFeedback({ type: 'success', text: `Đã mở khóa tồn kho cho lệnh #${item.blockId}` });
      fetchBlocks();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Lỗi khi mở khóa tồn kho',
      });
    }
  };

  const columns: Column<BlockedItem>[] = [
    {
      key: 'factoryCode',
      header: 'Nhà máy',
      sortable: true,
      align: 'center',
      width: '90px',
      render: (item) => (
        <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
          {item.factoryCode}
        </span>
      ),
    },
    {
      key: 'materialName',
      header: 'Nguyên liệu',
      sortable: true,
      render: (item) => (
        <div>
          <div className="font-semibold text-slate-900">{item.materialName}</div>
          <div className="font-mono text-[10px] text-slate-400">{item.materialCode}</div>
        </div>
      ),
    },
    {
      key: 'lotNumber',
      header: 'Số Lô',
      align: 'center',
      render: (item) => <span className="font-mono font-medium text-slate-700">{item.lotNumber}</span>,
    },
    {
      key: 'blockedTons',
      header: 'Lượng khóa (Tấn)',
      sortable: true,
      align: 'right',
      getValue: (item) => item.blockedTons,
      render: (item) => (
        <div className="text-right">
          <div className="font-mono font-bold text-red-700">{formatTons(item.blockedTons)} t</div>
          <div className="text-[10px] text-slate-400 font-mono">({formatKg(item.blockedKg)} kg)</div>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Lý do khóa',
      render: (item) => <div className="text-slate-700 max-w-xs">{item.reason}</div>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      sortable: true,
      align: 'center',
      render: (item) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
            item.isReleased
              ? 'bg-slate-100 text-slate-600 border-slate-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {item.isReleased ? 'Đã mở khóa' : 'Đang bị khóa'}
        </span>
      ),
    },
    {
      key: 'blockedBy',
      header: 'Người tạo',
      align: 'center',
      render: (item) => <span className="text-slate-600 text-[11px]">{item.blockedBy}</span>,
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end">
          {!item.isReleased && canRelease && (
            <button
              onClick={() => handleReleaseBlock(item)}
              title="Mở khóa tồn này"
              className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md border border-emerald-200 transition-colors inline-flex items-center gap-1"
            >
              <Unlock className="w-3 h-3" />
              <span>Mở khóa</span>
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Quản Lý Tồn Kho Bị Khóa (Blocked Stock - F06)"
        subtitle="Quản lý và giải phóng tồn kho bị chặn thủ công hoặc chờ kiểm nghiệm chất lượng (QC pending). Khối lượng khóa được khấu trừ khỏi SOH khả dụng (BR-28)"
        breadcrumbs={[{ label: 'PremixTrack' }, { label: 'Tồn bị khóa' }]}
        actions={
          canCreate && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              Khóa tồn mới
            </Button>
          )
        }
      />

      {feedback && (
        <div
          className={`mb-4 p-3 rounded-xl text-xs flex items-center gap-2.5 animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      <DataTable
        columns={columns}
        data={blocks}
        isLoading={isLoading}
        searchPlaceholder="Tìm theo mã, tên nguyên liệu hoặc lý do..."
        searchKeys={['materialName', 'materialCode', 'reason']}
        defaultPageSize={20}
        onRefresh={fetchBlocks}
        filters={
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-hidden"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang bị khóa (ACTIVE)</option>
            <option value="RELEASED">Đã mở khóa (RELEASED)</option>
          </select>
        }
      />

      {/* Create Block Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Tạo Lệnh Khóa Tồn Kho Mới"
        subtitle="Khối lượng khóa sẽ lập tức được khấu trừ khỏi tồn khả dụng phục vụ tính DOI"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={actionLoading}
              onClick={handleCreateBlock}
            >
              Xác nhận khóa tồn
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Nhà máy (*)</label>
            <select
              value={createForm.factoryId}
              onChange={(e) => setCreateForm({ ...createForm, factoryId: Number(e.target.value) })}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
            >
              {factories.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Nguyên liệu (*)</label>
            <select
              value={createForm.materialId}
              onChange={(e) => setCreateForm({ ...createForm, materialId: Number(e.target.value) })}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
            >
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} - {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Khối lượng khóa (KG nguyên) (*):</label>
            <input
              type="number"
              min="1"
              value={createForm.blockedKg}
              onChange={(e) => setCreateForm({ ...createForm, blockedKg: parseFloat(e.target.value) || 0 })}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Tương đương: <strong>{formatTons(createForm.blockedKg, true)}</strong> tấn
            </span>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Lý do khóa (*):</label>
            <textarea
              value={createForm.reason}
              onChange={(e) => setCreateForm({ ...createForm, reason: e.target.value })}
              rows={3}
              placeholder="Ví dụ: Chờ kiểm nghiệm chất lượng vi sinh (QC pending)"
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
              required
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
