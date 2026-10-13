import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/common/Button';
import { DataTable, Column } from '../components/common/DataTable';
import { formatDate, formatDateTime } from '../utils/formatters';
import { importApi } from '../api/import.api';
import { useAuth } from '../context/AuthContext';
import { ImportHistoryItem } from '../types';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  History,
  Play,
  Eye,
  FileText,
} from 'lucide-react';

export const ImportPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canImport = hasPermission('import.run');

  const [activeTab, setActiveTab] = useState<'dailySet' | 'forecast' | 'master' | 'history'>('dailySet');

  // Daily Set State
  const [snapshotDate, setSnapshotDate] = useState('2026-10-06');
  const [files, setFiles] = useState<{
    onHand: File | null;
    movement: File | null;
    poPending: File | null;
    poReceipt: File | null;
    transfer: File | null;
  }>({
    onHand: null,
    movement: null,
    poPending: null,
    poReceipt: null,
    transfer: null,
  });

  // Forecast State
  const [forecastFile, setForecastFile] = useState<File | null>(null);
  const [forecastYear, setForecastYear] = useState(2026);
  const [forecastMonth, setForecastMonth] = useState(10);

  // Master Data State
  const [masterFile, setMasterFile] = useState<File | null>(null);

  // Action states
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string; details?: any } | null>(null);

  // History State
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);
  const [isHistLoading, setIsHistLoading] = useState(false);

  const fetchHistory = async () => {
    setIsHistLoading(true);
    try {
      const res = await importApi.getHistory({ limit: 'all' });
      setHistory(res.items || []);
    } catch (err) {
      console.error('Failed to load import history:', err);
    } finally {
      setIsHistLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab]);

  const handleExecuteDailySet = async (dryRun: boolean) => {
    if (!files.onHand || !files.movement || !files.poPending || !files.poReceipt || !files.transfer) {
      setFeedback({ type: 'error', text: 'Vui lòng chọn đầy đủ 5 file ERP ngày chốt.' });
      return;
    }

    setIsProcessing(true);
    setFeedback(null);

    try {
      const result = await importApi.importDailySet(
        {
          onHand: files.onHand,
          movement: files.movement,
          poPending: files.poPending,
          poReceipt: files.poReceipt,
          transfer: files.transfer,
        },
        snapshotDate,
        dryRun
      );

      setFeedback({
        type: 'success',
        text: dryRun
          ? 'Kiểm tra cấu trúc và 5 bài kiểm chéo BR-15d thành công (Chế độ xem trước - Dry-run)!'
          : 'Nạp thành công toàn bộ 5 file ERP vào CSDL trong 1 Transaction nguyên tử!',
        details: result,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Có lỗi xảy ra trong quá trình nạp file ERP.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportForecast = async (dryRun: boolean) => {
    if (!forecastFile) {
      setFeedback({ type: 'error', text: 'Vui lòng chọn file Excel Forecast (RM Usage).' });
      return;
    }

    setIsProcessing(true);
    setFeedback(null);

    try {
      const result = await importApi.importForecast(forecastFile, {
        year: forecastYear,
        month: forecastMonth,
        dryRun,
      });

      setFeedback({
        type: 'success',
        text: dryRun
          ? 'Kiểm tra file Forecast hoàn tất (Chế độ xem trước - Dry-run)!'
          : 'Nạp dữ liệu nhu cầu Forecast thành công!',
        details: result,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Lỗi khi nạp file Forecast.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportMasterData = async (dryRun: boolean) => {
    if (!masterFile) {
      setFeedback({ type: 'error', text: 'Vui lòng chọn file Excel Master Data 5 sheet.' });
      return;
    }

    setIsProcessing(true);
    setFeedback(null);

    try {
      const result = await importApi.importMasterData(masterFile, dryRun);
      setFeedback({
        type: 'success',
        text: dryRun ? 'Kiểm tra Master Data hoàn tất (Dry-run)!' : 'Nạp Master Data thành công!',
        details: result,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Lỗi khi nạp Master Data.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const historyColumns: Column<ImportHistoryItem>[] = [
    {
      key: 'createdAt',
      header: 'Thời gian',
      sortable: true,
      align: 'center',
      render: (h) => <span className="font-mono text-slate-700">{formatDateTime(h.createdAt)}</span>,
    },
    {
      key: 'importType',
      header: 'Loại dữ liệu',
      sortable: true,
      render: (h) => (
        <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
          {h.importType}
        </span>
      ),
    },
    { key: 'fileName', header: 'Tên tập tin' },
    {
      key: 'recordsProcessed',
      header: 'Bản ghi xử lý',
      sortable: true,
      align: 'right',
      render: (h) => <span className="font-mono font-bold text-slate-900">{h.recordsProcessed}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      sortable: true,
      align: 'center',
      render: (h) => (
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
            h.status === 'SUCCESS'
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-red-100 text-red-800'
          }`}
        >
          {h.status}
        </span>
      ),
    },
    { key: 'createdBy', header: 'Người thực hiện', align: 'center' },
  ];

  return (
    <div>
      <PageHeader
        title="Nạp Dữ Liệu ERP & Dự Báo Forecast (F03a, F03b)"
        subtitle="Tiếp nhận bộ 5 file ERP ngày chốt trong 1 Transaction nguyên tử, tự động chạy 5 bài kiểm chéo BR-15d và nạp dự báo nhu cầu RM Usage"
        breadcrumbs={[{ label: 'PremixTrack' }, { label: 'Nạp dữ liệu' }]}
      />

      {feedback && (
        <div
          className={`mb-6 p-4 rounded-xl text-xs flex items-start gap-3 animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <div className="font-semibold text-sm">{feedback.text}</div>
            {feedback.details && (
              <pre className="mt-2 p-2 bg-white/60 rounded-md font-mono text-[11px] overflow-x-auto max-h-40">
                {JSON.stringify(feedback.details, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6">
        <button
          onClick={() => setActiveTab('dailySet')}
          className={`py-3 px-5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'dailySet'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <UploadCloud className="w-4 h-4 text-emerald-600" />
          <span>Bộ 5 file ERP Ngày chốt (F03b)</span>
        </button>

        <button
          onClick={() => setActiveTab('forecast')}
          className={`py-3 px-5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'forecast'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>Dự báo nhu cầu Forecast (RM Usage)</span>
        </button>

        <button
          onClick={() => setActiveTab('master')}
          className={`py-3 px-5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'master'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <FileText className="w-4 h-4 text-emerald-600" />
          <span>Master Data 5 Sheets (F03a)</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`py-3 px-5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <History className="w-4 h-4 text-emerald-600" />
          <span>Lịch sử các lần nạp</span>
        </button>
      </div>

      {/* Tab 1: Daily Set */}
      {activeTab === 'dailySet' && (
        <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-2xs space-y-6">
          <div className="max-w-xs">
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Ngày chốt dữ liệu (Cut-off Date) (*)
            </label>
            <input
              type="date"
              value={snapshotDate}
              onChange={(e) => setSnapshotDate(e.target.value)}
              className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-800 mb-1">1. On Hand (Sheet SOH) (*)</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFiles({ ...files, onHand: e.target.files?.[0] || null })}
                className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-emerald-600 file:text-white file:text-xs file:font-semibold hover:file:bg-emerald-700 cursor-pointer"
              />
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-800 mb-1">2. Inventory Movement (INV46) (*)</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFiles({ ...files, movement: e.target.files?.[0] || null })}
                className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-emerald-600 file:text-white file:text-xs file:font-semibold hover:file:bg-emerald-700 cursor-pointer"
              />
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-800 mb-1">3. PO Pending (FINISH PENDING) (*)</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFiles({ ...files, poPending: e.target.files?.[0] || null })}
                className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-emerald-600 file:text-white file:text-xs file:font-semibold hover:file:bg-emerald-700 cursor-pointer"
              />
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-800 mb-1">4. PO Receipt (POR) (*)</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFiles({ ...files, poReceipt: e.target.files?.[0] || null })}
                className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-emerald-600 file:text-white file:text-xs file:font-semibold hover:file:bg-emerald-700 cursor-pointer"
              />
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 md:col-span-2">
              <label className="block text-xs font-bold text-slate-800 mb-1">5. Transfer Order (Sheet1) (*)</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFiles({ ...files, transfer: e.target.files?.[0] || null })}
                className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-emerald-600 file:text-white file:text-xs file:font-semibold hover:file:bg-emerald-700 cursor-pointer"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <Button
              variant="outline"
              size="md"
              isLoading={isProcessing}
              onClick={() => handleExecuteDailySet(true)}
              leftIcon={<Eye className="w-4 h-4" />}
            >
              Kiểm tra trước (Dry-run)
            </Button>
            {canImport && (
              <Button
                variant="primary"
                size="md"
                isLoading={isProcessing}
                onClick={() => handleExecuteDailySet(false)}
                leftIcon={<Play className="w-4 h-4" />}
              >
                Nạp chính thức vào CSDL
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Forecast */}
      {activeTab === 'forecast' && (
        <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-2xs space-y-6 max-w-2xl">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Năm (*)</label>
              <input
                type="number"
                value={forecastYear}
                onChange={(e) => setForecastYear(Number(e.target.value))}
                className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tháng (*)</label>
              <select
                value={forecastMonth}
                onChange={(e) => setForecastMonth(Number(e.target.value))}
                className="w-full py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Tháng {i + 1}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <label className="block text-xs font-bold text-slate-800 mb-1">
              File Excel Forecast (Sheet RM Usage) (*)
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setForecastFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-emerald-600 file:text-white file:text-xs file:font-semibold hover:file:bg-emerald-700 cursor-pointer"
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <Button
              variant="outline"
              size="md"
              isLoading={isProcessing}
              onClick={() => handleImportForecast(true)}
              leftIcon={<Eye className="w-4 h-4" />}
            >
              Kiểm tra trước (Dry-run)
            </Button>
            {canImport && (
              <Button
                variant="primary"
                size="md"
                isLoading={isProcessing}
                onClick={() => handleImportForecast(false)}
                leftIcon={<Play className="w-4 h-4" />}
              >
                Nạp dữ liệu Forecast
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Master Data */}
      {activeTab === 'master' && (
        <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-2xs space-y-6 max-w-2xl">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <label className="block text-xs font-bold text-slate-800 mb-1">
              File Excel Master Data (5 sheets: Plants, Items, Plant Items, Vendors, Vendor Items) (*)
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setMasterFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-emerald-600 file:text-white file:text-xs file:font-semibold hover:file:bg-emerald-700 cursor-pointer"
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <Button
              variant="outline"
              size="md"
              isLoading={isProcessing}
              onClick={() => handleImportMasterData(true)}
              leftIcon={<Eye className="w-4 h-4" />}
            >
              Kiểm tra trước (Dry-run)
            </Button>
            {canImport && (
              <Button
                variant="primary"
                size="md"
                isLoading={isProcessing}
                onClick={() => handleImportMasterData(false)}
                leftIcon={<Play className="w-4 h-4" />}
              >
                Nạp Master Data vào CSDL
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: History */}
      {activeTab === 'history' && (
        <DataTable
          columns={historyColumns}
          data={history}
          isLoading={isHistLoading}
          searchPlaceholder="Tìm theo tên file hoặc loại dữ liệu..."
          searchKeys={['fileName', 'importType']}
          defaultPageSize={20}
          onRefresh={fetchHistory}
        />
      )}
    </div>
  );
};
