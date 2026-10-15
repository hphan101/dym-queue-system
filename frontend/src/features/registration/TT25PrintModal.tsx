import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Printer, Download, X, FileText, CheckCircle2, Loader2, LayoutTemplate } from 'lucide-react';
import type { TT25RegistrationData } from './tt25Types';
import { generateTT25OriginalPdf } from './tt25PdfService';
import { TT25PrintTemplate } from './TT25PrintTemplate';
import './tt25Print.css';

interface TT25PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: TT25RegistrationData;
  registrationNumber?: string;
}

export const TT25PrintModal: React.FC<TT25PrintModalProps> = ({
  isOpen,
  onClose,
  data,
  registrationNumber,
}) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'pdf' | 'web'>('pdf');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const loadPdf = useCallback(() => {
    setIsLoading(true);
    setError(null);

    generateTT25OriginalPdf(data, registrationNumber)
      .then(({ url }) => {
        setPdfUrl(url);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to generate TT25 PDF:', err);
        setError(err instanceof Error ? err.message : 'Không thể tải file mẫu gốc.');
        setIsLoading(false);
      });
  }, [data, registrationNumber]);

  useEffect(() => {
    if (!isOpen) return;

    // Lock body scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    loadPdf();

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, loadPdf]);

  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  if (!isOpen) return null;

  const handlePrint = () => {
    if (viewMode === 'pdf' && iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.focus();
        iframeRef.current.contentWindow.print();
        return;
      } catch (e) {
        console.warn('Iframe print failed, falling back to window.print():', e);
      }
    }
    window.print();
  };

  const handleDownload = () => {
    if (!pdfUrl) return;
    const a = document.createElement('a');
    a.href = pdfUrl;
    const cleanName = (data.fullName || 'BenhNhan').replace(/\s+/g, '_');
    a.download = `Phieu_Kham_TT25_${cleanName}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const modalContent = (
    <div id="tt25-modal-portal-root" className="tt25-modal-root animate-fade-in">
      {/* Top Header Bar */}
      <div className="tt25-modal-header no-print">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold flex items-center gap-2 text-white">
              Phiếu khám sức khỏe Thông tư 25/2026/TT-BYT
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Mẫu 03 (2 trang A4)
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Bệnh nhân: <strong className="text-slate-100">{data.fullName}</strong>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          {/* Mode Switcher */}
          <div className="hidden sm:inline-flex bg-slate-800/90 p-0.5 rounded-lg border border-slate-700/80 mr-1 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('pdf')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
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
              className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer flex items-center gap-1 ${
                viewMode === 'web'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <LayoutTemplate className="w-3 h-3" />
              Bản Web
            </button>
          </div>

          {pdfUrl && (
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700 font-medium text-xs px-3.5 py-2 rounded-lg transition-all cursor-pointer"
              title="Tải file PDF điền sẵn (2 trang A4)"
            >
              <Download className="w-4 h-4 text-slate-300" />
              Tải PDF
            </button>
          )}

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-semibold text-xs px-4 py-2 rounded-lg shadow-md transition-all cursor-pointer"
            title="In phiếu khám trực tiếp ra máy in"
          >
            <Printer className="w-4 h-4" />
            In phiếu khám (2 trang A4)
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors ml-1 cursor-pointer"
            title="Đóng cửa sổ (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      {viewMode === 'pdf' ? (
        <div className="tt25-viewport !p-0 flex-1 relative flex items-center justify-center bg-[#525659]">
          {isLoading && (
            <div className="flex flex-col items-center gap-3 text-slate-300 p-8">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
              <p className="text-sm font-medium">Đang nạp file mẫu gốc Thông tư 25 và điền thông tin...</p>
            </div>
          )}

          {error && (
            <div className="p-6 bg-rose-950/60 border border-rose-800 rounded-xl text-center text-rose-200 max-w-md shadow-2xl">
              <p className="font-semibold mb-2 text-sm">{error}</p>
              <div className="flex items-center justify-center gap-3 mt-4">
                <button
                  type="button"
                  onClick={loadPdf}
                  className="text-xs bg-rose-800 hover:bg-rose-700 active:scale-95 text-white font-medium px-3.5 py-1.5 rounded-lg cursor-pointer transition-all"
                >
                  Thử lại
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('web')}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-white font-medium px-3.5 py-1.5 rounded-lg cursor-pointer border border-slate-600 transition-all"
                >
                  Xem bản in Web (Dự phòng)
                </button>
              </div>
            </div>
          )}

          {!isLoading && !error && pdfUrl && (
            <iframe
              ref={iframeRef}
              src={`${pdfUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`}
              title="Phiếu khám sức khỏe Mẫu 03 TT25"
              className="w-full h-full border-0"
            />
          )}
        </div>
      ) : (
        <div className="tt25-viewport flex-1 overflow-y-auto">
          <TT25PrintTemplate data={data} registrationNumber={registrationNumber} />
        </div>
      )}
    </div>
  );

  return createPortal(modalContent, document.body);
};
