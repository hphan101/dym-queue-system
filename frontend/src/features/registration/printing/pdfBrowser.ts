export function downloadPdf(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function isMobilePdfViewer(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
}

export function printPdf(url: string, frame: HTMLIFrameElement | null, download: () => void): void {
  if (!isMobilePdfViewer() && frame?.contentWindow) {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      return;
    } catch { /* Use the browser PDF viewer when iframe printing is unavailable. */ }
  }
  const tab = window.open(url, '_blank');
  if (tab) tab.opener = null;
  else download();
}
