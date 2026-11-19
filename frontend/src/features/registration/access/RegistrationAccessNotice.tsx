import { Camera, Headphones, RefreshCw, ScanLine, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import dymLogo from '../../../assets/dym-logo-dark.png';
import dymLogoOnDark from '../../../assets/dym-logo.png';
import type { RegistrationAccessState } from './useRegistrationAccess';

export function RegistrationAccessNotice({ state, assisted, onRetry }: {
  state: RegistrationAccessState;
  assisted: boolean;
  onRetry: () => void;
}) {
  if (state.status === 'ready' && state.assisted) return null;
  if (state.status === 'checking') return (
    <div className="flex flex-col items-center gap-5 py-10" role="status">
      <img src={dymLogo} alt="DYM Medical Center" className="h-auto w-36" />
      <Skeleton className="h-24 w-full" />
      <p className="text-sm text-muted-foreground">{assisted ? 'Đang mở phiên đăng ký…' : 'Đang kiểm tra mã QR…'}</p>
    </div>
  );
  if (state.status === 'ready') return (
    <Alert className="mb-5" role="status">
      <ShieldCheck className="size-4" aria-hidden="true" />
      <AlertTitle>Mã QR hợp lệ</AlertTitle>
      <AlertDescription>Bạn có 20 phút để hoàn tất. Mã QR trên màn hình thay đổi không ảnh hưởng đến lượt đăng ký này.</AlertDescription>
    </Alert>
  );
  const assistedExpired = assisted && state.status === 'session-expired';
  const title = state.status === 'qr-expired' ? 'Mã QR đã hết hạn'
    : state.status === 'session-expired' ? 'Phiên đăng ký đã hết hạn'
    : state.status === 'error' ? 'Chưa mở được trang đăng ký'
    : 'Quét mã QR để đăng ký';
  return (
    <section className="registration-entry" aria-labelledby="registration-entry-title">
      <header className="registration-entry-brand">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcSet={dymLogoOnDark} />
          <img src={dymLogo} alt="DYM Medical Center Vietnam" width="144" height="52" />
        </picture>
      </header>
      <div className="registration-entry-body">
        <h1 id="registration-entry-title">{title}</h1>
        {assistedExpired ? (
          <p className="registration-entry-intro" role="status">Mở lại phiên để tiếp tục đăng ký cho khách.</p>
        ) : (
          <Alert variant={state.status === 'error' ? 'destructive' : state.status === 'required' ? 'default' : 'warning'} className="mt-4">
            <AlertDescription>{state.message ?? (state.status === 'error'
              ? 'Vui lòng kiểm tra kết nối mạng rồi thử lại.'
              : state.status === 'required'
                ? 'Sử dụng mã QR đang hiển thị tại quầy lễ tân để bắt đầu.'
                : 'Vui lòng quét mã QR mới tại quầy lễ tân để bắt đầu lại.')}</AlertDescription>
          </Alert>
        )}
        {assistedExpired || state.status === 'error' ? (
          <Button type="button" onClick={onRetry} className="mt-5 min-h-11 w-full sm:w-auto">
            <RefreshCw data-icon="inline-start" aria-hidden="true" />
            {assistedExpired ? 'Mở lại phiên đăng ký' : 'Thử lại'}
          </Button>
        ) : (
          <ol className="registration-entry-steps" aria-label="Cách bắt đầu đăng ký">
            <li><Camera aria-hidden="true" /><div><strong>Mở camera điện thoại</strong><p>Hướng camera vào mã QR tại quầy.</p></div></li>
            <li><ScanLine aria-hidden="true" /><div><strong>Chạm vào liên kết hiện ra</strong><p>Điền thông tin để nhận số thứ tự.</p></div></li>
          </ol>
        )}
        {!assisted && <p className="registration-entry-english" lang="en">{state.status === 'error'
          ? 'Unable to open registration. Please try again.'
          : 'Open your phone camera and scan the current QR code at reception to register.'}</p>}
      </div>
      <footer className="registration-entry-help">
        <Headphones aria-hidden="true" />
        <p><strong>Cần hỗ trợ?</strong><span>{assisted ? 'Liên hệ quản trị viên nếu sự cố tiếp diễn.' : 'Vui lòng liên hệ nhân viên lễ tân.'}</span></p>
      </footer>
    </section>
  );
}
