import { Alert, AlertDescription } from '@/components/ui/alert';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, Loader2, Printer, RefreshCw, X } from 'lucide-react';
import type { TT25RegistrationData } from '../tt25Types';
import type { SupportedLanguage } from '../../../locales/types';
import { generateConsentPdf, getConsentFormLanguage, getConsentPageIndices, type ConsentPageOption } from './consentPdfService';
import { downloadPdf, printPdf } from './pdfBrowser';
import { usePrintModalDismiss } from './usePrintModalDismiss';
import { PdfPreview } from './PdfPreview';
import './tt25Print.css';

interface ConsentPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: TT25RegistrationData;
  onPrinted?: () => Promise<void>;
  allowPrint?: boolean;
  lang?: SupportedLanguage;
}

export const ConsentPrintModal: React.FC<ConsentPrintModalProps> = ({ isOpen, onClose, data, onPrinted, allowPrint = true, lang = 'vi' }) => {
  const isJa = lang === 'ja';
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageOption, setPageOption] = useState<ConsentPageOption>('all');
  const [printStatusError, setPrintStatusError] = useState<string | null>(null);
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  usePrintModalDismiss(isOpen, onClose);
  const language = getConsentFormLanguage(data);
  const consentSignaturePage = getConsentPageIndices(language, 'consent').length;
  const refusalSignaturePage = getConsentPageIndices(language, pageOption).length;

  useEffect(() => {
    if (!isOpen) return;
    let current = true;
    let generatedUrl: string | null = null;
    setPdfUrl(null);
    setIsLoading(true);
    setIsPreviewReady(false);
    setError(null);
    setPrintStatusError(null);
    void generateConsentPdf(data, pageOption).then(({ url }) => {
      if (!current) { URL.revokeObjectURL(url); return; }
      generatedUrl = url;
      setPdfUrl(url);
      setIsLoading(false);
    }).catch((err) => {
      if (!current) return;
      setError(isJa ? '同意書を作成できませんでした。' : err instanceof Error ? err.message : 'Không thể tạo phiếu đồng thuận.');
      setIsLoading(false);
    });
    return () => { current = false; if (generatedUrl) URL.revokeObjectURL(generatedUrl); };
  }, [isOpen, data, pageOption, attempt, isJa]);

  if (!isOpen) return null;

  const handlePrint = () => {
    if (!allowPrint || !pdfUrl || isLoading || error || !isPreviewReady) return;
    setPrintStatusError(null);
    void onPrinted?.().catch(() => setPrintStatusError('Chưa lưu được trạng thái in. Vui lòng kiểm tra kết nối và bấm In để thử lại.'));
    printPdf(pdfUrl, iframeRef.current, handleDownload);
  };

  const handleDownload = () => {
    if (!allowPrint || !pdfUrl) return;
    downloadPdf(pdfUrl, `Dong_Thuan_${language === 'vi' ? 'VNM' : 'Song_Ngu'}_${(data.fullName || 'KhachHang').replace(/\s+/g, '_')}.pdf`);
  };

  return createPortal(
    <div id="tt25-modal-portal-root" lang={lang} className="tt25-modal-root">
      <div className="tt25-modal-header no-print">
        <div className="flex min-w-0 items-center gap-3">
          <FileText className="size-5 shrink-0" aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="consent-preview-title">{isJa ? '健康診断同意書' : 'Phiếu đồng thuận khám sức khỏe'}</h2>
            <p className="consent-preview-subtitle">{data.fullName} · {isJa ? 'ベトナム語・英語の様式' : language === 'vi' ? 'Tiếng Việt' : 'Song ngữ Việt – Anh'} · {isJa ? 'DYM.PRO.09.FOR.02.03' : 'Mẫu gốc DYM.PRO.09.FOR.02.03'}</p>
            <p className="consent-preview-subtitle">
              {pageOption !== 'refusal' && (isJa ? `同意の署名：${consentSignaturePage}ページ` : `Ký đồng thuận ở trang ${consentSignaturePage}`)}
              {pageOption === 'all' && ' · '}
              {pageOption !== 'consent' && (isJa ? `不同意の署名：${refusalSignaturePage}ページ` : `Ký từ chối ở trang ${refusalSignaturePage}`)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1" role="group" aria-label={isJa ? '表示する書類' : 'Phần biểu mẫu cần in'}>
            {(['all', 'consent', 'refusal'] as const).map((option) => (
              <button key={option} type="button" aria-pressed={pageOption === option} onClick={() => setPageOption(option)}
                className="rounded border border-slate-600 px-2 py-1.5 text-xs text-slate-200 aria-pressed:bg-slate-600">
                {(isJa ? { all: 'すべて', consent: '同意書', refusal: '不同意書' } : { all: 'Cả bộ', consent: 'Đồng thuận', refusal: 'Từ chối' })[option]} ({getConsentPageIndices(language, option).length}{isJa ? 'ページ' : ' trang'})
              </button>
            ))}
          </div>
          {allowPrint && <button type="button" onClick={handleDownload} disabled={!pdfUrl || isLoading} className="inline-flex items-center gap-1.5 rounded border border-slate-600 px-3 py-2 text-xs disabled:opacity-50"><Download className="size-4" />Tải PDF</button>}
          {allowPrint && <button type="button" onClick={handlePrint} disabled={!pdfUrl || isLoading || !isPreviewReady || Boolean(error)} className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Printer className="size-4" />In phiếu</button>}
          <button type="button" onClick={onClose} aria-label={isJa ? '同意書を閉じる' : 'Đóng phiếu đồng thuận'} data-slot="overlay-close" className="dym-overlay-close"><X aria-hidden="true" /></button>
        </div>
      </div>
      {printStatusError && <Alert variant="destructive" className="no-print"><AlertDescription>{printStatusError}</AlertDescription></Alert>}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[#525659]">
        {isLoading && <div role="status" className="flex items-center gap-3 p-8 text-sm text-white"><Loader2 className="size-5 animate-spin motion-reduce:animate-none" />{isJa ? '同意書を作成しています…' : 'Đang điền thông tin vào mẫu gốc...'}</div>}
        {error && <Alert variant="destructive"><AlertDescription className="flex flex-col items-center gap-4"><p>{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="inline-flex items-center gap-2 rounded border border-slate-400 px-3 py-2"><RefreshCw className="size-4" />{isJa ? '再試行' : 'Thử lại'}</button></AlertDescription></Alert>}
        {!isLoading && !error && pdfUrl && <PdfPreview key={pdfUrl} url={pdfUrl} iframeRef={iframeRef} lang={lang} title={isJa ? '健康診断同意書' : 'Phiếu đồng thuận theo mẫu Word gốc'} onReady={() => setIsPreviewReady(true)} />}
      </div>
    </div>, document.body,
  );
};

export default ConsentPrintModal;
