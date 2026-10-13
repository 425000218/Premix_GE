import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { DataTable, Column } from '../components/common/DataTable';
import { WarningBadge } from '../components/common/WarningBadge';
import { PositionDetailModal } from '../components/positions/PositionDetailModal';
import { formatTons, formatKg, formatDate } from '../utils/formatters';
import { positionsApi } from '../api/positions.api';
import { useAuth } from '../context/AuthContext';
import { PositionItem } from '../types';
import { Eye, AlertTriangle, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const PositionsPage: React.FC = () => {
  const navigate = useNavigate();
  const { selectedFactory } = useAuth();
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWarningLevel, setSelectedWarningLevel] = useState<string>('ALL');
  const [selectedPosition, setSelectedPosition] = useState<PositionItem | null>(null);

  const fetchPositions = async () => {
    setIsLoading(true);
    try {
      const factId = selectedFactory === 'ALL' ? undefined : selectedFactory;
      const warnLvl = selectedWarningLevel === 'ALL' ? undefined : selectedWarningLevel;
      const res = await positionsApi.getPositions({
        factoryId: factId,
        warningLevel: warnLvl,
        limit: 'all',
      });
      setPositions(res.items || []);
    } catch (err) {
      console.error('Failed to fetch positions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPositions();
  }, [selectedFactory, selectedWarningLevel]);

  const columns: Column<PositionItem>[] = [
    {
      key: 'factoryCode',
      header: 'Nhà máy',
      sortable: true,
      width: '90px',
      align: 'center',
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
          <div className="font-mono text-[11px] text-slate-400">{item.materialCode}</div>
        </div>
      ),
    },
    {
      key: 'effectiveStockTons',
      header: 'Tồn khả dụng (SOH)',
      sortable: true,
      align: 'right',
      getValue: (item) => item.effectiveStockTons,
      render: (item) => (
        <div className="text-right">
          <div className="font-mono font-bold text-slate-900">{formatTons(item.effectiveStockTons)} <span className="text-[10px] font-normal text-slate-500">tấn</span></div>
          <div className="font-mono text-[10px] text-slate-400">{formatKg(item.effectiveStockKg)} kg</div>
        </div>
      ),
    },
    {
      key: 'avgDailyDemandTons',
      header: 'Tiêu hao ngày (d)',
      sortable: true,
      align: 'right',
      getValue: (item) => item.avgDailyDemandTons,
      render: (item) => (
        <div className="text-right font-mono text-slate-700">
          <div>{formatTons(item.avgDailyDemandTons)} <span className="text-[10px] text-slate-400">tấn/d</span></div>
          <div className="text-[10px] text-slate-400">{formatKg(item.avgDailyDemandKg)} kg/d</div>
        </div>
      ),
    },
    {
      key: 'doiDays',
      header: 'Chỉ số DOI',
      sortable: true,
      align: 'center',
      getValue: (item) => item.doiDays,
      render: (item) => (
        <div className="text-center">
          <span className="font-mono font-bold text-slate-900 text-sm">
            {item.warningLevel === 'NO_DEMAND' || item.doiDays == null || isNaN(Number(item.doiDays))
              ? '—'
              : item.doiDays >= 999
              ? '∞'
              : Number(item.doiDays).toFixed(1)}
          </span>
          {item.warningLevel !== 'NO_DEMAND' && item.doiDays != null && (
            <span className="text-[10px] text-slate-400 ml-0.5">ngày</span>
          )}
        </div>
      ),
    },
    {
      key: 'warningLevel',
      header: 'Mức cảnh báo',
      sortable: true,
      align: 'center',
      render: (item) => <WarningBadge level={item.warningLevel} doi={item.doiDays} short />,
    },
    {
      key: 'stockoutDate',
      header: 'Dự kiến hết hàng',
      sortable: true,
      align: 'center',
      render: (item) => (
        item.stockoutDate ? (
          <span className="inline-flex items-center gap-1 font-mono text-xs text-red-600 font-medium">
            <AlertTriangle className="w-3 h-3" />
            {formatDate(item.stockoutDate)}
          </span>
        ) : (
          <span className="text-slate-400 text-xs">—</span>
        )
      ),
    },
    {
      key: 'demandSource',
      header: 'Nguồn nhu cầu',
      align: 'center',
      render: (item) => (
        <span
          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
            item.demandSource === 'OVERRIDE'
              ? 'bg-amber-100 text-amber-800 border border-amber-300'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          {item.demandSource === 'OVERRIDE' ? 'SỬA TAY' : item.demandSource}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'right',
      width: '120px',
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setSelectedPosition(item)}
            title="Xem chi tiết các lô hàng, PO và sửa tay nhu cầu"
            className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors border border-slate-200"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          {(item.warningLevel === 'CRITICAL' || item.warningLevel === 'WARNING') && (
            <button
              onClick={() => navigate('/purchase-requests')}
              title="Đến tab Đề xuất mua hàng"
              className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors border border-amber-200"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Quản Lý Vị Thế Tồn Kho (Stock Positions - F04a)"
        subtitle="Theo dõi chi tiết tồn khả dụng (SOH), số ngày tồn kho (DOI), dự phóng hết hàng và nguồn nhu cầu theo cặp Nhà máy - Nguyên liệu"
        breadcrumbs={[{ label: 'PremixTrack' }, { label: 'Vị thế tồn kho' }]}
      />

      {/* Main DataTable */}
      <DataTable
        columns={columns}
        data={positions}
        isLoading={isLoading}
        searchPlaceholder="Tìm theo mã hoặc tên nguyên liệu..."
        searchKeys={['materialName', 'materialCode', 'factoryCode']}
        defaultPageSize={20}
        onRefresh={fetchPositions}
        onRowClick={(item) => setSelectedPosition(item)}
        filters={
          <div className="flex items-center gap-2">
            <select
              value={selectedWarningLevel}
              onChange={(e) => setSelectedWarningLevel(e.target.value)}
              className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-hidden"
            >
              <option value="ALL">Mọi mức cảnh báo</option>
              <option value="CRITICAL">Nguy cấp (DOI &lt; 7)</option>
              <option value="WARNING">Cảnh báo (7 ≤ DOI ≤ 15)</option>
              <option value="BALANCED">Cân đối (15 &lt; DOI ≤ 75)</option>
              <option value="OVERSTOCK">Dư thừa (DOI &gt; 75)</option>
              <option value="NO_DEMAND">Không có nhu cầu</option>
            </select>
          </div>
        }
      />

      {/* Drilldown Modal */}
      <PositionDetailModal
        position={selectedPosition}
        isOpen={!!selectedPosition}
        onClose={() => setSelectedPosition(null)}
        onUpdated={fetchPositions}
      />
    </div>
  );
};
