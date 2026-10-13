import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCw,
} from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
  render?: (item: T, index: number) => React.ReactNode;
  getValue?: (item: T) => any;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  searchPlaceholder?: string;
  searchKeys?: (keyof T | string)[];
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  onRefresh?: () => void;
  emptyMessage?: string;
  defaultPageSize?: 10 | 20 | 50 | 'all';
  onRowClick?: (item: T) => void;
  rowKey?: (item: T, index: number) => string | number;
}

export function DataTable<T>({
  columns,
  data = [],
  isLoading = false,
  searchPlaceholder = 'Tìm kiếm nhanh...',
  searchKeys,
  filters,
  actions,
  onRefresh,
  emptyMessage = 'Không có dữ liệu phù hợp',
  defaultPageSize = 20,
  onRowClick,
  rowKey,
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState<10 | 20 | 50 | 'all'>(defaultPageSize);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const safeData = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  // Filter by search
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return safeData;
    const term = searchTerm.toLowerCase();

    return safeData.filter((item) => {
      if (searchKeys && searchKeys.length > 0) {
        return searchKeys.some((k) => {
          const val = (item as any)[k];
          return val !== null && val !== undefined && String(val).toLowerCase().includes(term);
        });
      }
      return Object.values(item as any).some((val) =>
        val !== null && val !== undefined && String(val).toLowerCase().includes(term)
      );
    });
  }, [safeData, searchTerm, searchKeys]);

  // Sort
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    const col = columns.find((c) => c.key === sortKey);

    return [...filteredData].sort((a, b) => {
      let aVal = col?.getValue ? col.getValue(a) : (a as any)[sortKey];
      let bVal = col?.getValue ? col.getValue(b) : (b as any)[sortKey];

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'string') {
        return sortOrder === 'asc'
          ? aVal.localeCompare(String(bVal))
          : String(bVal).localeCompare(aVal);
      }

      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [filteredData, sortKey, sortOrder, columns]);

  // Pagination
  const totalItems = sortedData.length;
  const currentLimit = pageSize === 'all' ? totalItems : pageSize;
  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(totalItems / (pageSize as number)));

  const paginatedData = useMemo(() => {
    if (pageSize === 'all') return sortedData;
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (key: string, sortable?: boolean) => {
    if (!sortable) return;
    if (sortKey === key) {
      if (sortOrder === 'asc') setSortOrder('desc');
      else {
        setSortKey(null);
        setSortOrder('asc');
      }
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const handlePageSizeChange = (newSize: 10 | 20 | 50 | 'all') => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col">
      {/* Table Toolbar */}
      <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-white">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
          {/* Search Input */}
          <div className="relative w-full max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Filters Slot */}
          {filters}
        </div>

        {/* Action buttons & Refresh */}
        <div className="flex items-center gap-2">
          {actions}
          {onRefresh && (
            <button
              onClick={onRefresh}
              title="Làm mới dữ liệu"
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Table Content */}
      <div className="overflow-x-auto min-h-[300px]">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
              {columns.map((col) => {
                const isSorted = sortKey === col.key;
                const alignClass =
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                    ? 'text-center'
                    : 'text-left';

                return (
                  <th
                    key={col.key}
                    style={{ width: col.width }}
                    className={`py-3 px-4 select-none ${alignClass} ${
                      col.sortable ? 'cursor-pointer hover:bg-slate-100/80 transition-colors' : ''
                    }`}
                    onClick={() => handleSort(col.key, col.sortable)}
                  >
                    <div
                      className={`inline-flex items-center gap-1.5 ${
                        col.align === 'right' ? 'justify-end w-full' : ''
                      }`}
                    >
                      <span>{col.header}</span>
                      {col.sortable && (
                        <span className="text-slate-400">
                          {isSorted ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-60" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-slate-700">
            {isLoading ? (
              // Loading skeleton rows
              Array.from({ length: 5 }).map((_, idx) => (
                <tr key={idx} className="animate-pulse">
                  {columns.map((col, cIdx) => (
                    <td key={cIdx} className="py-3 px-4">
                      <div className="h-4 bg-slate-200/70 rounded-md w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-12 text-center text-slate-400 font-medium"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((item, index) => {
                const key = rowKey ? rowKey(item, index) : index;
                return (
                  <tr
                    key={key}
                    onClick={() => onRowClick && onRowClick(item)}
                    className={`transition-colors hover:bg-slate-50/70 ${
                      onRowClick ? 'cursor-pointer' : ''
                    }`}
                  >
                    {columns.map((col) => {
                      const alignClass =
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left';

                      return (
                        <td key={col.key} className={`py-3 px-4 ${alignClass}`}>
                          {col.render
                            ? col.render(item, index)
                            : (item as any)[col.key] ?? '—'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/40 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center gap-3">
          <span>
            Hiển thị{' '}
            <strong className="text-slate-900 font-mono">
              {totalItems === 0
                ? 0
                : pageSize === 'all'
                ? `1 - ${totalItems}`
                : `${(currentPage - 1) * (pageSize as number) + 1} - ${Math.min(
                    currentPage * (pageSize as number),
                    totalItems
                  )}`}
            </strong>{' '}
            trên <strong className="text-slate-900 font-mono">{totalItems}</strong> bản ghi
          </span>

          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-slate-400">| Phân trang:</span>
            {([10, 20, 50, 'all'] as const).map((size) => (
              <button
                key={size}
                onClick={() => handlePageSizeChange(size)}
                className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-medium transition-colors ${
                  pageSize === size
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                {size === 'all' ? 'Tất cả' : size}
              </button>
            ))}
          </div>
        </div>

        {pageSize !== 'all' && totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded-md border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-2 font-mono text-[11px]">
              Trang <strong>{currentPage}</strong> / {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded-md border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
