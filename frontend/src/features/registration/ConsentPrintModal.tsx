import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Printer,
  Download,
  X,
  FileText,
  CheckCircle2,
  Loader2,
  LayoutTemplate,
} from 'lucide-react';
import type { TT25RegistrationData } from './tt25Types';
import {
  generateConsentPdf,
  type ConsentStatementMode,
} from './consentPdfService';
import { ConsentPrintTemplate } from './ConsentPrintTemplate';
import './tt25Print.css';

interface ConsentPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: TT25RegistrationData;
  onPrinted?: () => void;
  allowPrint?: boolean;
}

export const ConsentPrintModal: React.FC<ConsentPrintModalProps> = ({
  isOpen,
  onClose,
  data,
  onPrinted,
  allowPrint = true,
}) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'pdf' | 'web'>('pdf');
  const [statementMode, setStatementMode] = useState<ConsentStatementMode>(() =>
    data.consentAgreed === false ? 'disagree' : 'agree',
  );
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pdfUrlRef = useRef<string | null>(null);

  const dataRef = useRef(data);
  dataRef.current = data;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const loadPdf = useCallback((mode: ConsentStatementMode) => {
    setIsLoading(true);
    setError(null);

    generateConsentPdf(dataRef.current, mode)
      .then(({ url }) => {
        if (pdfUrlRef.current && pdfUrlRef.current !== url) {
          URL.revokeObjectURL(pdfUrlRef.current);
        }
        pdfUrlRef.current = url;
        setPdfUrl(url);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to generate Consent PDF:', err);
        setError(
          err instanceof Error ? err.message : 'Không thể tải file mẫu Đồng thuận.',
        );
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
      setPdfUrl(null);
      setIsLoading(true);
      setError(null);
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    loadPdf(statementMode);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, loadPdf, statementMode]);

  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  const handlePrint = () => {
    onPrinted?.();
    const isMobile =
      typeof window !== 'undefined' &&
      (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
        (navigator.maxTouchPoints > 1 && window.innerWidth < 1024));

    if (viewMode === 'pdf') {
      if (isMobile && pdfUrl) {
        const newTab = window.open(pdfUrl, '_blank');
        if (!newTab) {
          handleDownload();
        }
        return;
      }

      if (iframeRef.current?.contentWindow) {
        try {
          iframeRef.current.contentWindow.focus();
          iframeRef.current.contentWindow.print();
          return;
        } catch (e) {
          console.warn('Iframe print failed, falling back to window.print():', e);
        }
      }
    }

    window.print();
  };

  const handleDownload = () => {
    if (!pdfUrl) return;
    onPrinted?.();
    const a = document.createElement('a');
    a.href = pdfUrl;
    const cleanName = (data.fullName || 'KhachHang').replace(/\s+/g, '_');
    a.download = `Dong_Thuan_Kham_${cleanName}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const modalContent = (
    <div id="tt25-modal-portal-root" className="tt25-modal-root animate-fade-in">
      {/* Top Header Bar */}
      <div className="tt25-modal-header no-print">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-sky-500/20 text-sky-400 flex items-center justify-center">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold flex items-center gap-2 text-white">
              Phiếu Đồng Thuận Khám Sức Khỏe
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> 1 trang A4
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Khách hàng: <strong className="text-slate-100">{data.fullName}</strong>
              {data.queueNumber ? ` • STT: ${data.queueNumber}` : ''}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Customer Statement Mode Selector */}
          {allowPrint && (
            <div className="hidden md:inline-flex items-center bg-slate-800/90 p-0.5 rounded border border-slate-700/80 text-xs">
              <button
                type="button"
                onClick={() => setStatementMode('agree')}
                className={`px-2.5 py-1 rounded-sm font-medium transition-all cursor-pointer ${
                  statementMode === 'agree'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Tôi đồng ý
              </button>
              <button
                type="button"
                onClick={() => setStatementMode('disagree')}
                className={`px-2.5 py-1 rounded-sm font-medium transition-all cursor-pointer ${
                  statementMode === 'disagree'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Không đồng ý
              </button>
              <button
                type="button"
                onClick={() => setStatementMode('blank')}
                className={`px-2.5 py-1 rounded-sm font-medium transition-all cursor-pointer ${
                  statementMode === 'blank'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Để trống (Tự ghi)
              </button>
            </div>
          )}

          {/* Mode Switcher */}
          <div className="hidden sm:inline-flex bg-slate-800/90 p-0.5 rounded border border-slate-700/80 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('pdf')}
              className={`px-2.5 py-1 rounded-sm font-medium transition-all cursor-pointer ${
                viewMode === 'pdf'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Mẫu gốc PDF
            </button>
            <button
              type="button"
              onClick={() => setViewMode('web')}
              className={`px-2.5 py-1 rounded-sm font-medium transition-all cursor-pointer flex items-center gap-1 ${
                viewMode === 'web'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <LayoutTemplate className="w-3 h-3" />
              Bản Web
            </button>
          </div>

          {allowPrint && pdfUrl && (
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700 font-medium text-xs px-3.5 py-2 rounded transition-all cursor-pointer"
              title="Tải file PDF Đồng thuận"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Tải PDF</span>
            </button>
          )}

          {allowPrint && (
            <button
              type="button"
              onClick={handlePrint}
              disabled={viewMode === 'pdf' && (isLoading || Boolean(error))}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 active:scale-95 text-white font-bold text-xs px-4 py-2 rounded shadow transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              <Printer className="w-4 h-4" />
              <span>In Phiếu Đồng Thuận</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-3 py-2 rounded transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Đóng</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="tt25-modal-body flex flex-col items-center justify-center w-full flex-1 overflow-auto">
        {viewMode === 'web' ? (
          <div className="w-full flex-1 overflow-auto py-4">
            <ConsentPrintTemplate data={data} statementMode={statementMode} />
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 text-slate-300 py-20 no-print">
            <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
            <p className="text-sm font-medium">
              Đang tạo Phiếu Đồng Thuận Khám Sức Khỏe...
            </p>
          </div>
        ) : error ? (
          <div className="bg-slate-900 border border-red-500/40 text-red-200 p-6 rounded-xl max-w-md text-center space-y-3 my-12 no-print">
            <p className="font-bold text-sm">Không thể hiển thị bản xem trước PDF</p>
            <p className="text-xs text-slate-400">{error}</p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => loadPdf(statementMode)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Thử lại
              </button>
              <button
                type="button"
                onClick={() => setViewMode('web')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Chuyển sang Bản Web
              </button>
            </div>
          </div>
        ) : pdfUrl ? (
          <div className="w-full h-[calc(100vh-57px)] flex flex-col">
            <iframe
              ref={iframeRef}
              src={`${pdfUrl}#toolbar=${allowPrint ? 1 : 0}&navpanes=0&scrollbar=1&view=FitH`}
              title="Phiếu Đồng Thuận Khám Sức Khỏe"
              className="w-full flex-1 border-0 bg-slate-800 no-print"
            />
            {allowPrint && (
              <div className="hidden print:block">
                <ConsentPrintTemplate data={data} statementMode={statementMode} />
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default ConsentPrintModal;
