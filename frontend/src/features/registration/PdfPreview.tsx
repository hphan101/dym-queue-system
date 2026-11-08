import { useEffect, useState, type RefObject } from 'react';
import { PDFDocument } from 'pdf-lib';
import { isMobilePdfViewer } from './pdfBrowser';
import { createPdfPagePreview } from './pdfPagePreview';

interface PdfPreviewProps {
  url: string;
  title: string;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  onReady: () => void;
}

export function PdfPreview({ url, title, iframeRef, onReady }: PdfPreviewProps) {
  const [mobile] = useState(isMobilePdfViewer);
  const [document, setDocument] = useState<PDFDocument | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!mobile) return;
    const controller = new AbortController();
    setError(false);
    void fetch(url, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('PDF unavailable');
      const loaded = await PDFDocument.load(await response.arrayBuffer());
      if (!controller.signal.aborted) setDocument(loaded);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [url, mobile, attempt]);

  useEffect(() => {
    if (!document) return;
    let current = true;
    let generatedUrl: string | null = null;
    setPageUrl(null);
    setError(false);
    // Mobile embedded viewers can expose only page one. Give each selection its own one-page PDF.
    void createPdfPagePreview(document, pageIndex).then((blob) => {
      if (!current) return;
      generatedUrl = URL.createObjectURL(blob);
      setPageUrl(generatedUrl);
    }).catch(() => { if (current) setError(true); });
    return () => { current = false; if (generatedUrl) URL.revokeObjectURL(generatedUrl); };
  }, [document, pageIndex, attempt]);

  const frameUrl = mobile ? pageUrl : url;
  const pageCount = document?.getPageCount() ?? 0;
  const controls = 'min-h-11 rounded border border-slate-500 px-3 py-2 text-sm text-white disabled:opacity-40';

  return <div className="flex min-h-0 w-full flex-1 flex-col">
    {mobile && <nav aria-label="Chuyển trang PDF" className="flex shrink-0 items-center justify-between gap-2 bg-slate-800 px-3 py-2">
      <button type="button" className={controls} disabled={!document || pageIndex === 0} onClick={() => setPageIndex((page) => page - 1)}>Trang trước</button>
      <span aria-live="polite" className="text-sm tabular-nums text-white">{pageCount ? `Trang ${pageIndex + 1} / ${pageCount}` : 'Đang tải…'}</span>
      <button type="button" className={controls} disabled={!document || pageIndex >= pageCount - 1} onClick={() => setPageIndex((page) => page + 1)}>Trang sau</button>
    </nav>}
    {error ? <div role="alert" className="flex flex-col items-center gap-3 p-6 text-sm text-white">
      <p>Không thể tải trang PDF. Vui lòng thử lại.</p>
      <button type="button" className={controls} onClick={() => setAttempt((value) => value + 1)}>Thử lại</button>
    </div> : frameUrl ? <iframe ref={iframeRef} src={`${frameUrl}#toolbar=0&navpanes=0&view=FitH`} title={mobile ? `${title}, trang ${pageIndex + 1}` : title} onLoad={onReady} className="h-full min-h-0 w-full flex-1 border-0" />
      : <p role="status" className="p-6 text-center text-sm text-white">Đang tải trang…</p>}
  </div>;
}
