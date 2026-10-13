import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { DataTable, Column } from '../components/common/DataTable';
import { catalogApi } from '../api/catalog.api';
import { Factory, Material, Supplier, ThresholdItem } from '../types';
import { Building2, Package, Truck, SlidersHorizontal } from 'lucide-react';

export const CatalogPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'factories' | 'materials' | 'suppliers' | 'thresholds'>('factories');

  const [factories, setFactories] = useState<Factory[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [thresholds, setThresholds] = useState<ThresholdItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'factories') {
        const res = await catalogApi.getFactories({ limit: 'all' });
        setFactories(res.items || []);
      } else if (activeTab === 'materials') {
        const res = await catalogApi.getMaterials({ limit: 'all' });
        setMaterials(res.items || []);
      } else if (activeTab === 'suppliers') {
        const res = await catalogApi.getSuppliers({ limit: 'all' });
        setSuppliers(res.items || []);
      } else if (activeTab === 'thresholds') {
        const res = await catalogApi.getThresholds({ limit: 'all' });
        setThresholds(res.items || []);
      }
    } catch (err) {
      console.error('Failed to load catalog data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  // Factory columns
  const factoryColumns: Column<Factory>[] = [
    {
      key: 'factoryCode',
      header: 'Mã Nhà Máy',
      sortable: true,
      align: 'center',
      width: '120px',
      render: (f) => (
        <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md text-xs">
          {f.factoryCode}
        </span>
      ),
    },
    { key: 'factoryName', header: 'Tên Nhà Máy', sortable: true },
    { key: 'address', header: 'Địa chỉ / Khu vực' },
    {
      key: 'isActive',
      header: 'Trạng thái',
      sortable: true,
      align: 'center',
      render: (f) => (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${f.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
          {f.isActive ? 'Đang hoạt động' : 'Tạm ngưng'}
        </span>
      ),
    },
  ];

  // Material columns
  const materialColumns: Column<Material>[] = [
    {
      key: 'materialCode',
      header: 'Mã NL',
      sortable: true,
      align: 'center',
      width: '120px',
      render: (m) => (
        <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md text-xs">
          {m.materialCode}
        </span>
      ),
    },
    { key: 'materialName', header: 'Tên Nguyên Liệu', sortable: true },
    { key: 'category', header: 'Phân loại', sortable: true },
    { key: 'uom', header: 'Đơn vị tính', align: 'center' },
    {
      key: 'bagSizeKg',
      header: 'Quy cách bao (Kg)',
      sortable: true,
      align: 'right',
      render: (m) => (
        <span className="font-mono">{m.bagSizeKg ? `${m.bagSizeKg} kg` : 'Hàng rời'}</span>
      ),
    },
    {
      key: 'isActive',
      header: 'Trạng thái',
      sortable: true,
      align: 'center',
      render: (m) => (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${m.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
          {m.isActive ? 'Hoạt động' : 'Khóa'}
        </span>
      ),
    },
  ];

  // Supplier columns
  const supplierColumns: Column<Supplier>[] = [
    {
      key: 'supplierCode',
      header: 'Mã NCC',
      sortable: true,
      align: 'center',
      width: '120px',
      render: (s) => (
        <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md text-xs">
          {s.supplierCode}
        </span>
      ),
    },
    { key: 'supplierName', header: 'Tên Nhà Cung Cấp', sortable: true },
    { key: 'contactPerson', header: 'Người liên hệ' },
    { key: 'phone', header: 'Số điện thoại', align: 'center' },
    {
      key: 'isActive',
      header: 'Trạng thái',
      sortable: true,
      align: 'center',
      render: (s) => (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
          {s.isActive ? 'Đang hợp tác' : 'Tạm dừng'}
        </span>
      ),
    },
  ];

  // Threshold columns
  const thresholdColumns: Column<ThresholdItem>[] = [
    {
      key: 'factoryCode',
      header: 'Nhà máy',
      sortable: true,
      align: 'center',
      width: '90px',
      render: (t) => (
        <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
          {t.factoryCode}
        </span>
      ),
    },
    {
      key: 'materialName',
      header: 'Nguyên liệu',
      sortable: true,
      render: (t) => (
        <div>
          <div className="font-semibold text-slate-900">{t.materialName}</div>
          <div className="font-mono text-[10px] text-slate-400">{t.materialCode}</div>
        </div>
      ),
    },
    {
      key: 'minDoiDays',
      header: 'Min DOI (Ngày)',
      sortable: true,
      align: 'center',
      render: (t) => (
        <span className="font-mono font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-md">
          {t.minDoiDays ?? 7} ngày
        </span>
      ),
    },
    {
      key: 'maxDoiDays',
      header: 'Max DOI (Ngày)',
      sortable: true,
      align: 'center',
      render: (t) => (
        <span className="font-mono font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md">
          {t.maxDoiDays ?? 75} ngày
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Danh Mục Master Data & Cấu Hình Ngưỡng (Catalog - F02a)"
        subtitle="Quản lý thông tin định danh Nhà máy, Nguyên liệu, Nhà cung cấp và Cấu hình ngưỡng an toàn tồn kho theo cặp (BR-12)"
        breadcrumbs={[{ label: 'PremixTrack' }, { label: 'Danh mục' }]}
      />

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6">
        <button
          onClick={() => setActiveTab('factories')}
          className={`py-3 px-5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'factories'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Building2 className="w-4 h-4 text-emerald-600" />
          <span>Nhà máy (Factories)</span>
        </button>

        <button
          onClick={() => setActiveTab('materials')}
          className={`py-3 px-5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'materials'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Package className="w-4 h-4 text-emerald-600" />
          <span>Nguyên liệu (Materials)</span>
        </button>

        <button
          onClick={() => setActiveTab('suppliers')}
          className={`py-3 px-5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'suppliers'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Truck className="w-4 h-4 text-emerald-600" />
          <span>Nhà cung cấp (Vendors)</span>
        </button>

        <button
          onClick={() => setActiveTab('thresholds')}
          className={`py-3 px-5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'thresholds'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4 text-emerald-600" />
          <span>Ngưỡng tồn theo cặp (BR-12)</span>
        </button>
      </div>

      {activeTab === 'factories' && (
        <DataTable
          columns={factoryColumns}
          data={factories}
          isLoading={isLoading}
          searchPlaceholder="Tìm theo tên hoặc mã nhà máy..."
          searchKeys={['factoryCode', 'factoryName', 'address']}
          defaultPageSize={20}
          onRefresh={fetchData}
        />
      )}

      {activeTab === 'materials' && (
        <DataTable
          columns={materialColumns}
          data={materials}
          isLoading={isLoading}
          searchPlaceholder="Tìm theo tên, mã hoặc loại nguyên liệu..."
          searchKeys={['materialCode', 'materialName', 'category']}
          defaultPageSize={20}
          onRefresh={fetchData}
        />
      )}

      {activeTab === 'suppliers' && (
        <DataTable
          columns={supplierColumns}
          data={suppliers}
          isLoading={isLoading}
          searchPlaceholder="Tìm theo tên, mã nhà cung cấp hoặc SĐT..."
          searchKeys={['supplierCode', 'supplierName', 'phone']}
          defaultPageSize={20}
          onRefresh={fetchData}
        />
      )}

      {activeTab === 'thresholds' && (
        <DataTable
          columns={thresholdColumns}
          data={thresholds}
          isLoading={isLoading}
          searchPlaceholder="Tìm theo nhà máy hoặc nguyên liệu..."
          searchKeys={['materialName', 'materialCode', 'factoryCode']}
          defaultPageSize={20}
          onRefresh={fetchData}
        />
      )}
    </div>
  );
};
