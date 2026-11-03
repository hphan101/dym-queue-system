import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, Loader2, Printer, RefreshCw, X } from 'lucide-react';
import type { TT25RegistrationData } from './tt25Types';
import { generateTT25OriginalPdf, getTT25TemplateInfo } from './tt25HcmPdfService';
import './tt25Print.css';

interface TT25PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: TT25RegistrationData;
  onPrinted?: () => Promise<void>;
  allowPrint?: boolean;
}

export function TT25PrintModal({ isOpen, onClose, data, onPrinted, allowPrint = true }: TT25PrintModalProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printStatusError, setPrintStatusError] = useState<string | null>(null);
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const info = getTT25TemplateInfo(data);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', escape);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', escape); };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let current = true;
    let generatedUrl: string | null = null;
    setPdfUrl(null); setIsLoading(true); setIsPreviewReady(false); setError(null); setPrintStatusError(null);
    void generateTT25OriginalPdf(data).then(({ url }) => {
      if (!current) { URL.revokeObjectURL(url); return; }
      generatedUrl = url; setPdfUrl(url); setIsLoading(false);
    }).catch((err) => {
      if (!current) return;
      setError(err instanceof Error ? err.message : 'Không thể tạo phiếu TT25.'); setIsLoading(false);
    });
    return () => { current = false; if (generatedUrl) URL.revokeObjectURL(generatedUrl); };
  }, [isOpen, data, attempt]);

  if (!isOpen) return null;
  const handleDownload = () => {
    if (!allowPrint || !pdfUrl) return;
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `TT25_${info.key}_${(data.fullName || 'KhachHang').replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };
  const handlePrint = () => {
    if (!allowPrint || !pdfUrl || isLoading || error || !isPreviewReady) return;
    setPrintStatusError(null);
    void onPrinted?.().catch(() => setPrintStatusError('Chưa lưu được trạng thái in. Vui lòng kiểm tra kết nối và bấm In để thử lại.'));
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
    if (!mobile && iframeRef.current?.contentWindow) {
      try { iframeRef.current.contentWindow.focus(); iframeRef.current.contentWindow.print(); return; } catch { /* Use the browser PDF viewer. */ }
    }
    const tab = window.open(pdfUrl, '_blank');
    if (tab) tab.opener = null;
    else handleDownload();
  };
  return createPortal(<div id="tt25-modal-portal-root" className="tt25-modal-root">
    <div className="tt25-modal-header no-print">
      <div className="flex min-w-0 items-center gap-3">
        <FileText className="size-5 shrink-0" aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="consent-preview-title">Phiếu khám sức khỏe TT25 (Mẫu 03)</h2>
          <p className="consent-preview-subtitle">{data.fullName} · {info.label} · {info.pageCount} trang A4</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {allowPrint && <button type="button" onClick={handleDownload} disabled={!pdfUrl || isLoading} className="inline-flex items-center gap-1.5 rounded border border-slate-600 px-3 py-2 text-xs disabled:opacity-50"><Download className="size-4" />Tải PDF</button>}
        {allowPrint && <button type="button" onClick={handlePrint} disabled={!pdfUrl || isLoading || !isPreviewReady || Boolean(error)} className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Printer className="size-4" />In phiếu khám</button>}
        <button type="button" onClick={onClose} aria-label="Đóng phiếu TT25" className="rounded p-2"><X className="size-5" /></button>
      </div>
    </div>
    {printStatusError && <p role="alert" className="no-print bg-red-950 px-4 py-2 text-sm text-red-200">{printStatusError}</p>}
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[#525659]">
      {isLoading && <div role="status" className="flex items-center gap-3 p-8 text-sm text-white"><Loader2 className="size-5 animate-spin motion-reduce:animate-none" />Đang điền thông tin vào mẫu TT25 gốc...</div>}
      {error && <div role="alert" className="flex flex-col items-center gap-4 p-8 text-sm text-white"><p>{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="inline-flex items-center gap-2 rounded border border-slate-400 px-3 py-2"><RefreshCw className="size-4" />Thử lại</button></div>}
      {!isLoading && !error && pdfUrl && <iframe ref={iframeRef} src={`${pdfUrl}#toolbar=0&navpanes=0&view=FitH`} title="Phiếu TT25 theo mẫu Word gốc" onLoad={() => setIsPreviewReady(true)} className="h-full min-h-0 w-full flex-1 border-0" />}
    </div>
  </div>, document.body);
}

export default TT25PrintModal;
