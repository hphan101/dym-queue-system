import { Camera, Headphones, RefreshCw, ScanLine, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import dymLogo from '../../../assets/dym-logo-dark.png';
import dymLogoOnDark from '../../../assets/dym-logo.png';
import type { RegistrationAccessState } from './useRegistrationAccess';
import type { SupportedLanguage } from '../../../locales/types';

export function RegistrationAccessNotice({ state, assisted, lang = 'vi', onRetry }: {
  state: RegistrationAccessState;
  assisted: boolean;
  lang?: SupportedLanguage;
  onRetry: () => void;
}) {
  const text = (vi: string, ja: string) => lang === 'ja' ? ja : vi;
  if (state.status === 'ready' && state.assisted) return null;
  if (state.status === 'checking') return (
    <div className="flex flex-col items-center gap-5 py-10" role="status">
      <img src={dymLogo} alt="DYM Medical Center" className="h-auto w-36" />
      <Skeleton className="h-24 w-full" />
      <p className="text-sm text-muted-foreground">{assisted ? text('Đang mở phiên đăng ký…', '登録画面を開いています…') : text('Đang kiểm tra mã QR…', 'QRコードを確認しています…')}</p>
    </div>
  );
  if (state.status === 'ready') return (
    <Alert className="mb-5" role="status">
      <ShieldCheck className="size-4" aria-hidden="true" />
      <AlertTitle>{text('Mã QR hợp lệ', 'QRコードを確認しました')}</AlertTitle>
      <AlertDescription>{text('Bạn có 20 phút để hoàn tất. Mã QR trên màn hình thay đổi không ảnh hưởng đến lượt đăng ký này.', '20分以内に登録を完了してください。受付のQRコードが更新されても、この登録には影響ありません。')}</AlertDescription>
    </Alert>
  );
  const assistedExpired = assisted && state.status === 'session-expired';
  const title = state.status === 'qr-expired' ? text('Mã QR đã hết hạn', 'QRコードの有効期限が切れました')
    : state.status === 'session-expired' ? text('Phiên đăng ký đã hết hạn', '登録の有効時間が過ぎました')
    : state.status === 'error' ? text('Chưa mở được trang đăng ký', '登録画面を開けませんでした')
    : text('Quét mã QR để đăng ký', 'QRコードを読み取って登録');
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
          <p className="registration-entry-intro" role="status">{text('Mở lại phiên để tiếp tục đăng ký cho khách.', '登録画面を開き直してください。')}</p>
        ) : (
          <Alert variant={state.status === 'error' ? 'destructive' : state.status === 'required' ? 'default' : 'warning'} className="mt-4">
            <AlertDescription>{(lang !== 'ja' ? state.message : undefined) ?? (state.status === 'error'
              ? text('Vui lòng kiểm tra kết nối mạng rồi thử lại.', 'インターネット接続を確認して、もう一度お試しください。')
              : state.status === 'required'
                ? text('Sử dụng mã QR đang hiển thị tại quầy lễ tân để bắt đầu.', '受付に表示されているQRコードを読み取ってください。')
                : text('Vui lòng quét mã QR mới tại quầy lễ tân để bắt đầu lại.', '受付の新しいQRコードを読み取り、登録をやり直してください。'))}</AlertDescription>
          </Alert>
        )}
        {assistedExpired || state.status === 'error' ? (
          <Button type="button" onClick={onRetry} className="mt-5 min-h-11 w-full sm:w-auto">
            <RefreshCw data-icon="inline-start" aria-hidden="true" />
            {assistedExpired ? text('Mở lại phiên đăng ký', '登録画面を開き直す') : text('Thử lại', '再試行')}
          </Button>
        ) : (
          <ol className="registration-entry-steps" aria-label={text('Cách bắt đầu đăng ký', '登録方法')}>
            <li><Camera aria-hidden="true" /><div><strong>{text('Mở camera điện thoại', 'スマートフォンのカメラを開く')}</strong><p>{text('Hướng camera vào mã QR tại quầy.', 'カメラを受付のQRコードに向けます。')}</p></div></li>
            <li><ScanLine aria-hidden="true" /><div><strong>{text('Chạm vào liên kết hiện ra', '表示されたリンクを開く')}</strong><p>{text('Điền thông tin để nhận số thứ tự.', '情報を入力して受付番号を取得してください。')}</p></div></li>
          </ol>
        )}
        {!assisted && lang !== 'ja' && <p className="registration-entry-english" lang="en">{state.status === 'error'
          ? 'Unable to open registration. Please try again.'
          : 'Open your phone camera and scan the current QR code at reception to register.'}</p>}
        {!assisted && lang === 'vi' && state.status !== 'error' && <p className="registration-entry-english" lang="ja">受付に表示されているQRコードを読み取って登録してください。</p>}
      </div>
      <footer className="registration-entry-help">
        <Headphones aria-hidden="true" />
        <p><strong>{text('Cần hỗ trợ?', 'お困りの場合')}</strong><span>{assisted ? text('Liên hệ quản trị viên nếu sự cố tiếp diễn.', '問題が続く場合は管理者にお問い合わせください。') : text('Vui lòng liên hệ nhân viên lễ tân.', '受付スタッフにお声がけください。')}</span></p>
      </footer>
    </section>
  );
}
