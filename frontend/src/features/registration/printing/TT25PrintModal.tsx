import { Alert, AlertDescription } from '@/components/ui/alert';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, Loader2, Printer, RefreshCw, X } from 'lucide-react';
import type { TT25RegistrationData } from '../tt25Types';
import type { SupportedLanguage } from '../../../locales/types';
import { generateTT25OriginalPdf, getTT25PrintCopies, getTT25SignaturePage, getTT25TemplateInfo } from './tt25HcmPdfService';
import { downloadPdf, printPdf } from './pdfBrowser';
import { usePrintModalDismiss } from './usePrintModalDismiss';
import { PdfPreview } from './PdfPreview';
import './tt25Print.css';

interface TT25PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: TT25RegistrationData;
  onPrinted?: () => Promise<void>;
  allowPrint?: boolean;
  lang?: SupportedLanguage;
}

export function TT25PrintModal({ isOpen, onClose, data, onPrinted, allowPrint = true, lang = 'vi' }: TT25PrintModalProps) {
  const isJa = lang === 'ja';
  const title = isJa ? '健康診断票（TT25・様式03）' : 'Phiếu khám sức khỏe TT25 (Mẫu 03)';
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printStatusError, setPrintStatusError] = useState<string | null>(null);
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  usePrintModalDismiss(isOpen, onClose);
  const info = getTT25TemplateInfo(data);
  const copies = getTT25PrintCopies(data);
  const signaturePage = getTT25SignaturePage(info.key);

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
      setError(isJa ? '健診票を作成できませんでした。' : err instanceof Error ? err.message : 'Không thể tạo phiếu TT25.'); setIsLoading(false);
    });
    return () => { current = false; if (generatedUrl) URL.revokeObjectURL(generatedUrl); };
  }, [isOpen, data, attempt, isJa]);

  if (!isOpen) return null;
  const handleDownload = () => {
    if (!allowPrint || !pdfUrl) return;
    downloadPdf(pdfUrl, `TT25_${info.key}_${(data.fullName || 'KhachHang').replace(/\s+/g, '_')}.pdf`);
  };
  const handlePrint = () => {
    if (!allowPrint || !pdfUrl || isLoading || error || !isPreviewReady) return;
    setPrintStatusError(null);
    void onPrinted?.().catch(() => setPrintStatusError('Chưa lưu được trạng thái in. Vui lòng kiểm tra kết nối và bấm In để thử lại.'));
    printPdf(pdfUrl, iframeRef.current, handleDownload);
  };
  return createPortal(<div id="tt25-modal-portal-root" lang={lang} className="tt25-modal-root">
    <div className="tt25-modal-header no-print">
      <div className="flex min-w-0 items-center gap-3">
        <FileText className="size-5 shrink-0" aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="consent-preview-title">{title}</h2>
          <p className="consent-preview-subtitle">{data.fullName} · {isJa ? `ベトナム語・英語の様式／${copies}部（各${info.pageCount}ページ）` : `${info.label} · ${copies} bộ · ${info.pageCount} trang A4/bộ`}</p>
          {signaturePage && <p className="consent-preview-subtitle">{isJa ? `${copies > 1 ? '各部の' : ''}${signaturePage}ページ目にご署名ください。` : `Khách ký ở trang ${signaturePage}${copies > 1 ? ' của mỗi bộ' : ''}.`}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {allowPrint && <button type="button" onClick={handleDownload} disabled={!pdfUrl || isLoading} className="inline-flex items-center gap-1.5 rounded border border-slate-600 px-3 py-2 text-xs disabled:opacity-50"><Download className="size-4" />Tải PDF</button>}
        {allowPrint && <button type="button" onClick={handlePrint} disabled={!pdfUrl || isLoading || !isPreviewReady || Boolean(error)} className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Printer className="size-4" />In phiếu khám</button>}
        <button type="button" onClick={onClose} aria-label={isJa ? '健診票を閉じる' : 'Đóng phiếu TT25'} data-slot="overlay-close" className="dym-overlay-close"><X aria-hidden="true" /></button>
      </div>
    </div>
    {printStatusError && <Alert variant="destructive" className="no-print"><AlertDescription>{printStatusError}</AlertDescription></Alert>}
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[#525659]">
      {isLoading && <div role="status" className="flex items-center gap-3 p-8 text-sm text-white"><Loader2 className="size-5 animate-spin motion-reduce:animate-none" />{isJa ? '健診票を作成しています…' : 'Đang điền thông tin vào mẫu TT25 gốc...'}</div>}
      {error && <Alert variant="destructive"><AlertDescription className="flex flex-col items-center gap-4"><p>{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="inline-flex items-center gap-2 rounded border border-slate-400 px-3 py-2"><RefreshCw className="size-4" />{isJa ? '再試行' : 'Thử lại'}</button></AlertDescription></Alert>}
      {!isLoading && !error && pdfUrl && <PdfPreview key={pdfUrl} url={pdfUrl} iframeRef={iframeRef} lang={lang} title={isJa ? title : 'Phiếu TT25 theo mẫu Word gốc'} onReady={() => setIsPreviewReady(true)} />}
    </div>
  </div>, document.body);
}

export default TT25PrintModal;
