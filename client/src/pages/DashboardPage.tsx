import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { MetricCard } from '../components/common/MetricCard';
import { WarningBadge } from '../components/common/WarningBadge';
import { PositionDetailModal } from '../components/positions/PositionDetailModal';
import { formatTons, formatKg, formatDate } from '../../src/utils/formatters';
import { dashboardApi } from '../api/dashboard.api';
import { useAuth } from '../context/AuthContext';
import { DashboardSummary, DashboardMatrixData, PositionItem, WarningLevel } from '../types';
import {
  Package,
  AlertOctagon,
  AlertTriangle,
  Lock,
  Truck,
  RotateCw,
  TrendingDown,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { selectedFactory } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [matrixData, setMatrixData] = useState<DashboardMatrixData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPosition, setSelectedPosition] = useState<PositionItem | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const factId = selectedFactory === 'ALL' ? undefined : selectedFactory;
      const [sumRes, matRes] = await Promise.all([
        dashboardApi.getSummary(factId),
        dashboardApi.getMatrix(),
      ]);
      setSummary(sumRes);
      setMatrixData(matRes);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedFactory]);

  return (
    <div>
      <PageHeader
        title="Bảng Điều Khiển Tổng Quan (Executive Dashboard)"
        subtitle={`Theo dõi chỉ số tồn kho, mức DOI và ma trận sức khỏe 6 nhà máy | Ngày chốt: ${
          summary?.cutoffDate ? formatDate(summary.cutoffDate) : 'Hôm nay'
        }`}
        breadcrumbs={[{ label: 'PremixTrack' }, { label: 'Tổng quan' }]}
        actions={
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
        }
      />

      {/* KPI Metrics Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <MetricCard
          title="Tồn khả dụng SOH"
          valueTons={formatTons(summary?.totalEffectiveStockTons ?? 0)}
          subValueKg={formatKg(summary?.totalEffectiveStockKg ?? 0)}
          icon={<Package className="w-5 h-5" />}
          variant="default"
          trend={{ label: 'Tổng toàn mạng lưới' }}
          onClick={() => navigate('/positions')}
        />

        <MetricCard
          title="Nguy cấp (DOI < 7)"
          valueTons={summary?.criticalPairsCount ?? 0}
          unit="cặp"
          icon={<AlertOctagon className="w-5 h-5" />}
          variant="critical"
          trend={{ label: 'Cần đặt mua ngay' }}
          onClick={() => navigate('/purchase-requests')}
        />

        <MetricCard
          title="Cảnh báo (7 ≤ DOI ≤ 15)"
          valueTons={summary?.warningPairsCount ?? 0}
          unit="cặp"
          icon={<AlertTriangle className="w-5 h-5" />}
          variant="warning"
          trend={{ label: 'Chuẩn bị kế hoạch' }}
          onClick={() => navigate('/positions?warningLevel=WARNING')}
        />

        <MetricCard
          title="Tồn bị khóa"
          valueTons={formatTons(summary?.totalBlockedStockTons ?? 0)}
          subValueKg={formatKg(summary?.totalBlockedStockKg ?? 0)}
          icon={<Lock className="w-5 h-5" />}
          variant="purple"
          trend={{ label: 'Đang giữ chất lượng' }}
          onClick={() => navigate('/blocks')}
        />

        <MetricCard
          title="PO Đang về"
          valueTons={formatTons(summary?.totalOpenPoTons ?? 0)}
          subValueKg={formatKg(summary?.totalOpenPoKg ?? 0)}
          icon={<Truck className="w-5 h-5" />}
          variant="success"
          trend={{ label: 'Hàng trên đường' }}
          onClick={() => navigate('/delivery-plan')}
        />
      </div>

      {/* Urgent Alert Banner if critical pairs exist */}
      {(summary?.criticalPairsCount ?? 0) > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-red-600 shrink-0">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-red-900">
                Cảnh báo nguy cấp: Phát hiện {summary?.criticalPairsCount} cặp nguyên liệu có mức tồn dưới 7 ngày!
              </h4>
              <p className="text-[11px] text-red-700 mt-0.5">
                Các nhà máy có nguy cơ đứt hàng sản xuất trong tuần tới. Vui lòng kiểm tra tab Gợi ý mua hàng (BR-25).
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/purchase-requests')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors shrink-0 shadow-2xs"
          >
            <span>Tạo đề nghị mua ngay</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 6-Mill Matrix Heatmap Section */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs p-6 mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              <span>Ma Trận Sức Khỏe Tồn Kho 6 Nhà Máy (Heatmap Matrix - F05)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              So sánh trực quan mức an toàn tồn kho (DOI) giữa 6 nhà máy sản xuất theo từng mã nguyên liệu
            </p>
          </div>

          {/* Warning Level Legend */}
          <div className="flex flex-wrap items-center gap-2">
            <WarningBadge level="CRITICAL" short />
            <WarningBadge level="WARNING" short />
            <WarningBadge level="BALANCED" short />
            <WarningBadge level="OVERSTOCK" short />
            <WarningBadge level="NO_DEMAND" short />
          </div>
        </div>

        {/* Matrix Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[11px]">
                <th className="py-3 px-4 w-64">Nguyên liệu</th>
                {matrixData?.factories?.map((fact) => (
                  <th key={fact.code} className="py-3 px-3 text-center border-l border-slate-200">
                    <span className="font-bold text-slate-900">{fact.code}</span>
                    <span className="block text-[10px] text-slate-400 font-normal">{fact.name}</span>
                  </th>
                )) || (
                  <>
                    <th className="py-3 px-3 text-center border-l border-slate-200">DN</th>
                    <th className="py-3 px-3 text-center border-l border-slate-200">BD</th>
                    <th className="py-3 px-3 text-center border-l border-slate-200">VL2</th>
                    <th className="py-3 px-3 text-center border-l border-slate-200">HG</th>
                    <th className="py-3 px-3 text-center border-l border-slate-200">BD1</th>
                    <th className="py-3 px-3 text-center border-l border-slate-200">BD2</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, rIdx) => (
                  <tr key={rIdx} className="animate-pulse">
                    <td className="py-3 px-4">
                      <div className="h-4 bg-slate-200 rounded-md w-3/4" />
                    </td>
                    {Array.from({ length: 6 }).map((_, cIdx) => (
                      <td key={cIdx} className="py-3 px-3 border-l border-slate-100">
                        <div className="h-6 bg-slate-200 rounded-md w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : matrixData?.matrix && matrixData.matrix.length > 0 ? (
                matrixData.matrix.map((row) => (
                  <tr key={row.materialId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{row.materialName}</div>
                      <div className="text-[11px] font-mono text-slate-500">{row.materialCode}</div>
                    </td>
                    {(matrixData.factories || []).map((fact) => {
                      const cell = row.mills[fact.code] || row.mills[fact.id];
                      if (!cell) {
                        return (
                          <td key={fact.code} className="py-3 px-3 text-center border-l border-slate-100 text-slate-300">
                            —
                          </td>
                        );
                      }

                      return (
                        <td
                          key={fact.code}
                          onClick={() => {
                            setSelectedPosition({
                              factoryId: cell.factoryId,
                              factoryCode: cell.factoryCode,
                              factoryName: fact.name,
                              materialId: row.materialId,
                              materialCode: row.materialCode,
                              materialName: row.materialName,
                              effectiveStockTons: cell.effectiveStockTons,
                              effectiveStockKg: cell.effectiveStockTons * 1000,
                              doiDays: cell.doiDays,
                              warningLevel: cell.warningLevel,
                              avgDailyDemandTons: cell.avgDailyDemandTons,
                              avgDailyDemandKg: cell.avgDailyDemandTons * 1000,
                              demandSource: 'ERP_FORECAST',
                            });
                          }}
                          className="py-2.5 px-3 border-l border-slate-100 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <WarningBadge level={cell.warningLevel} doi={cell.doiDays} short />
                            <span className="font-mono text-[11px] text-slate-600 font-medium">
                              {formatTons(cell.effectiveStockTons)} t
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Chưa có dữ liệu ma trận nhiệt. Hãy kiểm tra bộ nạp ERP ngày chốt.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Position Detail Drilldown Modal */}
      <PositionDetailModal
        position={selectedPosition}
        isOpen={!!selectedPosition}
        onClose={() => setSelectedPosition(null)}
      />
    </div>
  );
};
