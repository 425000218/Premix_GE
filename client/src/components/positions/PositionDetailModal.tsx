import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { WarningBadge } from '../common/WarningBadge';
import { formatTons, formatKg, formatDate } from '../../utils/formatters';
import { positionsApi } from '../../api/positions.api';
import { PositionItem, PositionDetail, ProjectionEngineResult } from '../../types';
import { useAuth } from '../../context/AuthContext';
import {
  Loader2,
  Package,
  Truck,
  Edit3,
  History,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Calendar,
  Clock,
  TrendingDown,
  Layers,
} from 'lucide-react';

interface PositionDetailModalProps {
  position: PositionItem | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

export const PositionDetailModal: React.FC<PositionDetailModalProps> = ({
  position,
  isOpen,
  onClose,
  onUpdated,
}) => {
  const { user, hasPermission } = useAuth();
  const canEditOverride =
    hasPermission('demand-override.edit') ||
    user?.roleCode === 'PLANNER' ||
    user?.roleCode === 'ADMIN';

  const [activeTab, setActiveTab] = useState<'overview' | 'projection'>('overview');
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<PositionDetail | null>(null);

  // 28-Day Projection state
  const [projection, setProjection] = useState<ProjectionEngineResult | null>(null);
  const [loadingProjection, setLoadingProjection] = useState(false);
  const [projectionTier, setProjectionTier] = useState<'tier1' | 'tier2'>('tier2');

  // Form override
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [overrideTonsInput, setOverrideTonsInput] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideMessage, setOverrideMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const loadData = () => {
    if (position) {
      setLoading(true);
      positionsApi
        .getPositionDetail(position.factoryId, position.materialId)
        .then((data) => setDetail(data))
        .catch((err) => console.error('Failed to load position detail:', err))
        .finally(() => setLoading(false));
    }
  };

  const loadProjection = () => {
    if (position) {
      setLoadingProjection(true);
      positionsApi
        .getProjection(position.factoryId, position.materialId)
        .then((data) => setProjection(data))
        .catch((err) => console.error('Failed to load projection:', err))
        .finally(() => setLoadingProjection(false));
    }
  };

  useEffect(() => {
    if (isOpen && position) {
      loadData();
      loadProjection();
      setActiveTab('overview');
      setIsOverrideOpen(false);
      setOverrideTonsInput('');
      setOverrideReason('');
      setOverrideMessage(null);
    } else {
      setDetail(null);
      setProjection(null);
    }
  }, [isOpen, position]);

  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!position) return;
    const tons = parseFloat(overrideTonsInput);
    if (isNaN(tons) || tons < 0) {
      setOverrideMessage({ type: 'error', text: 'Khối lượng phải là số >= 0.' });
      return;
    }
    if (!overrideReason.trim()) {
      setOverrideMessage({
        type: 'error',
        text: 'Vui lòng nhập lý do sửa tay (bắt buộc theo BR-14).',
      });
      return;
    }

    setOverrideSubmitting(true);
    setOverrideMessage(null);
    try {
      await positionsApi.createOverride(position.factoryId, position.materialId, {
        overrideTons: tons,
        reason: overrideReason.trim(),
      });
      setOverrideMessage({
        type: 'success',
        text: 'Đã lưu số nhu cầu sửa tay thành công! Hệ thống đã tính lại DOI và vị thế.',
      });
      setIsOverrideOpen(false);
      setOverrideTonsInput('');
      setOverrideReason('');
      loadData();
      loadProjection();
      onUpdated?.();
    } catch (err: any) {
      setOverrideMessage({
        type: 'error',
        text:
          err?.response?.data?.error?.message ||
          err?.message ||
          'Lỗi khi lưu số sửa tay',
      });
    } finally {
      setOverrideSubmitting(false);
    }
  };

  const handleRemoveOverride = async () => {
    if (!position) return;
    if (
      !window.confirm(
        'Bạn có chắc chắn muốn hủy bỏ số sửa tay và chuyển về dùng Forecast?'
      )
    )
      return;

    setOverrideSubmitting(true);
    setOverrideMessage(null);
    try {
      await positionsApi.removeOverride(
        position.factoryId,
        position.materialId,
        'Hủy số sửa tay từ giao diện người dùng'
      );
      setOverrideMessage({
        type: 'success',
        text: 'Đã hủy bỏ số sửa tay, hệ thống quay về dùng Forecast tự động.',
      });
      loadData();
      loadProjection();
      onUpdated?.();
    } catch (err: any) {
      setOverrideMessage({
        type: 'error',
        text:
          err?.response?.data?.error?.message ||
          err?.message ||
          'Lỗi khi hủy số sửa tay',
      });
    } finally {
      setOverrideSubmitting(false);
    }
  };

  if (!position) return null;

  const currentDemandSource =
    detail?.position?.demandSource || position.demandSource;
  const currentMonthlyDemandTons =
    detail?.position?.monthlyDemandTons ?? position.monthlyDemandTons;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Chi tiết Vị thế: ${position.factoryCode} - ${position.materialName}`}
      subtitle={`Mã nguyên liệu: ${position.materialCode} | Nhà máy: ${position.factoryName}`}
      maxWidth="4xl"
    >
      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 mb-5 gap-6">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'overview'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Tổng quan & Lô kho</span>
        </button>
        <button
          onClick={() => setActiveTab('projection')}
          className={`pb-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'projection'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span>Dự phóng 28 ngày & Đề xuất giao hàng (BR-34, BR-36)</span>
        </button>
      </div>

      {activeTab === 'overview' && (
        loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            <span className="text-xs text-slate-500 font-medium">
              Đang tải dữ liệu chi tiết lô hàng và PO...
            </span>
          </div>
        ) : (
          <div className="space-y-6">
          {/* Key Indicators Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase">
                Tồn khả dụng (SOH)
              </span>
              <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                {formatTons(position.effectiveStockTons)}{' '}
                <span className="text-xs font-normal text-slate-500">tấn</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                ({formatKg(position.effectiveStockKg)} kg)
              </span>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase">
                Chỉ số DOI
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-lg font-bold font-mono text-slate-900">
                  {position.doiDays.toFixed(1)}
                </span>
                <span className="text-xs text-slate-500">ngày</span>
              </div>
              <div className="mt-1">
                <WarningBadge level={position.warningLevel} short />
              </div>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase">
                Tiêu hao bình quân (d)
              </span>
              <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                {formatTons(position.avgDailyDemandTons)}{' '}
                <span className="text-xs font-normal text-slate-500">
                  tấn/ngày
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                ({formatKg(position.avgDailyDemandKg)} kg/ngày)
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 uppercase">
                  Nguồn nhu cầu
                </span>
                {canEditOverride && (
                  <button
                    onClick={() => setIsOverrideOpen(!isOverrideOpen)}
                    className="text-[10px] font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5 hover:underline"
                  >
                    <Edit3 className="w-3 h-3" />
                    {isOverrideOpen ? 'Đóng' : 'Sửa tay'}
                  </button>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                    currentDemandSource === 'OVERRIDE'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-slate-200 text-slate-800'
                  }`}
                >
                  {currentDemandSource}
                </span>
                {currentDemandSource === 'OVERRIDE' && canEditOverride && (
                  <button
                    onClick={handleRemoveOverride}
                    disabled={overrideSubmitting}
                    title="Hủy sửa tay, quay về Forecast (BR-05b)"
                    className="text-[10px] font-semibold text-red-600 hover:text-red-700 hover:underline flex items-center gap-0.5"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    Hủy bỏ
                  </button>
                )}
              </div>
              {position.stockoutDate && (
                <div className="flex items-center gap-1 text-[11px] text-red-600 mt-1 font-medium">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Dự kiến hết: {formatDate(position.stockoutDate)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Alert Message for Override actions */}
          {overrideMessage && (
            <div
              className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
                overrideMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {overrideMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{overrideMessage.text}</span>
            </div>
          )}

          {/* Form Sửa tay Nhu cầu (Demand Override - BR-14a, BR-05a) */}
          {isOverrideOpen && canEditOverride && (
            <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-emerald-700" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Sửa tay nhu cầu tháng (Demand Override - BR-14a)
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">
                  Nhu cầu hiện tại:{' '}
                  <strong className="text-slate-800">
                    {formatTons(currentMonthlyDemandTons || 0)} tấn/tháng
                  </strong>
                </span>
              </div>

              <form onSubmit={handleSaveOverride} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Nhu cầu tháng mới (Tấn) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="VD: 5.600"
                      value={overrideTonsInput}
                      onChange={(e) => setOverrideTonsInput(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Lý do sửa tay (Bắt buộc theo BR-14) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="VD: Đột xuất xuất khẩu thêm trong tháng"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsOverrideOpen(false)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 rounded-lg border border-slate-300"
                  >
                    Hủy thao tác
                  </button>
                  <button
                    type="submit"
                    disabled={overrideSubmitting}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {overrideSubmitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>Xác nhận sửa tay (Append-only)</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Lịch sử Sửa tay Nhu cầu (Append-only History - BR-14a) */}
          {detail?.demandOverrideHistory &&
            detail.demandOverrideHistory.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
                  <History className="w-4 h-4 text-emerald-600" />
                  <span>
                    Lịch sử sửa tay nhu cầu (Append-only History - BR-14a)
                  </span>
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2 px-3">Thời điểm</th>
                        <th className="py-2 px-3">Tháng áp dụng</th>
                        <th className="py-2 px-3 text-right">Khối lượng</th>
                        <th className="py-2 px-3 text-center">Trạng thái</th>
                        <th className="py-2 px-3">Người thực hiện</th>
                        <th className="py-2 px-3">Lý do</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {detail.demandOverrideHistory.map((item, idx) => (
                        <tr
                          key={item.overrideId || idx}
                          className={item.overrideKg == null ? 'bg-amber-50/30' : ''}
                        >
                          <td className="py-2 px-3 text-slate-500 font-sans">
                            {item.createdAt ? formatDate(item.createdAt) : '—'}
                          </td>
                          <td className="py-2 px-3 text-slate-700 font-medium font-sans">
                            {item.periodMonth || '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900">
                            {item.overrideKg != null
                              ? `${formatTons(item.overrideKg / 1000)} tấn (${formatKg(
                                  item.overrideKg
                                )} kg)`
                              : 'NULL (Hủy bỏ)'}
                          </td>
                          <td className="py-2 px-3 text-center font-sans">
                            {item.overrideKg != null ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                                Sửa tay mới
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
                                Hủy về Forecast
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-700 font-sans">
                            {item.createdBy}
                          </td>
                          <td className="py-2 px-3 text-slate-600 font-sans max-w-xs truncate">
                            {item.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          {/* Lots Breakdown */}
          <div>
            <div className="flex items-center gap-2 mb-2.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <Package className="w-4 h-4 text-emerald-600" />
              <span>Chi tiết các lô hàng trong kho (Lots Breakdown)</span>
            </div>

            {detail?.lots && detail.lots.length > 0 ? (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2 px-3">Số Lô (Lot Number)</th>
                      <th className="py-2 px-3 text-right">Khối lượng (Tấn)</th>
                      <th className="py-2 px-3 text-right">Khối lượng (Kg)</th>
                      <th className="py-2 px-3">Hạn sử dụng</th>
                      <th className="py-2 px-3 text-center">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.lots.map((lot, idx) => (
                      <tr key={idx} className={lot.isBlocked ? 'bg-red-50/30' : ''}>
                        <td className="py-2 px-3 font-mono font-medium text-slate-900">{lot.lotNumber}</td>
                        <td className="py-2 px-3 text-right font-mono font-semibold">{formatTons(lot.quantityTons)}</td>
                        <td className="py-2 px-3 text-right font-mono text-slate-500">{formatKg(lot.quantityKg)}</td>
                        <td className="py-2 px-3 text-slate-600">{formatDate(lot.expireDate)}</td>
                        <td className="py-2 px-3 text-center">
                          {lot.isBlocked ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
                              Bị khóa: {lot.blockReason || 'Chặn thủ công'}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                              Khả dụng
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-xs text-slate-500 bg-slate-50 p-4 rounded-lg text-center border border-slate-200">
                Không có dữ liệu phân lô chi tiết trong kho.
              </div>
            )}
          </div>

          {/* Open POs */}
          <div>
            <div className="flex items-center gap-2 mb-2.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <Truck className="w-4 h-4 text-emerald-600" />
              <span>Đơn mua hàng đang về (Open POs)</span>
            </div>

            {detail?.openPos && detail.openPos.length > 0 ? (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2 px-3">Số PO</th>
                      <th className="py-2 px-3">Nhà cung cấp</th>
                      <th className="py-2 px-3 text-right">Lượng đặt (Tấn)</th>
                      <th className="py-2 px-3 text-right">Đã nhận (Tấn)</th>
                      <th className="py-2 px-3 text-right">Còn lại (Tấn)</th>
                      <th className="py-2 px-3">Ngày ETA</th>
                      <th className="py-2 px-3 text-center">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.openPos.map((po, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-mono font-medium text-emerald-700">{po.poNumber}</td>
                        <td className="py-2 px-3 text-slate-700">{po.supplierName}</td>
                        <td className="py-2 px-3 text-right font-mono">{formatTons(po.orderedQtyKg, true)}</td>
                        <td className="py-2 px-3 text-right font-mono text-slate-500">{formatTons(po.deliveredQtyKg, true)}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">{formatTons(po.remainQtyTons)}</td>
                        <td className="py-2 px-3 text-slate-600">{formatDate(po.etaDate)}</td>
                        <td className="py-2 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
                            {po.status || 'PENDING'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-xs text-slate-500 bg-slate-50 p-4 rounded-lg text-center border border-slate-200">
                Hiện không có PO mở nào cho cặp nguyên liệu này.
              </div>
            )}
          </div>
        </div>
      ))}

      {activeTab === 'projection' && (
        loadingProjection ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            <span className="text-xs text-slate-500 font-medium">
              Đang tính toán mô phỏng dự phóng 28 ngày và sinh đề xuất giao hàng (BR-34, BR-36)...
            </span>
          </div>
        ) : !projection ? (
          <div className="text-xs text-slate-500 bg-slate-50 p-8 rounded-lg text-center border border-slate-200">
            Không tải được dữ liệu dự phóng 28 ngày của cặp nguyên liệu này.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Top Milestones & Parameters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Milestone 1: Hết hàng */}
              <div className="bg-red-50/70 border border-red-200 rounded-xl p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-red-700 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Mốc Dự kiến Hết hàng
                  </span>
                  <span className="text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-mono font-semibold">
                    tồn &lt; 0
                  </span>
                </div>
                <div className="text-base font-bold font-mono text-red-900 mt-2">
                  {(projectionTier === 'tier1'
                    ? projection.milestones.tier1StockoutDate
                    : projection.milestones.tier2StockoutDate)
                    ? formatDate(
                        projectionTier === 'tier1'
                          ? projection.milestones.tier1StockoutDate
                          : projection.milestones.tier2StockoutDate
                      )
                    : 'Không hết hàng (28d)'}
                </div>
                <p className="text-[10px] text-red-600/90 mt-1">
                  {projectionTier === 'tier1'
                    ? 'Chỉ tính lịch đã lên lưới'
                    : 'Đã tính các chuyến đề xuất BR-36'}
                </p>
              </div>

              {/* Milestone 2: Cần hàng về trước */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Mốc Cần hàng về trước
                  </span>
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-mono font-semibold">
                    tồn &lt; L
                  </span>
                </div>
                <div className="text-base font-bold font-mono text-amber-900 mt-2">
                  {(projectionTier === 'tier1'
                    ? projection.milestones.tier1DeliveryRequiredDate
                    : projection.milestones.tier2DeliveryRequiredDate)
                    ? formatDate(
                        projectionTier === 'tier1'
                          ? projection.milestones.tier1DeliveryRequiredDate
                          : projection.milestones.tier2DeliveryRequiredDate
                      )
                    : 'Duy trì an toàn (28d)'}
                </div>
                <p className="text-[10px] text-amber-600/90 mt-1 font-mono">
                  Khi tồn chạm ngưỡng an toàn L = {formatKg(projection.safetyStockKg)} kg
                </p>
              </div>

              {/* Milestone 3: Đặt hàng muộn nhất */}
              <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Mốc Đặt hàng muộn nhất
                  </span>
                  <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-mono font-semibold">
                    Mốc cần - LeadTime
                  </span>
                </div>
                <div className="text-base font-bold font-mono text-blue-900 mt-2">
                  {(projectionTier === 'tier1'
                    ? projection.milestones.tier1OrderDeadline
                    : projection.milestones.tier2OrderDeadline)
                    ? formatDate(
                        projectionTier === 'tier1'
                          ? projection.milestones.tier1OrderDeadline
                          : projection.milestones.tier2OrderDeadline
                      )
                    : '—'}
                </div>
                <p className="text-[10px] text-blue-600/90 mt-1">
                  Thời hạn chót gửi PO cho nhà cung cấp
                </p>
              </div>
            </div>

            {/* Thông số tính toán */}
            <div className="flex flex-wrap items-center justify-between bg-slate-50 px-4 py-2.5 rounded-lg border border-slate-200 text-xs">
              <div className="flex items-center gap-4 text-slate-600">
                <span>
                  Tiêu hao chuẩn ngày: <strong className="font-mono text-slate-900">{formatKg(projection.stdDailyKg)} kg/d</strong>
                </span>
                <span>
                  Mức an toàn L ({projection.safetyDays}d): <strong className="font-mono text-slate-900">{formatTons(projection.safetyStockKg / 1000)} tấn</strong>
                </span>
                <span>
                  Định mức 1 chuyến U (BR-36a): <strong className="font-mono text-slate-900">{formatTons(projection.unitShipmentKg / 1000)} tấn</strong>
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Ngày chốt C: {projection.snapshotDate}
              </div>
            </div>

            {/* Các chuyến giao hàng Đề xuất tự động BR-36 */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Các chuyến giao hàng đề xuất tự động (BR-36 - FIFO Open POs)</span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium">
                  {projection.suggestions.length} chuyến đề xuất
                </span>
              </div>

              {projection.suggestions && projection.suggestions.length > 0 ? (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2 px-3">Chuyến</th>
                        <th className="py-2 px-3">Ngày giao đề xuất</th>
                        <th className="py-2 px-3 text-right">Khối lượng</th>
                        <th className="py-2 px-3">Số PO Pending</th>
                        <th className="py-2 px-3">Nhà cung cấp</th>
                        <th className="py-2 px-3">Lý do đề xuất</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {projection.suggestions.map((sug) => (
                        <tr key={sug.suggestionIndex} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 font-mono font-bold text-amber-700">
                            #{sug.suggestionIndex}
                          </td>
                          <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                            {formatDate(sug.suggestDate)} (Ngày C+{sug.dayIndex})
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                            {formatTons(sug.suggestQtyTons)} tấn <span className="text-[10px] text-slate-400 font-normal">({formatKg(sug.suggestQtyKg)} kg)</span>
                          </td>
                          <td className="py-2 px-3 font-mono font-medium text-blue-700">
                            {sug.poNumber}
                          </td>
                          <td className="py-2 px-3 text-slate-700 max-w-xs truncate">
                            {sug.supplierName || '—'}
                          </td>
                          <td className="py-2 px-3 text-slate-500 text-[11px]">
                            {sug.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-xs text-emerald-700 bg-emerald-50/60 p-3.5 rounded-lg border border-emerald-200 flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Tồn kho duy trì liên tục trên mức an toàn L={formatKg(projection.safetyStockKg)} kg trong suốt 28 ngày, không cần bổ sung chuyến mới.</span>
                </div>
              )}
            </div>

            {/* Bảng Lưới Timeline 28 Ngày */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                  <Layers className="w-4 h-4 text-emerald-600" />
                  <span>Lưới diễn tiến tồn kho 28 ngày (Timeline C+1 .. C+28)</span>
                </div>

                {/* Tier Switcher */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setProjectionTier('tier2')}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                      projectionTier === 'tier2'
                        ? 'bg-white text-emerald-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>Tầng 2: Có đề xuất BR-36</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProjectionTier('tier1')}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                      projectionTier === 'tier1'
                        ? 'bg-white text-slate-800 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Package className="w-3 h-3" />
                    <span>Tầng 1: Đã lên lịch</span>
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0 z-10 shadow-xs">
                    <tr>
                      <th className="py-2 px-3">Ngày</th>
                      <th className="py-2 px-3">Thứ</th>
                      <th className="py-2 px-3 text-right">Tiêu hao d</th>
                      <th className="py-2 px-3 text-right">Lượng về</th>
                      <th className="py-2 px-3 text-right">Tồn cuối ngày</th>
                      <th className="py-2 px-3 text-center">DOI ngày</th>
                      <th className="py-2 px-3 text-center">Mức cảnh báo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {projection.timeline.map((item) => {
                      const metric = projectionTier === 'tier1' ? item.tier1 : item.tier2;
                      const isNegative = metric.closingStockKg < 0;
                      return (
                        <tr
                          key={item.dayIndex}
                          className={`${
                            item.isSunday ? 'bg-slate-50/80 font-medium' : ''
                          } ${isNegative ? 'bg-red-50/40' : ''} hover:bg-slate-100/40`}
                        >
                          <td className="py-1.5 px-3 font-mono font-medium text-slate-900">
                            {formatDate(item.date)} <span className="text-[10px] text-slate-400">({item.dayIndex}d)</span>
                          </td>
                          <td className={`py-1.5 px-3 text-[11px] ${item.isSunday ? 'text-rose-600 font-semibold' : 'text-slate-600'}`}>
                            {item.dayName}
                          </td>
                          <td className="py-1.5 px-3 text-right font-mono text-slate-500">
                            {formatKg(item.dailyDemandKg)} kg
                          </td>
                          <td className="py-1.5 px-3 text-right font-mono font-semibold text-emerald-700">
                            {metric.inboundKg > 0 ? `${formatTons(metric.inboundTons)} tấn` : '—'}
                          </td>
                          <td className={`py-1.5 px-3 text-right font-mono font-bold ${
                            isNegative ? 'text-red-600' : 'text-slate-900'
                          }`}>
                            {formatTons(metric.closingStockTons)} tấn <span className="text-[10px] font-normal text-slate-400">({formatKg(metric.closingStockKg)} kg)</span>
                          </td>
                          <td className="py-1.5 px-3 text-center font-mono font-bold">
                            {metric.doi !== null ? `${metric.doi.toFixed(1)}d` : '—'}
                          </td>
                          <td className="py-1.5 px-3 text-center">
                            <WarningBadge level={metric.warningLevel} short />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}
    </Modal>
  );
};
