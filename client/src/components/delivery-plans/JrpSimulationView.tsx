import React from 'react';
import { Button } from '../common/Button';
import { formatTons, formatVnd, formatDate } from '../../utils/formatters';
import {
  Truck,
  RotateCw,
  CheckCircle2,
  TrendingDown,
  Layers,
  ShieldCheck,
  DollarSign,
  BookOpen,
  ArrowRight,
  Sparkles,
  Info,
  Calendar,
} from 'lucide-react';

interface JrpSimulationViewProps {
  data: any | null;
  isLoading: boolean;
  onRefresh: () => void;
  onApplyToGrid: () => void;
  canEdit: boolean;
}

export const JrpSimulationView: React.FC<JrpSimulationViewProps> = ({
  data,
  isLoading,
  onRefresh,
  onApplyToGrid,
  canEdit,
}) => {
  const summary = data?.summary;
  const costAnalysis = data?.costAnalysis;
  const trips = data?.trips || [];

  return (
    <div className="space-y-6">
      {/* 1. Academic Theory Banner: Joint Replenishment Problem (JRP) & Can-Order (s, c, S) */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white p-6 shadow-md border border-indigo-700/50">
        <div className="absolute top-0 right-0 -mt-6 -mr-6 w-56 h-56 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 relative z-10">
          <div className="space-y-3 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/30 text-indigo-300 border border-indigo-400/30">
                Nghiên Cứu Mở Rộng • Academic Simulation
              </span>
              <span className="text-indigo-400/80 text-xs">|</span>
              <span className="text-indigo-300 text-xs font-mono font-medium">Balintfy (1964) • Silver (1981)</span>
            </div>

            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
              <BookOpen className="w-5 h-5 text-indigo-400" />
              Mô Hình Bổ Sung Kết Hợp (Joint Replenishment Problem - JRP) với Chính Sách Can-Order (s, c, S)
            </h2>

            <p className="text-xs text-indigo-200/90 leading-relaxed">
              Giải quyết bài toán gom chuyến xe tải đầy tải (Full Truckload - FTL) cho nhiều mặt hàng từ cùng một nhà cung cấp. 
              Mô hình tận dụng điểm chạm ngưỡng an toàn của một nguyên liệu để làm "đầu kéo" (trigger) mở chuyến xe, đồng thời gom thêm 
              các mã nguyên liệu khác đang nằm trong vùng cơ hội nhằm tối đa hóa tỷ lệ lấp đầy xe và chia sẻ chi phí vận chuyển cố định.
            </p>

            {/* Objective Function Formula */}
            <div className="bg-slate-950/60 border border-indigo-800/60 rounded-xl p-3.5 backdrop-blur-xs font-mono text-[11px] text-indigo-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div>
                <span className="text-indigo-400 font-semibold block mb-0.5">Hàm Mục Tiêu Tối Thiểu Hóa Tổng Chi Phí (Objective Function):</span>
                <span className="text-amber-300 font-bold">
                  min Z = ∑<sub>t∈Trips</sub> K<sub>trip</sub>(t) + ∑<sub>i</sub> ∑<sub>t</sub> k<sub>i</sub> · Y<sub>it</sub> + ∑<sub>i</sub> h<sub>i</sub> · Ī<sub>i</sub>
                </span>
              </div>
              <div className="text-[10px] text-indigo-300/80 md:text-right border-t md:border-t-0 md:border-l border-indigo-800/60 pt-2 md:pt-0 md:pl-3">
                <div><strong className="text-white">K<sub>trip</sub>:</strong> Chi phí cố định điều xe (900k - 3tr/chuyến)</div>
                <div><strong className="text-white">k<sub>i</sub>:</strong> Chi phí thủ tục bổ sung từng mã NL</div>
              </div>
            </div>
          </div>

          {/* Action buttons on banner */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              isLoading={isLoading}
              leftIcon={<RotateCw className="w-3.5 h-3.5 text-indigo-300" />}
              className="border-indigo-400/40 text-indigo-100 hover:bg-white/10 hover:text-white"
            >
              Chạy Lại Mô Phỏng
            </Button>
            {canEdit && trips.length > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={onApplyToGrid}
                leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/50 shadow-md font-semibold"
              >
                Áp Dụng Vào Lưới Tuần
              </Button>
            )}
          </div>
        </div>

        {/* 3 Pillars of Can-Order Policy */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5 pt-4 border-t border-indigo-800/40 text-xs">
          <div className="bg-indigo-900/40 rounded-lg p-3 border border-indigo-700/30">
            <div className="font-semibold text-rose-300 flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
              Ngưỡng Kích Hoạt s<sub>i</sub> (Must-Order)
            </div>
            <p className="text-[11px] text-indigo-200/80 leading-normal">
              Khi tồn kho I<sub>i</sub> ≤ L<sub>i</sub> (ngưỡng an toàn), mã này kích hoạt chuyến xe mới làm "đầu kéo" (Trigger Item), bắt buộc phải giao ngay để tránh đứt gãy sản xuất.
            </p>
          </div>

          <div className="bg-indigo-900/40 rounded-lg p-3 border border-indigo-700/30">
            <div className="font-semibold text-emerald-300 flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Ngưỡng Cơ Hội c<sub>i</sub> (Can-Order)
            </div>
            <p className="text-[11px] text-indigo-200/80 leading-normal">
              Khi một chuyến xe được mở, các mã cùng NCC có tồn kho I<sub>i</sub> ≤ L<sub>i</sub> + 7d<sub>i</sub> được gom thêm vào xe để san sẻ chi phí cố định K<sub>trip</sub>.
            </p>
          </div>

          <div className="bg-indigo-900/40 rounded-lg p-3 border border-indigo-700/30">
            <div className="font-semibold text-sky-300 flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              Trần Bổ Sung S<sub>i</sub> (Order-Up-To)
            </div>
            <p className="text-[11px] text-indigo-200/80 leading-normal">
              Lượng hàng đặt lấp đầy tải trọng xe (15T / 30T) theo quy cách bao (bagKg) hoặc hàng xá, và tuyệt đối không bao giờ vượt trần Overstock O<sub>i</sub>.
            </p>
          </div>
        </div>

        {/* Note on Q-051 Boundary */}
        <div className="mt-4 pt-3 border-t border-indigo-800/30 flex items-center gap-2 text-[11px] text-indigo-300/80 italic">
          <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            * Phân định phạm vi: Kế hoạch vận hành thực tế tại nhà máy luôn ưu tiên tính độc lập từng cặp theo Q-051 (Tab Lưới Kế Hoạch Tuần). Mô hình JRP này là công cụ mô phỏng hỗ trợ đàm phán hợp đồng vận chuyển FTL tối ưu chi phí.
          </span>
        </div>
      </div>

      {/* 2. KPI Cards: Cost Savings & Logistics Efficiency */}
      {costAnalysis && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Cost Savings */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">Tiết Kiệm Chi Phí</span>
              <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl font-bold text-emerald-600 font-mono">
              +{formatVnd(costAnalysis.costSavingsVnd)}
            </div>
            <div className="mt-1 text-xs text-slate-500 flex items-center gap-1 font-medium">
              <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                -{costAnalysis.costSavingsPct}%
              </span>
              <span>so với kịch bản đơn lẻ</span>
            </div>
          </div>

          {/* Card 2: Trips Count */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">Số Chuyến Xe Tải</span>
              <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                <Truck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl font-bold text-slate-900 font-mono">
              {costAnalysis.consolidatedTripsCount} <span className="text-xs font-normal text-slate-500">chuyến gom</span>
            </div>
            <div className="mt-1 text-xs text-slate-500 font-medium">
              Giảm <strong className="text-indigo-600 font-bold">+{summary?.tripsSavedCount || 0} chuyến</strong> so với kịch bản rời ({costAnalysis.individualTripsCount} chuyến)
            </div>
          </div>

          {/* Card 3: Fill Rate */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">Lấp Đầy Bình Quân</span>
              <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl font-bold text-slate-900 font-mono">
              {summary?.averageFillRatePct || 0}%
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-2">
              <div
                className={`h-full rounded-full transition-all ${
                  (summary?.averageFillRatePct || 0) >= 80 ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                style={{ width: `${Math.min(100, summary?.averageFillRatePct || 0)}%` }}
              />
            </div>
          </div>

          {/* Card 4: Total Volume */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">Tổng Khối Lượng Gom</span>
              <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl font-bold text-slate-900 font-mono">
              {summary?.totalVolumeTons || 0} <span className="text-xs font-normal text-slate-500">tấn</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Định mức quy cách bao & hàng xá silo
            </div>
          </div>
        </div>
      )}

      {/* 3. Scenario Comparison Breakdown: Decentralized vs JRP Centralized */}
      {costAnalysis && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="py-3 px-4 bg-slate-50/80 border-b border-slate-200 font-semibold text-xs text-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-slate-500" />
              <span>Đối Chiếu Hiệu Quả Kinh Tế: Kịch Bản Đơn Lẻ (Rời Rạc) vs Kịch Bản Gom JRP Can-Order</span>
            </div>
            <span className="text-[11px] font-mono text-slate-500 font-normal">
              Đơn giá xe: 5T (900k) • 10T (1.4tr) • 15T (1.8tr) • 30T (3tr)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 text-xs">
            {/* Left: Standalone Scenario */}
            <div className="p-4 space-y-3 bg-rose-50/20">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                  Kịch Bản Đơn Lẻ (Decentralized / Standalone)
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-700">
                  Truyền thống
                </span>
              </div>
              <p className="text-slate-600 text-[11px]">
                Mỗi khi một mã nguyên liệu cạn chạm ngưỡng an toàn thì điều một xe tải riêng lẻ đến nhà máy. Dẫn đến nhiều chuyến xe nửa tải (LTL), lãng phí chi phí cầu đường, nhiên liệu và bến bãi.
              </p>
              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                <span className="text-slate-600">Số chuyến xe dự kiến:</span>
                <span className="font-mono font-bold text-slate-900">{costAnalysis.individualTripsCount} chuyến</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Tổng chi phí vận tải ước tính:</span>
                <span className="font-mono font-bold text-rose-700 text-sm">
                  {formatVnd(costAnalysis.individualEstimatedCostVnd)}
                </span>
              </div>
            </div>

            {/* Right: JRP Consolidated Scenario */}
            <div className="p-4 space-y-3 bg-emerald-50/20">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  Kịch Bản Gom Chuyến JRP Can-Order (Centralized)
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Tối ưu hóa đề xuất
                </span>
              </div>
              <p className="text-slate-600 text-[11px]">
                Gộp các mã nguyên liệu cùng nhà cung cấp vào xe tải 15 tấn / 30 tấn đầy tải (FTL). San sẻ chi phí cố định chuyến K<sub>trip</sub>, giảm tải trọng dư thừa và tối ưu luồng xe ra vào cổng.
              </p>
              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                <span className="text-slate-600">Số chuyến xe gom:</span>
                <span className="font-mono font-bold text-indigo-700">{costAnalysis.consolidatedTripsCount} chuyến (Tiết kiệm +{summary?.tripsSavedCount || 0} chuyến)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Tổng chi phí vận tải sau gom:</span>
                <span className="font-mono font-bold text-emerald-700 text-sm">
                  {formatVnd(costAnalysis.consolidatedCostVnd)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Trips List (Optimized FTL Truckloads) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Truck className="w-4 h-4 text-indigo-600" />
            <span>Danh Sách Các Chuyến Xe Tải Được Ghép Tối Ưu (FTL Trips)</span>
            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-xs font-semibold">
              {trips.length} chuyến
            </span>
          </h3>

          <span className="text-xs text-slate-500 italic">
            * Quy tắc tuyệt đối: Không xếp lịch giao vào Chủ Nhật (Sunday Ban - BR-36)
          </span>
        </div>

        {trips.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-xs font-medium">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center gap-2">
                <RotateCw className="w-5 h-5 animate-spin text-indigo-600" />
                <span>Đang chạy thuật toán JRP gom chuyến xe tải...</span>
              </div>
            ) : (
              'Không có chuyến xe gom nào trong tuần này. Vui lòng bấm "Chạy Lại Mô Phỏng" hoặc chọn tuần khác.'
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {trips.map((trip: any) => (
              <div
                key={trip.tripId}
                className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:border-indigo-300 transition-all"
              >
                {/* Trip Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200">
                      {trip.truckloadTier} ({trip.truckCapacityKg / 1000} Tấn)
                    </span>
                    <span className="font-bold text-slate-900 text-sm font-mono">{trip.tripId}</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-xs font-semibold text-slate-700">{trip.supplierName}</span>
                    <span className="text-[11px] font-mono text-slate-400">({trip.supplierCode})</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="text-xs font-bold text-slate-900">
                      {trip.dayName} ({formatDate(trip.planDate)})
                    </span>
                  </div>
                </div>

                {/* Progress bar fill rate */}
                <div className="mb-3.5 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-600">
                      Tải trọng thực tế: <strong>{trip.totalTripTons} tấn</strong> ({trip.totalTripKg.toLocaleString()} kg) / Dung tích xe {trip.truckCapacityKg / 1000} tấn
                    </span>
                    <span className={`font-bold font-mono ${trip.fillRatePct >= 85 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {trip.fillRatePct}% Đầy Tải (FTL)
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        trip.fillRatePct >= 85 ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(100, trip.fillRatePct)}%` }}
                    />
                  </div>
                </div>

                {/* Items in truckload */}
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold text-[11px]">
                      <tr>
                        <th className="py-2 px-3">Mã NL</th>
                        <th className="py-2 px-3">Tên Nguyên Liệu</th>
                        <th className="py-2 px-3 text-right">Khối Lượng Giao</th>
                        <th className="py-2 px-3 text-right">Quy Cách Đóng Gói</th>
                        <th className="py-2 px-3 text-center">Số PO Liên Kết</th>
                        <th className="py-2 px-3">Phân Loại JRP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {trip.items.map((it: any, itIdx: number) => (
                        <tr key={itIdx} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 font-mono font-medium text-slate-700">{it.materialCode}</td>
                          <td className="py-2 px-3 font-semibold text-slate-900">{it.materialName}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900 font-mono">
                            {formatTons(it.planQtyTons)} tấn <span className="font-normal text-slate-400 text-[11px]">({it.planQtyKg.toLocaleString()} kg)</span>
                          </td>
                          <td className="py-2 px-3 text-right text-slate-600 font-mono">
                            {it.bagCount > 0 ? (
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                                {it.bagCount.toLocaleString()} bao
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Hàng xá silo</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center font-mono">
                            {it.poNumber ? (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold">
                                {it.poNumber}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">Chưa gán PO</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            {it.isMustOrder ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                                title="Tồn cạn chạm ngưỡng an toàn L, kích hoạt mở chuyến xe"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                Must-Order (s<sub>i</sub>) • Đầu kéo
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                                title="Tồn trong vùng cơ hội [L, L + 7d], gom thêm để đầy xe FTL"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Can-Order (c<sub>i</sub>) • Gom tải
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
        )}
      </div>

      {/* Bottom Sticky Action Bar */}
      {canEdit && trips.length > 0 && (
        <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md p-4 rounded-xl border border-indigo-200 shadow-lg flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Đã tối ưu <strong>{trips.length} chuyến xe</strong> với tỷ lệ lấp đầy bình quân <strong>{summary?.averageFillRatePct}%</strong>. Bấm nút để chuyển dữ liệu vào bảng lưới tuần.
            </span>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={onApplyToGrid}
            leftIcon={<CheckCircle2 className="w-4 h-4" />}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md shrink-0"
          >
            Áp Dụng Vào Lưới Kế Hoạch Tuần (Apply to Grid)
          </Button>
        </div>
      )}
    </div>
  );
};
