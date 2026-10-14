import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { formatTons, formatDate } from '../utils/formatters';
import { deliveryPlansApi, PlanItemPayload } from '../api/delivery-plans.api';
import { catalogApi } from '../api/catalog.api';
import { useAuth } from '../context/AuthContext';
import { PoOption } from '../types';
import {
  Calendar,
  Save,
  Sparkles,
  Plus,
  AlertTriangle,
  RotateCw,
  Truck,
  CheckCircle2,
  Trash2,
} from 'lucide-react';

interface LocalPlanRow {
  id: string;
  materialId: number;
  materialCode: string;
  materialName: string;
  supplierId: number;
  supplierName: string;
  poNumber?: string;
  dayPlans: Record<string, { planQtyTons: number; receivedQtyTons: number }>;
}

export const DeliveryPlanPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('delivery-plan.edit');

  // Week start: default to Monday of current or sample test week
  const [weekStartDate, setWeekStartDate] = useState('2026-10-05');
  const [selectedFactoryId, setSelectedFactoryId] = useState<number>(1);
  const [factories, setFactories] = useState<Array<{ id: number; code: string; name: string }>>([
    { id: 1, code: 'DN', name: 'Đồng Nai (DN)' },
    { id: 2, code: 'BD', name: 'Bình Dương (BD)' },
    { id: 3, code: 'VL2', name: 'Vĩnh Long 2 (VL2)' },
    { id: 4, code: 'HG', name: 'Hậu Giang (HG)' },
    { id: 5, code: 'BD1', name: 'Bình Định 1 (BD1)' },
    { id: 6, code: 'BD2', name: 'Bình Định 2 (BD2)' },
  ]);

  const [materials, setMaterials] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [poOptions, setPoOptions] = useState<PoOption[]>([]);

  const [rows, setRows] = useState<LocalPlanRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Add row modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newMaterialId, setNewMaterialId] = useState<number | ''>('');
  const [newSupplierId, setNewSupplierId] = useState<number | ''>('');
  const [newPoNumber, setNewPoNumber] = useState<string>('');

  // JRP Consolidation modal & state
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [isConsolidationModalOpen, setIsConsolidationModalOpen] = useState(false);
  const [consolidatedData, setConsolidatedData] = useState<any | null>(null);

  // 7 days dates array
  const weekDates = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(weekStartDate);
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });

  const dayLabels = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];

  // Load catalog dropdowns on mount
  useEffect(() => {
    catalogApi.getDropdowns().then((data) => {
      if (data?.factories) {
        setFactories(data.factories.map((f: any) => ({ id: f.factoryId, code: f.factoryCode, name: f.factoryName })));
      }
      if (data?.materials) {
        setMaterials(data.materials.map((m: any) => ({ id: m.materialId, code: m.materialCode, name: m.materialName })));
      }
      if (data?.suppliers) {
        setSuppliers(data.suppliers.map((s: any) => ({ id: s.supplierId, code: s.supplierCode, name: s.supplierName })));
      }
    }).catch(console.error);
  }, []);

  // Fetch week plan
  const fetchWeekPlan = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      const data = await deliveryPlansApi.getWeekPlan(weekStartDate, selectedFactoryId);
      const serverRows = data?.rows || data?.items || [];

      // Transform server data into local editable rows
      const mapped: LocalPlanRow[] = serverRows.map((r: any, idx: number) => {
        const dayMap: Record<string, { planQtyTons: number; receivedQtyTons: number }> = {};
        weekDates.forEach((d) => {
          const dayInfo = r.days?.[d];
          dayMap[d] = {
            planQtyTons: dayInfo?.planQtyTons ?? 0,
            receivedQtyTons: dayInfo?.receivedQtyTons ?? 0,
          };
        });

        return {
          id: `${r.materialId}_${r.supplierId}_${r.poNumber || 'NO_PO'}_${idx}`,
          materialId: r.materialId,
          materialCode: r.materialCode,
          materialName: r.materialName,
          supplierId: r.supplierId,
          supplierName: r.supplierName,
          poNumber: r.poNumber,
          dayPlans: dayMap,
        };
      });

      setRows(mapped);
    } catch (err: any) {
      console.error('Failed to load week delivery plan:', err);
      setErrorMessage(err.response?.data?.message || 'Không thể tải kế hoạch giao hàng tuần');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedFactoryId && weekStartDate) {
      fetchWeekPlan();
    }
  }, [selectedFactoryId, weekStartDate]);

  // Handle plan quantity input change
  const handleQtyChange = (rowId: string, dateStr: string, tons: number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        return {
          ...r,
          dayPlans: {
            ...r.dayPlans,
            [dateStr]: {
              ...r.dayPlans[dateStr],
              planQtyTons: Math.max(0, tons),
            },
          },
        };
      })
    );
  };

  // Save week plan
  const handleSavePlan = async () => {
    if (!canEdit) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      const plansPayload: PlanItemPayload[] = [];

      rows.forEach((r) => {
        weekDates.forEach((d) => {
          const qty = r.dayPlans[d]?.planQtyTons || 0;
          if (qty > 0) {
            plansPayload.push({
              planDate: d,
              materialId: r.materialId,
              supplierId: r.supplierId,
              poNumber: r.poNumber || undefined,
              planQtyTons: qty,
            });
          }
        });
      });

      await deliveryPlansApi.saveWeekPlan({
        weekStartDate,
        factoryId: selectedFactoryId,
        plans: plansPayload,
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
      fetchWeekPlan();
    } catch (err: any) {
      console.error('Failed to save plan:', err);
      setErrorMessage(err.response?.data?.message || 'Lỗi khi lưu kế hoạch giao hàng tuần.');
    } finally {
      setIsSaving(false);
    }
  };

  // Suggest draft plan (BR-36)
  const handleSuggest = async () => {
    setIsLoading(true);
    try {
      const suggested = await deliveryPlansApi.getSuggestions(weekStartDate, selectedFactoryId);
      if (suggested && suggested.length > 0) {
        fetchWeekPlan();
      }
    } catch (err: any) {
      console.error('Failed to get suggestions:', err);
      setErrorMessage(err.response?.data?.message || 'Không thể sinh đề xuất lịch giao.');
    } finally {
      setIsLoading(false);
    }
  };

  // Gom chuyến xe tải theo Nhà Cung Cấp (JRP Consolidation - BR-36b)
  const handleConsolidateJrp = async () => {
    setIsConsolidating(true);
    setErrorMessage(null);
    try {
      const result = await deliveryPlansApi.getSuggestions(weekStartDate, selectedFactoryId, undefined, true);
      if (result && result.consolidated) {
        setConsolidatedData(result);
        setIsConsolidationModalOpen(true);
      } else {
        setErrorMessage('Không có đủ dữ liệu nhu cầu để sinh chuyến xe gom.');
      }
    } catch (err: any) {
      console.error('Failed to run JRP consolidation:', err);
      setErrorMessage(err.response?.data?.message || 'Lỗi khi thực thi thuật toán ghép chuyến FTL.');
    } finally {
      setIsConsolidating(false);
    }
  };

  // Áp dụng các chuyến xe gom FTL vào bảng lưới tuần hiện tại
  const handleApplyConsolidationToGrid = () => {
    if (!consolidatedData?.suggestedPlans || consolidatedData.suggestedPlans.length === 0) {
      setIsConsolidationModalOpen(false);
      return;
    }

    setRows((prev) => {
      const next = [...prev];
      for (const sp of consolidatedData.suggestedPlans) {
        const poKey = sp.poNumber || 'NO_PO';
        let targetRow = next.find(
          (r) => r.materialId === sp.materialId && (r.poNumber || 'NO_PO') === poKey
        );

        if (!targetRow) {
          const dayMap: Record<string, { planQtyTons: number; receivedQtyTons: number }> = {};
          weekDates.forEach((d) => {
            dayMap[d] = { planQtyTons: 0, receivedQtyTons: 0 };
          });
          targetRow = {
            id: `${sp.materialId}_${sp.supplierId}_${poKey}_${Date.now()}_${Math.random()}`,
            materialId: sp.materialId,
            materialCode: sp.materialCode,
            materialName: sp.materialName,
            supplierId: sp.supplierId,
            supplierName: sp.supplierName,
            poNumber: sp.poNumber || undefined,
            dayPlans: dayMap,
          };
          next.push(targetRow);
        }

        if (targetRow.dayPlans[sp.planDate]) {
          targetRow.dayPlans[sp.planDate] = {
            ...targetRow.dayPlans[sp.planDate],
            planQtyTons: sp.planQtyTons,
          };
        }
      }
      return next;
    });

    setIsConsolidationModalOpen(false);
  };

  // Open Add Row Modal
  const handleOpenAddModal = async () => {
    setNewMaterialId('');
    setNewSupplierId('');
    setNewPoNumber('');
    setIsAddModalOpen(true);
  };

  const handleMaterialSelect = async (matId: number) => {
    setNewMaterialId(matId);
    if (matId && selectedFactoryId) {
      try {
        const opts = await deliveryPlansApi.getPoOptions(selectedFactoryId, matId);
        setPoOptions(opts || []);
      } catch (err) {
        console.error('Failed to load PO options:', err);
      }
    }
  };

  const handleConfirmAddRow = () => {
    if (!newMaterialId || !newSupplierId) return;

    const mat = materials.find((m) => m.id === newMaterialId);
    const sup = suppliers.find((s) => s.id === newSupplierId);

    const dayMap: Record<string, { planQtyTons: number; receivedQtyTons: number }> = {};
    weekDates.forEach((d) => {
      dayMap[d] = { planQtyTons: 0, receivedQtyTons: 0 };
    });

    const newRow: LocalPlanRow = {
      id: `${newMaterialId}_${newSupplierId}_${newPoNumber || 'NO_PO'}_${Date.now()}`,
      materialId: Number(newMaterialId),
      materialCode: mat?.code || '',
      materialName: mat?.name || '',
      supplierId: Number(newSupplierId),
      supplierName: sup?.name || '',
      poNumber: newPoNumber || undefined,
      dayPlans: dayMap,
    };

    setRows((prev) => [...prev, newRow]);
    setIsAddModalOpen(false);
  };

  const handleDeleteRow = (rowId: string) => {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  return (
    <div>
      <PageHeader
        title="Kế Hoạch Giao Hàng Tuần & Đối Chiếu Thực Nhận POR (F07)"
        subtitle="Quản lý lịch giao nguyên liệu từ Thứ 2 đến Chủ Nhật, đối chiếu thực nhận từ phiếu POR, cảnh báo Over-PO mềm (BR-26b, BR-26d)"
        breadcrumbs={[{ label: 'PremixTrack' }, { label: 'Kế hoạch giao hàng' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSuggest}
              leftIcon={<Sparkles className="w-3.5 h-3.5 text-amber-500" />}
            >
              Đề xuất lịch giao (BR-36)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleConsolidateJrp}
              isLoading={isConsolidating}
              leftIcon={<Truck className="w-3.5 h-3.5 text-indigo-600" />}
              className="border-indigo-300 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100/70"
            >
              Gom chuyến FTL (JRP)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenAddModal}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              Thêm dòng
            </Button>
            {canEdit && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleSavePlan}
                isLoading={isSaving}
                leftIcon={<Save className="w-3.5 h-3.5" />}
              >
                Lưu kế hoạch tuần
              </Button>
            )}
          </div>
        }
      />

      {/* Control Ribbon: Week picker & Factory selector */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Factory Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Nhà máy tác nghiệp</label>
            <select
              value={selectedFactoryId}
              onChange={(e) => setSelectedFactoryId(Number(e.target.value))}
              className="py-1.5 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
            >
              {factories.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Week Date Picker */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
              Tuần lễ (Bắt đầu từ Thứ 2)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={weekStartDate}
                onChange={(e) => setWeekStartDate(e.target.value)}
                className="py-1.5 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
              />
              <span className="text-xs text-slate-500 font-medium">
                đến {formatDate(weekDates[6])}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={fetchWeekPlan}
          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
          title="Tải lại lưới tuần"
        >
          <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Notifications */}
      {saveSuccess && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Lưu thành công toàn bộ lưới kế hoạch tuần vào CSDL trong 1 Transaction nguyên tử!</span>
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2.5 animate-in fade-in">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 7-Day Interactive Delivery Grid */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[11px]">
                <th className="py-3 px-4 w-48">Nguyên liệu</th>
                <th className="py-3 px-3 w-40">Nhà cung cấp</th>
                <th className="py-3 px-3 w-28 text-center">Số PO</th>
                {weekDates.map((d, i) => (
                  <th key={d} className="py-3 px-2 text-center border-l border-slate-200 min-w-[90px]">
                    <div>{dayLabels[i]}</div>
                    <div className="text-[10px] text-slate-400 font-normal font-mono">{formatDate(d)}</div>
                  </th>
                ))}
                <th className="py-3 px-3 text-right border-l border-slate-200 w-28">Tổng Tuần (Tấn)</th>
                {canEdit && <th className="py-3 px-2 text-center w-12">Xóa</th>}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, rIdx) => (
                  <tr key={rIdx} className="animate-pulse">
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded-md w-3/4" /></td>
                    <td className="py-3 px-3"><div className="h-4 bg-slate-200 rounded-md w-1/2" /></td>
                    <td className="py-3 px-3"><div className="h-4 bg-slate-200 rounded-md w-16 mx-auto" /></td>
                    {Array.from({ length: 7 }).map((_, cIdx) => (
                      <td key={cIdx} className="py-3 px-2 border-l border-slate-100">
                        <div className="h-8 bg-slate-200 rounded-md" />
                      </td>
                    ))}
                    <td className="py-3 px-3 border-l border-slate-100"><div className="h-4 bg-slate-200 rounded-md w-16 ml-auto" /></td>
                    {canEdit && <td className="py-3 px-2" />}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 12 : 11} className="py-12 text-center text-slate-400 font-medium">
                    Chưa có dòng kế hoạch nào cho tuần này. Bấm "Thêm dòng" hoặc "Đề xuất lịch giao" để bắt đầu.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  let totalPlan = 0;
                  let totalRecv = 0;

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-slate-900">{row.materialName}</div>
                        <div className="text-[10px] font-mono text-slate-400">{row.materialCode}</div>
                      </td>

                      <td className="py-2.5 px-3 text-slate-700">
                        <div className="truncate max-w-[150px]">{row.supplierName}</div>
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        {row.poNumber ? (
                          <span className="font-mono text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            {row.poNumber}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Không có PO</span>
                        )}
                      </td>

                      {/* 7 Day cells */}
                      {weekDates.map((d) => {
                        const dayData = row.dayPlans[d] || { planQtyTons: 0, receivedQtyTons: 0 };
                        totalPlan += dayData.planQtyTons;
                        totalRecv += dayData.receivedQtyTons;

                        const variance = dayData.planQtyTons - dayData.receivedQtyTons;

                        return (
                          <td key={d} className="py-2 px-1.5 border-l border-slate-100 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {/* Plan editable input */}
                              <input
                                type="number"
                                step="0.001"
                                min="0"
                                disabled={!canEdit}
                                value={dayData.planQtyTons === 0 ? '' : dayData.planQtyTons}
                                onChange={(e) =>
                                  handleQtyChange(row.id, d, parseFloat(e.target.value) || 0)
                                }
                                placeholder="0"
                                className={`w-16 py-1 px-1.5 text-center text-xs font-mono font-semibold rounded-md border transition-colors ${
                                  dayData.planQtyTons > 0
                                    ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900 font-bold'
                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                                } focus:outline-hidden focus:ring-1 focus:ring-emerald-500`}
                              />

                              {/* POR Received actual display if exists */}
                              {dayData.receivedQtyTons > 0 && (
                                <div className="text-[10px] font-mono text-blue-700 font-semibold" title="Thực nhận từ phiếu POR">
                                  Nhận: {formatTons(dayData.receivedQtyTons)} t
                                </div>
                              )}

                              {/* Day Variance */}
                              {dayData.planQtyTons > 0 && dayData.receivedQtyTons > 0 && (
                                <div
                                  className={`text-[9px] font-mono font-medium ${
                                    variance > 0
                                      ? 'text-amber-600'
                                      : variance < 0
                                      ? 'text-purple-600'
                                      : 'text-emerald-600'
                                  }`}
                                >
                                  {variance > 0 ? `Thiếu: ${formatTons(variance)}` : `Dư: ${formatTons(Math.abs(variance))}`}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}

                      {/* Total Week Column */}
                      <td className="py-2.5 px-3 border-l border-slate-200 text-right">
                        <div className="font-mono font-bold text-slate-900 text-xs">
                          {formatTons(totalPlan)} t
                        </div>
                        {totalRecv > 0 && (
                          <div className="font-mono text-[10px] text-blue-600">
                            Nhận: {formatTons(totalRecv)} t
                          </div>
                        )}
                      </td>

                      {/* Delete action */}
                      {canEdit && (
                        <td className="py-2.5 px-2 text-center">
                          <button
                            onClick={() => handleDeleteRow(row.id)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            title="Xóa dòng này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Plan Row Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Thêm Dòng Kế Hoạch Giao Hàng"
        subtitle="Chọn Nguyên liệu, Nhà cung cấp và Số PO còn mở"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsAddModalOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!newMaterialId || !newSupplierId}
              onClick={handleConfirmAddRow}
            >
              Thêm vào lưới
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Nguyên liệu (*)</label>
            <select
              value={newMaterialId}
              onChange={(e) => handleMaterialSelect(Number(e.target.value))}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
            >
              <option value="">-- Chọn nguyên liệu --</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} - {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Nhà cung cấp (*)</label>
            <select
              value={newSupplierId}
              onChange={(e) => setNewSupplierId(Number(e.target.value))}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
            >
              <option value="">-- Chọn nhà cung cấp --</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} - {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Số PO còn mở (Tùy chọn)</label>
            <select
              value={newPoNumber}
              onChange={(e) => setNewPoNumber(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
            >
              <option value="">-- Giao không theo PO (hoặc bổ sung sau) --</option>
              {poOptions.map((po) => (
                <option key={po.poNumber} value={po.poNumber}>
                  {po.poNumber} (Còn lại: {formatTons(po.deliverRemainderTons)} tấn)
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
      {/* Modal Đề Xuất Gom Chuyến Xe Tải FTL Theo Nhà Cung Cấp (JRP BR-36b) */}
      <Modal
        isOpen={isConsolidationModalOpen}
        onClose={() => setIsConsolidationModalOpen(false)}
        title="Thuật Toán Ghép Chuyến Xe Tải FTL Theo NCC (JRP - BR-36b)"
        subtitle="Tối ưu hóa chi phí vận chuyển bằng cách gộp các mã nguyên liệu cùng nhà cung cấp theo định mức tải trọng xe và quy cách bao"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-slate-500 italic">
              * Tuyệt đối không xếp giao vào Chủ Nhật (Sunday Ban - BR-36)
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsConsolidationModalOpen(false)}>
                Đóng
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleApplyConsolidationToGrid}
                leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Áp dụng vào lưới tuần
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Summary KPIs Banner */}
          {consolidatedData?.summary && (
            <div className="grid grid-cols-4 gap-3 bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-100">
              <div className="text-center border-r border-indigo-200/60">
                <span className="block text-[11px] font-medium text-indigo-700">Tổng Chuyến Xe</span>
                <span className="text-lg font-bold text-indigo-950">
                  {consolidatedData.summary.totalTrips} <span className="text-xs font-normal">chuyến</span>
                </span>
              </div>
              <div className="text-center border-r border-indigo-200/60">
                <span className="block text-[11px] font-medium text-indigo-700">Tổng Khối Lượng</span>
                <span className="text-lg font-bold text-indigo-950">
                  {consolidatedData.summary.totalVolumeTons} <span className="text-xs font-normal">tấn</span>
                </span>
              </div>
              <div className="text-center border-r border-indigo-200/60">
                <span className="block text-[11px] font-medium text-indigo-700">Lấp Đầy Bình Quân</span>
                <span className="text-lg font-bold text-emerald-700">
                  {consolidatedData.summary.averageFillRatePct}%
                </span>
              </div>
              <div className="text-center">
                <span className="block text-[11px] font-medium text-indigo-700">Chuyến Tiết Kiệm</span>
                <span className="text-lg font-bold text-indigo-600">
                  +{consolidatedData.summary.tripsSavedCount} <span className="text-xs font-normal">chuyến</span>
                </span>
              </div>
            </div>
          )}

          {/* Trips List */}
          {consolidatedData?.trips && consolidatedData.trips.length > 0 ? (
            <div className="space-y-3">
              {consolidatedData.trips.map((trip: any) => (
                <div
                  key={trip.tripId}
                  className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs hover:border-indigo-300 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200">
                        {trip.truckloadTier} ({trip.truckCapacityKg / 1000}T)
                      </span>
                      <span className="font-semibold text-slate-900 text-xs">{trip.tripId}</span>
                      <span className="text-slate-400">•</span>
                      <span className="text-xs text-slate-600 font-medium">{trip.supplierName}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold text-slate-800">
                        {trip.dayName} ({trip.planDate})
                      </span>
                    </div>
                  </div>

                  {/* Fill rate progress bar */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-slate-500">Tải trọng: {trip.totalTripTons} / {trip.truckCapacityKg / 1000} tấn</span>
                      <span className={`font-bold ${trip.fillRatePct >= 85 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {trip.fillRatePct}% Đầy tải
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          trip.fillRatePct >= 85 ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, trip.fillRatePct)}%` }}
                      />
                    </div>
                  </div>

                  {/* Items Table */}
                  <div className="overflow-x-auto rounded-lg border border-slate-100">
                    <table className="w-full text-[11px] text-left">
                      <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-100 font-semibold">
                        <tr>
                          <th className="py-1 px-2.5">Mã NL</th>
                          <th className="py-1 px-2.5">Tên Nguyên Liệu</th>
                          <th className="py-1 px-2.5 text-right">Khối Lượng</th>
                          <th className="py-1 px-2.5 text-right">Quy Cách</th>
                          <th className="py-1 px-2.5">Số PO</th>
                          <th className="py-1 px-2.5">Phân Loại JRP</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {trip.items.map((it: any, itIdx: number) => (
                          <tr key={itIdx} className="hover:bg-slate-50/50">
                            <td className="py-1.5 px-2.5 font-mono text-slate-600">{it.materialCode}</td>
                            <td className="py-1.5 px-2.5 font-medium text-slate-900">{it.materialName}</td>
                            <td className="py-1.5 px-2.5 text-right font-bold text-slate-800">
                              {it.planQtyTons} tấn <span className="font-normal text-slate-400">({it.planQtyKg.toLocaleString()} kg)</span>
                            </td>
                            <td className="py-1.5 px-2.5 text-right text-slate-600">
                              {it.bagCount > 0 ? `${it.bagCount} bao` : 'Hàng xá'}
                            </td>
                            <td className="py-1.5 px-2.5 text-slate-600 font-mono">
                              {it.poNumber || <span className="text-slate-400 italic">Chưa gán</span>}
                            </td>
                            <td className="py-1.5 px-2.5">
                              {it.isMustOrder ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                  Cạn hàng (Must)
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Gom tải (Can-Order)
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 text-xs">
              Không có chuyến xe nào cần gom trong tuần này.
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
