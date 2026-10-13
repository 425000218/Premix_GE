import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/common/Button';
import { DataTable, Column } from '../components/common/DataTable';
import { WarningBadge } from '../components/common/WarningBadge';
import { Modal } from '../components/common/Modal';
import { formatTons, formatKg, formatDate, formatDateTime } from '../utils/formatters';
import { purchaseRequestsApi, CreatePrPayload } from '../api/purchase-requests.api';
import { useAuth } from '../context/AuthContext';
import { PurchaseSuggestionItem, PurchaseRequestItem, PrStatus } from '../types';
import {
  Sparkles,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  Plus,
  RotateCw,
  Send,
  Link as LinkIcon,
  AlertCircle,
  Clock,
} from 'lucide-react';

export const PurchaseRequestsPage: React.FC = () => {
  const { selectedFactory, hasPermission } = useAuth();
  const canCreate = hasPermission('purchase-request.create');
  const canUpdateStatus = hasPermission('purchase-request.status');
  const canExport = hasPermission('purchase-request.export');

  const [activeTab, setActiveTab] = useState<'suggestions' | 'list'>('suggestions');

  // Suggestions state
  const [suggestions, setSuggestions] = useState<PurchaseSuggestionItem[]>([]);
  const [isSugLoading, setIsSugLoading] = useState(false);

  // PR list state
  const [prs, setPrs] = useState<PurchaseRequestItem[]>([]);
  const [isPrLoading, setIsPrLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Quick PR Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<{
    factoryId: number;
    factoryCode: string;
    materialId: number;
    materialName: string;
    supplierId?: number;
    quantityTons: number;
    needByDate?: string;
    latestOrderDate?: string;
    notes?: string;
  } | null>(null);

  // Match PO Modal
  const [matchModalPr, setMatchModalPr] = useState<PurchaseRequestItem | null>(null);
  const [matchedPoNumber, setMatchedPoNumber] = useState('');

  // Cancel PR Modal
  const [cancelModalPr, setCancelModalPr] = useState<PurchaseRequestItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const [actionLoading, setActionLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchSuggestions = async () => {
    setIsSugLoading(true);
    try {
      const factId = selectedFactory === 'ALL' ? undefined : Number(selectedFactory);
      const data = await purchaseRequestsApi.getSuggestions(isNaN(factId as number) ? undefined : factId);
      setSuggestions(data || []);
    } catch (err) {
      console.error('Failed to load PR suggestions:', err);
    } finally {
      setIsSugLoading(false);
    }
  };

  const fetchPrs = async () => {
    setIsPrLoading(true);
    try {
      const stat = statusFilter === 'ALL' ? undefined : statusFilter;
      const res = await purchaseRequestsApi.getPrs({ status: stat, limit: 'all' });
      setPrs(res.items || []);
    } catch (err) {
      console.error('Failed to load PR list:', err);
    } finally {
      setIsPrLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'suggestions') {
      fetchSuggestions();
    } else {
      fetchPrs();
    }
  }, [activeTab, selectedFactory, statusFilter]);

  // Handle Quick Create PR from suggestion
  const handleOpenCreateModal = (item: PurchaseSuggestionItem) => {
    setCreateForm({
      factoryId: Number(item.factoryId),
      factoryCode: item.factoryCode,
      materialId: Number(item.materialId),
      materialName: item.materialName,
      supplierId: item.supplierId ? Number(item.supplierId) : undefined,
      quantityTons: item.suggestedQtyTons,
      needByDate: item.needByDate || undefined,
      latestOrderDate: item.latestOrderDate || undefined,
      notes: `Gợi ý định mức BR-25 (DOI: ${item.doiDays.toFixed(1)}d)`,
    });
    setIsCreateModalOpen(true);
  };

  const handleConfirmCreatePr = async () => {
    if (!createForm) return;
    setActionLoading(true);
    setFeedbackMessage(null);

    try {
      await purchaseRequestsApi.createPr({
        factoryId: createForm.factoryId,
        materialId: createForm.materialId,
        supplierId: createForm.supplierId,
        quantityTons: createForm.quantityTons,
        needByDate: createForm.needByDate,
        latestOrderDate: createForm.latestOrderDate,
        notes: createForm.notes,
      });

      setFeedbackMessage({
        type: 'success',
        text: `Tạo đề nghị mua hàng thành công cho ${createForm.materialName}!`,
      });
      setIsCreateModalOpen(false);
      fetchSuggestions();
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.response?.data?.message || 'Không thể tạo đề nghị mua hàng',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Match PO
  const handleConfirmMatchPo = async () => {
    if (!matchModalPr || !matchedPoNumber.trim()) return;
    setActionLoading(true);
    try {
      await purchaseRequestsApi.updateStatus(matchModalPr.id, {
        status: 'MATCHED',
        matchedPoNumber: matchedPoNumber.trim(),
      });
      setFeedbackMessage({
        type: 'success',
        text: `Đã khớp số PO ${matchedPoNumber} cho đề nghị ${matchModalPr.requestCode}`,
      });
      setMatchModalPr(null);
      fetchPrs();
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.response?.data?.message || 'Lỗi khi khớp số PO',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Cancel PR
  const handleConfirmCancelPr = async () => {
    if (!cancelModalPr) return;
    setActionLoading(true);
    try {
      await purchaseRequestsApi.updateStatus(cancelModalPr.id, {
        status: 'CANCELLED',
        cancelReason: cancelReason.trim() || 'Hủy theo yêu cầu kế hoạch',
      });
      setFeedbackMessage({
        type: 'success',
        text: `Đã hủy đề nghị mua hàng ${cancelModalPr.requestCode}`,
      });
      setCancelModalPr(null);
      fetchPrs();
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.response?.data?.message || 'Lỗi khi hủy đề nghị mua',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Export Excel
  const handleExportExcel = async () => {
    try {
      const blob = await purchaseRequestsApi.exportExcel({
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Purchase_Requests_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export PR excel:', err);
    }
  };

  // Suggestion Columns
  const suggestionColumns: Column<PurchaseSuggestionItem>[] = [
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
      key: 'doiDays',
      header: 'DOI Hiện Tại',
      sortable: true,
      align: 'center',
      getValue: (item) => item.doiDays,
      render: (item) => (
        <div className="flex flex-col items-center gap-0.5">
          <span className="font-mono font-bold text-slate-900">{item.doiDays.toFixed(1)}d</span>
          <WarningBadge level={item.warningLevel} short />
        </div>
      ),
    },
    {
      key: 'avgDailyDemandTons',
      header: 'Định mức ngày (d)',
      sortable: true,
      align: 'right',
      getValue: (item) => item.avgDailyDemandTons,
      render: (item) => (
        <span className="font-mono font-medium text-slate-700">
          {formatTons(item.avgDailyDemandTons)} t/d
        </span>
      ),
    },
    {
      key: 'netRequiredTons',
      header: 'Nhu cầu ròng',
      sortable: true,
      align: 'right',
      getValue: (item) => item.netRequiredTons,
      render: (item) => (
        <div className="text-right">
          <div className="font-mono text-slate-700">{formatTons(item.netRequiredTons)} t</div>
          <div className="text-[10px] text-slate-400 font-mono">({formatKg(item.netRequiredKg)} kg)</div>
        </div>
      ),
    },
    {
      key: 'suggestedQtyTons',
      header: 'Lượng Gợi Ý (Tấn)',
      sortable: true,
      align: 'right',
      getValue: (item) => item.suggestedQtyTons,
      render: (item) => (
        <div className="text-right">
          <div className="font-mono font-bold text-emerald-700 text-sm">{formatTons(item.suggestedQtyTons)} t</div>
          <div className="text-[10px] text-slate-400 font-mono">
            {item.bagSizeKg ? `Làm tròn ${item.bagSizeKg} kg/bao` : `${formatKg(item.suggestedQtyKg)} kg`}
          </div>
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Thời Hạn Đặt Hàng',
      align: 'center',
      render: (item) => (
        <div className="text-center font-mono text-[11px]">
          <div className="text-slate-800">Cần: <strong>{formatDate(item.needByDate)}</strong></div>
          <div className="text-red-600 font-medium">Đặt trước: <strong>{formatDate(item.latestOrderDate)}</strong></div>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'right',
      render: (item) => (
        <Button
          variant="primary"
          size="sm"
          disabled={!canCreate || item.suggestedQtyTons <= 0}
          onClick={() => handleOpenCreateModal(item)}
          leftIcon={<Send className="w-3.5 h-3.5" />}
        >
          Tạo PR
        </Button>
      ),
    },
  ];

  // PR List Columns
  const prListColumns: Column<PurchaseRequestItem>[] = [
    {
      key: 'requestCode',
      header: 'Mã PR',
      sortable: true,
      render: (item) => (
        <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
          {item.requestCode}
        </span>
      ),
    },
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
      key: 'quantityTons',
      header: 'Số lượng đặt',
      sortable: true,
      align: 'right',
      getValue: (item) => item.quantityTons,
      render: (item) => (
        <div className="text-right">
          <div className="font-mono font-bold text-slate-900">{formatTons(item.quantityTons)} t</div>
          <div className="font-mono text-[10px] text-slate-400">({formatKg(item.quantityKg)} kg)</div>
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Ngày cần hàng',
      align: 'center',
      render: (item) => (
        <span className="font-mono text-slate-700">{formatDate(item.needByDate)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      sortable: true,
      align: 'center',
      render: (item) => {
        const statusColors: Record<PrStatus, string> = {
          SENT: 'bg-blue-50 text-blue-700 border-blue-200',
          MATCHED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          EXPIRED: 'bg-slate-100 text-slate-600 border-slate-200',
          CANCELLED: 'bg-red-50 text-red-700 border-red-200',
        };
        const statusLabels: Record<PrStatus, string> = {
          SENT: 'Đã gửi (SENT)',
          MATCHED: 'Đã khớp PO',
          EXPIRED: 'Hết hạn',
          CANCELLED: 'Đã hủy',
        };

        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusColors[item.status]}`}>
            {statusLabels[item.status]}
          </span>
        );
      },
    },
    {
      key: 'matchedPoNumber',
      header: 'Số PO khớp',
      align: 'center',
      render: (item) => (
        item.matchedPoNumber ? (
          <span className="font-mono font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
            {item.matchedPoNumber}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )
      ),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5">
          {item.status === 'SENT' && canUpdateStatus && (
            <>
              <button
                onClick={() => {
                  setMatchModalPr(item);
                  setMatchedPoNumber('');
                }}
                title="Khớp với số PO ERP"
                className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md border border-emerald-200 transition-colors inline-flex items-center gap-1"
              >
                <LinkIcon className="w-3 h-3" />
                <span>Khớp PO</span>
              </button>
              <button
                onClick={() => {
                  setCancelModalPr(item);
                  setCancelReason('');
                }}
                title="Hủy đề nghị mua này"
                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Quản Lý Đề Nghị Mua Hàng & Gợi Ý Định Mức (F08)"
        subtitle="Thuật toán tự động tính lượng đặt hàng theo DOI < 7 và 7-15 ngày (BR-25), khấu trừ PO đang về & PR đang gửi (BR-25a), khớp số PO ERP"
        breadcrumbs={[{ label: 'PremixTrack' }, { label: 'Đề nghị mua hàng' }]}
        actions={
          <div className="flex items-center gap-2">
            {canExport && activeTab === 'list' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                leftIcon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />}
              >
                Xuất file Excel ERP
              </Button>
            )}
          </div>
        }
      />

      {feedbackMessage && (
        <div
          className={`mb-4 p-3 rounded-xl text-xs flex items-center gap-2.5 animate-in fade-in ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {feedbackMessage.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-200 mb-6">
        <button
          onClick={() => setActiveTab('suggestions')}
          className={`py-3 px-5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'suggestions'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span>Gợi ý mua hàng theo định mức (BR-25)</span>
          <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
            {suggestions.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('list')}
          className={`py-3 px-5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'list'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <span>Danh sách Đề nghị mua hàng (PR)</span>
          <span className="bg-slate-200 text-slate-700 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
            {prs.length}
          </span>
        </button>
      </div>

      {/* Tab 1: Suggestions */}
      {activeTab === 'suggestions' && (
        <DataTable
          columns={suggestionColumns}
          data={suggestions}
          isLoading={isSugLoading}
          searchPlaceholder="Tìm theo mã hoặc tên nguyên liệu..."
          searchKeys={['materialName', 'materialCode', 'factoryCode']}
          defaultPageSize={20}
          onRefresh={fetchSuggestions}
          emptyMessage="Tuyệt vời! Không có cặp nguyên liệu nào cần mua bổ sung lúc này."
        />
      )}

      {/* Tab 2: PR List */}
      {activeTab === 'list' && (
        <DataTable
          columns={prListColumns}
          data={prs}
          isLoading={isPrLoading}
          searchPlaceholder="Tìm theo mã PR, nguyên liệu hoặc số PO..."
          searchKeys={['requestCode', 'materialName', 'materialCode', 'matchedPoNumber']}
          defaultPageSize={20}
          onRefresh={fetchPrs}
          filters={
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-hidden"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="SENT">Đang gửi (SENT)</option>
              <option value="MATCHED">Đã khớp PO</option>
              <option value="EXPIRED">Hết hạn (EXPIRED)</option>
              <option value="CANCELLED">Đã hủy (CANCELLED)</option>
            </select>
          }
        />
      )}

      {/* Quick PR Confirmation Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Tạo Đề Nghị Mua Hàng Nhanh (PR)"
        subtitle={`Nhà máy: ${createForm?.factoryCode} | Nguyên liệu: ${createForm?.materialName}`}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsCreateModalOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={actionLoading}
              onClick={handleConfirmCreatePr}
              leftIcon={<Send className="w-3.5 h-3.5" />}
            >
              Xác nhận tạo PR
            </Button>
          </>
        }
      >
        {createForm && (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-500 font-medium">Khối lượng đề xuất (Tấn):</span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {formatTons(createForm.quantityTons)} tấn ({formatKg(createForm.quantityTons * 1000)} kg)
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Hạn đặt hàng muộn nhất:</span>
                <span className="font-mono text-red-600 font-semibold">{formatDate(createForm.latestOrderDate)}</span>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Số lượng đặt tùy chỉnh (Tấn):</label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={createForm.quantityTons}
                onChange={(e) =>
                  setCreateForm({ ...createForm, quantityTons: parseFloat(e.target.value) || 0 })
                }
                className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Ghi chú PR:</label>
              <textarea
                value={createForm.notes || ''}
                onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                rows={2}
                className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Match PO Modal */}
      <Modal
        isOpen={!!matchModalPr}
        onClose={() => setMatchModalPr(null)}
        title={`Khớp Số PO Cho Đề Nghị: ${matchModalPr?.requestCode}`}
        subtitle="Sau khi khớp số PO, PR sẽ chuyển sang trạng thái bất biến MATCHED (BR-27a)"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setMatchModalPr(null)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!matchedPoNumber.trim()}
              isLoading={actionLoading}
              onClick={handleConfirmMatchPo}
            >
              Khớp số PO
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Số PO phát sinh trên ERP (*):</label>
            <input
              type="text"
              value={matchedPoNumber}
              onChange={(e) => setMatchedPoNumber(e.target.value)}
              placeholder="Ví dụ: PO-2026-0099"
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono"
            />
          </div>
        </div>
      </Modal>

      {/* Cancel PR Modal */}
      <Modal
        isOpen={!!cancelModalPr}
        onClose={() => setCancelModalPr(null)}
        title={`Hủy Đề Nghị Mua Hàng: ${cancelModalPr?.requestCode}`}
        subtitle="Lý do hủy sẽ được ghi nhận vào nhật ký kiểm toán hệ thống"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setCancelModalPr(null)}>
              Quay lại
            </Button>
            <Button
              variant="danger"
              size="sm"
              isLoading={actionLoading}
              onClick={handleConfirmCancelPr}
            >
              Xác nhận hủy PR
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Lý do hủy đề nghị:</label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="Nhập lý do hủy..."
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
