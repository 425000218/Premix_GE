import React, { useState, useEffect, useRef } from 'react';
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
  Search,
  Folder,
  RefreshCw,
  Database,
  Check,
  X,
  AlertCircle,
} from 'lucide-react';

interface ScannedFolder {
  folderName: string;
  folderPath: string;
  cutoffDate: string;
  snapshotDate: string;
  isComplete: boolean;
  files: {
    onHand: string | null;
    movement: string | null;
    poPending: string | null;
    poReceipt: string | null;
    transfer: string | null;
  };
  missingFiles: string[];
  importStatus: 'IMPORTED' | 'NOT_IMPORTED';
  importedBatchId: number | null;
  importedAt: string | null;
  totalRows: number;
}

export const ImportPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canImport = hasPermission('import.run');

  const [activeTab, setActiveTab] = useState<'dailySet' | 'forecast' | 'master' | 'history' | 'scanner'>('dailySet');

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

  // Smart Folder Drop State
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingFolder, setIsDraggingFolder] = useState(false);

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

  // Server Folder Scanner State
  const [scannerPath, setScannerPath] = useState('Mock_Export_Data');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    baseDir: string;
    totalFolders: number;
    completeFolders: number;
    importedFolders: number;
    pendingFolders: number;
    folders: ScannedFolder[];
  } | null>(null);
  const [scannerSearchTerm, setScannerSearchTerm] = useState('');
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    currentFolder: string;
    successCount: number;
    errorCount: number;
  } | null>(null);
  const [dryRunMode, setDryRunMode] = useState(false);
  const [forceOverwrite, setForceOverwrite] = useState(false);
  const [loadingFolders, setLoadingFolders] = useState<Record<string, boolean>>({});

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
    if (activeTab === 'scanner' && !scanResult) {
      handleScanDirectory();
    }
  }, [activeTab]);

  // Xử lý kéo thả / chọn thư mục cục bộ (Smart Folder Selector cho Tab 1)
  const handleProcessFolderFiles = (fileList: FileList | File[]) => {
    const fileArray = Array.from(fileList);
    let matchedOnHand: File | null = null;
    let matchedMovement: File | null = null;
    let matchedPending: File | null = null;
    let matchedReceipt: File | null = null;
    let matchedTransfer: File | null = null;
    let detectedCutoffDate = '';

    for (const f of fileArray) {
      const name = f.name.toLowerCase();
      if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) continue;

      if (name.includes('on hand') || name.includes('soh')) matchedOnHand = f;
      else if (name.includes('movement') || name.includes('inv46')) matchedMovement = f;
      else if (name.includes('pending')) matchedPending = f;
      else if (name.includes('receipt') || name.includes('por')) matchedReceipt = f;
      else if (name.includes('transfer') || name.includes('trn02') || name.includes('tmp_')) matchedTransfer = f;

      // Nhận diện ngày ddmmyy
      if (!detectedCutoffDate) {
        const m = name.match(/(\d{2})(\d{2})(\d{2})/);
        if (m) {
          const day = parseInt(m[1], 10);
          const month = parseInt(m[2], 10);
          const year = 2000 + parseInt(m[3], 10);
          if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
            const dDate = new Date(Date.UTC(year, month - 1, day));
            // Snapshot date = Cut-off Date
            detectedCutoffDate = dDate.toISOString().slice(0, 10);
          }
        }
      }
    }

    setFiles((prev) => ({
      onHand: matchedOnHand || prev.onHand,
      movement: matchedMovement || prev.movement,
      poPending: matchedPending || prev.poPending,
      poReceipt: matchedReceipt || prev.poReceipt,
      transfer: matchedTransfer || prev.transfer,
    }));

    if (detectedCutoffDate) {
      setSnapshotDate(detectedCutoffDate);
    }

    const matchedCount = [matchedOnHand, matchedMovement, matchedPending, matchedReceipt, matchedTransfer].filter(Boolean).length;
    if (matchedCount > 0) {
      setFeedback({
        type: 'success',
        text: `Đã tự động nhận diện ${matchedCount}/5 file ERP và khớp ngày chốt ${detectedCutoffDate || snapshotDate}!`,
      });
    } else {
      setFeedback({
        type: 'error',
        text: 'Không tìm thấy file Excel ERP phù hợp trong thư mục vừa chọn. Vui lòng kiểm tra lại.',
      });
    }
  };

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

  // Quét thư mục máy chủ (Tab 5)
  const handleScanDirectory = async () => {
    setIsScanning(true);
    setFeedback(null);
    try {
      const res = await importApi.scanDirectory(scannerPath.trim());
      setScanResult(res);
      setFeedback({
        type: 'success',
        text: `Đã quét thành công thư mục máy chủ! Tìm thấy ${res.totalFolders} ngày chốt (${res.completeFolders} thư mục đủ 5/5 file, ${res.importedFolders} ngày đã nạp, ${res.pendingFolders} ngày chờ nạp).`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Không thể quét thư mục máy chủ. Vui lòng kiểm tra lại đường dẫn.',
      });
    } finally {
      setIsScanning(false);
    }
  };

  // Nạp 1 thư mục cụ thể từ danh sách quét
  const handleImportSingleScanned = async (folder: ScannedFolder, dryRun: boolean) => {
    setLoadingFolders((prev) => ({ ...prev, [folder.folderName]: true }));
    setFeedback(null);
    try {
      const res = await importApi.importScannedFolder({
        folderPath: folder.folderPath,
        dryRun,
        forceOverwrite,
      });

      setFeedback({
        type: 'success',
        text: dryRun
          ? `Kiểm tra thư mục ${folder.folderName} (Dry-run) hoàn tất!`
          : `Nạp thành công thư mục ${folder.folderName} vào CSDL! (Batch #${res.batchId || ''})`,
        details: res,
      });

      // Tự động làm mới danh sách quét để cập nhật badge trạng thái
      if (!dryRun) {
        handleScanDirectory();
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || `Lỗi khi xử lý thư mục ${folder.folderName}.`,
      });
    } finally {
      setLoadingFolders((prev) => ({ ...prev, [folder.folderName]: false }));
    }
  };

  // Nạp tự động hàng loạt (Batch Import)
  const handleBatchImport = async () => {
    if (!scanResult || scanResult.folders.length === 0) return;

    // Lọc các folder cần nạp
    const targets = scanResult.folders.filter(
      (f) => f.isComplete && (f.importStatus !== 'IMPORTED' || forceOverwrite)
    );

    if (targets.length === 0) {
      setFeedback({
        type: 'error',
        text: 'Không có thư mục nào cần nạp. Tất cả các ngày đều đã được nạp thành công (hoặc bật "Ghi đè ngày đã nạp" để nạp lại).',
      });
      return;
    }

    const confirmMsg = `Bạn có chắc muốn nạp ${targets.length} thư mục ngày chốt vào CSDL? ${
      dryRunMode ? '(Chế độ xem trước - Dry-run)' : '(Ghi trực tiếp vào CSDL)'
    }`;
    if (!window.confirm(confirmMsg)) return;

    setIsBatchRunning(true);
    setFeedback(null);
    let success = 0;
    let errors = 0;

    setBatchProgress({
      current: 0,
      total: targets.length,
      currentFolder: targets[0].folderName,
      successCount: 0,
      errorCount: 0,
    });

    for (let i = 0; i < targets.length; i++) {
      const folder = targets[i];
      setBatchProgress({
        current: i + 1,
        total: targets.length,
        currentFolder: folder.folderName,
        successCount: success,
        errorCount: errors,
      });

      try {
        await importApi.importScannedFolder({
          folderPath: folder.folderPath,
          dryRun: dryRunMode,
          forceOverwrite,
        });
        success++;
      } catch (err) {
        errors++;
      }
    }

    setIsBatchRunning(false);
    setBatchProgress(null);
    setFeedback({
      type: errors === 0 ? 'success' : 'error',
      text: `Quá trình nạp hàng loạt hoàn tất: ${success}/${targets.length} ngày thành công, ${errors} ngày gặp sự cố.`,
    });

    // Làm mới lại bảng
    handleScanDirectory();
  };

  const filteredScannedFolders = (scanResult?.folders || []).filter((f) => {
    if (!scannerSearchTerm.trim()) return true;
    const term = scannerSearchTerm.toLowerCase();
    return (
      f.folderName.toLowerCase().includes(term) ||
      (f.cutoffDate && f.cutoffDate.includes(term)) ||
      (f.snapshotDate && f.snapshotDate.includes(term))
    );
  });

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
        subtitle="Hỗ trợ Quét thư mục máy chủ tự động theo quy tắc ddmmyy, tải lên cả thư mục hoặc từng file lẻ với 5 bài kiểm chéo BR-15d"
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
              <pre className="mt-2 p-2 bg-white/60 rounded-md font-mono text-[11px] overflow-x-auto max-h-48">
                {JSON.stringify(feedback.details, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('scanner')}
          className={`py-3 px-5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'scanner'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Search className="w-4 h-4 text-emerald-600" />
          <span>Quét Thư Mục Máy Chủ (Folder Scanner & Batch)</span>
          <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">Mới</span>
        </button>

        <button
          onClick={() => setActiveTab('dailySet')}
          className={`py-3 px-5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
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
          className={`py-3 px-5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
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
          className={`py-3 px-5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
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
          className={`py-3 px-5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'history'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <History className="w-4 h-4 text-emerald-600" />
          <span>Lịch sử các lần nạp</span>
        </button>
      </div>

      {/* Tab 5: Scanner (Quét thư mục máy chủ) */}
      {activeTab === 'scanner' && (
        <div className="space-y-6">
          {/* Top Bar: Input đường dẫn & Nút quét */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1 max-w-xl">
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex items-center gap-1.5">
                  <Folder className="w-4 h-4 text-emerald-600" />
                  Đường dẫn thư mục chứa dữ liệu ERP (Thư mục ddmmyy)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={scannerPath}
                    onChange={(e) => setScannerPath(e.target.value)}
                    placeholder="Ví dụ: Mock_Export_Data hoặc C:\Premix_GE\Mock_Export_Data"
                    className="flex-1 py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono focus:bg-white focus:outline-emerald-500"
                  />
                  <Button
                    variant="primary"
                    size="md"
                    isLoading={isScanning}
                    onClick={handleScanDirectory}
                    leftIcon={<Search className="w-4 h-4" />}
                  >
                    Quét thư mục
                  </Button>
                </div>
              </div>

              {/* Tùy chọn thực thi */}
              <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-700 pt-2 md:pt-0">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={dryRunMode}
                    onChange={(e) => setDryRunMode(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <span>Chế độ kiểm tra (Dry-run)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={forceOverwrite}
                    onChange={(e) => setForceOverwrite(e.target.checked)}
                    className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-4 h-4"
                  />
                  <span>Ghi đè ngày đã nạp</span>
                </label>
              </div>
            </div>

            {/* KPI Cards */}
            {scanResult && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-[11px] font-medium text-slate-500">Tổng thư mục ngày chốt</div>
                  <div className="text-xl font-bold text-slate-900 font-mono mt-0.5">{scanResult.totalFolders}</div>
                </div>
                <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-200/80">
                  <div className="text-[11px] font-medium text-emerald-700">Đủ bộ 5/5 file ERP</div>
                  <div className="text-xl font-bold text-emerald-700 font-mono mt-0.5">{scanResult.completeFolders}</div>
                </div>
                <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-200/80">
                  <div className="text-[11px] font-medium text-amber-700">Chưa nạp (Chờ xử lý)</div>
                  <div className="text-xl font-bold text-amber-700 font-mono mt-0.5">{scanResult.pendingFolders}</div>
                </div>
                <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-200/80">
                  <div className="text-[11px] font-medium text-blue-700">Đã nạp vào CSDL</div>
                  <div className="text-xl font-bold text-blue-700 font-mono mt-0.5">{scanResult.importedFolders}</div>
                </div>
              </div>
            )}
          </div>

          {/* Thanh Tiến Trình Batch Import */}
          {isBatchRunning && batchProgress && (
            <div className="bg-emerald-900 text-white p-5 rounded-xl shadow-md space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-300" />
                  Đang tiến hành nạp tự động hàng loạt... (Đang xử lý: {batchProgress.currentFolder})
                </span>
                <span className="font-mono font-bold">
                  {batchProgress.current} / {batchProgress.total} ngày ({Math.round((batchProgress.current / batchProgress.total) * 100)}%)
                </span>
              </div>
              <div className="w-full bg-emerald-950/60 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-emerald-400 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-emerald-200 font-mono">
                <span>Thành công: {batchProgress.successCount}</span>
                <span>Lỗi/Cảnh báo: {batchProgress.errorCount}</span>
              </div>
            </div>
          )}

          {/* Danh sách các thư mục ngày chốt */}
          {scanResult && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={scannerSearchTerm}
                    onChange={(e) => setScannerSearchTerm(e.target.value)}
                    placeholder="Lọc thư mục ddmmyy hoặc ngày..."
                    className="py-1 px-2 text-xs bg-white border border-slate-200 rounded-md text-slate-900 font-mono w-48 focus:outline-emerald-500"
                  />
                  <span className="text-xs text-slate-500">
                    Hiển thị {filteredScannedFolders.length} / {scanResult.folders.length} thư mục
                  </span>
                </div>

                {canImport && (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={isBatchRunning || scanResult.pendingFolders === 0}
                    isLoading={isBatchRunning}
                    onClick={handleBatchImport}
                    leftIcon={<Play className="w-3.5 h-3.5" />}
                  >
                    Nạp tự động tất cả ngày chưa nạp ({scanResult.pendingFolders})
                  </Button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-2.5 px-4">Thư mục (ddmmyy)</th>
                      <th className="py-2.5 px-4">Ngày cắt D (Cut-off)</th>
                      <th className="py-2.5 px-4">Ngày chốt C (Snapshot)</th>
                      <th className="py-2.5 px-4 text-center">Bộ 5 file ERP</th>
                      <th className="py-2.5 px-4 text-center">Trạng thái CSDL</th>
                      <th className="py-2.5 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredScannedFolders.map((folder) => {
                      const isFolderLoading = loadingFolders[folder.folderName] || false;
                      return (
                        <tr key={folder.folderName} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-4 font-mono font-bold text-slate-900 flex items-center gap-2">
                            <Folder className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>{folder.folderName}</span>
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-700">
                            {folder.cutoffDate ? formatDate(folder.cutoffDate) : '—'}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-700">
                            {folder.snapshotDate ? formatDate(folder.snapshotDate) : '—'}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            {folder.isComplete ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800"
                                title={Object.values(folder.files).filter(Boolean).join('\n')}
                              >
                                <Check className="w-3 h-3" /> Đủ 5/5 file
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-800"
                                title={`Thiếu: ${folder.missingFiles.join(', ')}`}
                              >
                                <X className="w-3 h-3" /> Thiếu {folder.missingFiles.length} file
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            {folder.importStatus === 'IMPORTED' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800">
                                <Database className="w-3 h-3" /> Đã nạp (Batch #{folder.importedBatchId})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                                Chưa nạp
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right space-x-2 whitespace-nowrap">
                            <button
                              disabled={isFolderLoading || isBatchRunning || !folder.isComplete}
                              onClick={() => handleImportSingleScanned(folder, true)}
                              className="px-2 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 transition-colors inline-flex items-center gap-1"
                              title="Kiểm tra cấu trúc và tính hợp lệ mà không ghi vào CSDL"
                            >
                              <Eye className="w-3 h-3" /> Xem trước
                            </button>
                            {canImport && (
                              <button
                                disabled={isFolderLoading || isBatchRunning || !folder.isComplete}
                                onClick={() => handleImportSingleScanned(folder, false)}
                                className={`px-2.5 py-1 text-[11px] font-semibold rounded disabled:opacity-40 transition-colors inline-flex items-center gap-1 ${
                                  folder.importStatus === 'IMPORTED'
                                    ? 'bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-800 border border-slate-200'
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                }`}
                                title={folder.importStatus === 'IMPORTED' ? 'Ghi đè lại ngày này' : 'Nạp vào CSDL'}
                              >
                                {isFolderLoading ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Play className="w-3 h-3" />
                                )}
                                <span>{folder.importStatus === 'IMPORTED' ? 'Nạp lại' : 'Nạp ngay'}</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 1: Daily Set (Bộ 5 file ERP) */}
      {activeTab === 'dailySet' && (
        <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-2xs space-y-6">
          {/* Smart Folder Selector Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingFolder(true);
            }}
            onDragLeave={() => setIsDraggingFolder(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingFolder(false);
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleProcessFolderFiles(e.dataTransfer.files);
              }
            }}
            onClick={() => folderInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              isDraggingFolder
                ? 'border-emerald-500 bg-emerald-50/70 scale-[0.99]'
                : 'border-slate-300 hover:border-emerald-500 hover:bg-slate-50/70'
            }`}
          >
            <input
              type="file"
              ref={folderInputRef}
              // @ts-ignore - webkitdirectory supported in all modern browsers
              webkitdirectory=""
              directory=""
              multiple
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleProcessFolderFiles(e.target.files);
                }
              }}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-2">
              <Folder className="w-8 h-8 text-emerald-600" />
              <div className="font-bold text-sm text-slate-800">
                Kéo thả thư mục ngày chốt vào đây (hoặc Bấm để chọn thư mục từ máy tính)
              </div>
              <p className="text-xs text-slate-500 max-w-md">
                Hệ thống sẽ tự động phân tích và gán chính xác 5 file ERP (On Hand, Movement, PO Pending, PO Receipt, Transfer Order) và tự động tính toán Ngày chốt!
              </p>
            </div>
          </div>

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
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-800">1. On Hand (Sheet SOH) (*)</label>
                {files.onHand && (
                  <span className="text-[11px] font-semibold text-emerald-700 truncate max-w-[180px]">
                    ✓ {files.onHand.name}
                  </span>
                )}
              </div>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFiles({ ...files, onHand: e.target.files?.[0] || null })}
                className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-emerald-600 file:text-white file:text-xs file:font-semibold hover:file:bg-emerald-700 cursor-pointer"
              />
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-800">2. Inventory Movement (INV46) (*)</label>
                {files.movement && (
                  <span className="text-[11px] font-semibold text-emerald-700 truncate max-w-[180px]">
                    ✓ {files.movement.name}
                  </span>
                )}
              </div>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFiles({ ...files, movement: e.target.files?.[0] || null })}
                className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-emerald-600 file:text-white file:text-xs file:font-semibold hover:file:bg-emerald-700 cursor-pointer"
              />
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-800">3. PO Pending (FINISH PENDING) (*)</label>
                {files.poPending && (
                  <span className="text-[11px] font-semibold text-emerald-700 truncate max-w-[180px]">
                    ✓ {files.poPending.name}
                  </span>
                )}
              </div>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFiles({ ...files, poPending: e.target.files?.[0] || null })}
                className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-emerald-600 file:text-white file:text-xs file:font-semibold hover:file:bg-emerald-700 cursor-pointer"
              />
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-800">4. PO Receipt (POR) (*)</label>
                {files.poReceipt && (
                  <span className="text-[11px] font-semibold text-emerald-700 truncate max-w-[180px]">
                    ✓ {files.poReceipt.name}
                  </span>
                )}
              </div>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFiles({ ...files, poReceipt: e.target.files?.[0] || null })}
                className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-emerald-600 file:text-white file:text-xs file:font-semibold hover:file:bg-emerald-700 cursor-pointer"
              />
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 md:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-800">5. Transfer Order (Sheet1) (*)</label>
                {files.transfer && (
                  <span className="text-[11px] font-semibold text-emerald-700 truncate max-w-[180px]">
                    ✓ {files.transfer.name}
                  </span>
                )}
              </div>
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
