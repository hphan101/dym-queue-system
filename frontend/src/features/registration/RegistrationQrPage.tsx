import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, LockKeyhole, LogIn, Maximize2, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import dymLogo from '../../assets/dym-logo-dark.png';
import { BRANCH_NAMES, isBranchCode } from '../../config/branches';
import { supabase } from '../../lib/supabaseClient';
import type { BranchCode } from '../../types/domain';
import { useStaffIdentity } from '../admin/hooks/useStaffIdentity';
import { requestRegistrationAccess, RegistrationAccessError, type QrChallenge } from './registrationAccessApi';
import './registration-access.css';

function initialBranch(): BranchCode {
  const branch = new URLSearchParams(window.location.search).get('branch') ?? '';
  return isBranchCode(branch) ? branch : 'q1';
}

function QrScreen({ onSessionExpired }: { onSessionExpired: () => void }) {
  const { branchIds, isLoadingIdentity, identityError } = useStaffIdentity();
  const [branch, setBranch] = useState<BranchCode>(initialBranch);
  const [qr, setQr] = useState<QrChallenge | null>(null);
  const [now, setNow] = useState(Date.now);
  const [serverOffset, setServerOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const available = Object.keys(branchIds).filter(isBranchCode);
  const branchId = branchIds[branch];

  useEffect(() => {
    if (!isLoadingIdentity && !branchIds[branch]) {
      const first = Object.keys(branchIds).find(isBranchCode);
      if (first) setBranch(first);
    }
  }, [branchIds, branch, isLoadingIdentity]);

  useEffect(() => {
    if (!branchId) return;
    let current = true;
    let pending = false;
    let retryAfter = 0;
    let refreshAt = 0;
    let offset = 0;
    let controller: AbortController | null = null;
    const refresh = async () => {
      if (pending || !current) return;
      pending = true;
      setIsLoading(true);
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 12_000);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!current) return;
        if (!session) { onSessionExpired(); return; }
        const result = await requestRegistrationAccess<QrChallenge>({ action: 'qr', branch }, controller.signal, session.access_token);
        if (!current) return;
        offset = Date.parse(result.serverNow) - Date.now();
        refreshAt = Date.parse(result.refreshAt);
        if (result.branch !== branch || !Number.isFinite(offset) || !Number.isFinite(refreshAt) ||
          !Number.isFinite(Date.parse(result.expiresAt))) throw new Error('INVALID_QR');
        setServerOffset(offset);
        setNow(Date.now());
        setQr(result);
        setError(null);
      } catch (err) {
        if (!current) return;
        retryAfter = Date.now() + 5_000;
        if (err instanceof RegistrationAccessError && err.code === 'AUTH_REQUIRED') { onSessionExpired(); return; }
        if (err instanceof RegistrationAccessError && err.code === 'ACCESS_DENIED') {
          setQr(null);
          setError('Tài khoản không được phép mở QR tại chi nhánh này.');
          retryAfter = Number.POSITIVE_INFINITY;
        } else if (err instanceof RegistrationAccessError && err.code === 'QR_SERVICE_NOT_DEPLOYED') {
          setError('Dịch vụ QR chưa được triển khai trên server. Cần triển khai API registration-access trước khi sử dụng.');
          retryAfter = Number.POSITIVE_INFINITY;
        } else if (err instanceof RegistrationAccessError && err.code === 'SERVER_NOT_CONFIGURED') {
          setError('Dịch vụ QR chưa được cấu hình đầy đủ trên server. Vui lòng liên hệ quản trị viên.');
          retryAfter = Number.POSITIVE_INFINITY;
        } else setError('Chưa kết nối được dịch vụ QR. Vui lòng kiểm tra kết nối hoặc thử lại.');
      } finally {
        window.clearTimeout(timeout);
        pending = false;
        if (current) setIsLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() + offset >= refreshAt && Date.now() >= retryAfter) void refresh();
    }, 1000);
    const reconnect = () => {
      setNow(Date.now());
      if (document.visibilityState !== 'hidden' && Date.now() >= retryAfter) void refresh();
    };
    window.addEventListener('online', reconnect);
    document.addEventListener('visibilitychange', reconnect);
    return () => {
      current = false;
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener('online', reconnect);
      document.removeEventListener('visibilitychange', reconnect);
    };
  }, [branch, branchId, onSessionExpired, attempt]);

  const serverNow = now + serverOffset;
  const activeQr = qr?.branch === branch && serverNow < Date.parse(qr.expiresAt) ? qr : null;
  const seconds = activeQr ? Math.max(0, Math.ceil((Date.parse(activeQr.refreshAt) - serverNow) / 1000)) : 0;
  const registrationUrl = activeQr ? new URL(`/?branch=${branch}#qr=${activeQr.challenge}`, window.location.origin).href : '';
  const lock = async () => {
    onSessionExpired();
    await supabase.auth.signOut({ scope: 'local' });
  };

  if (isLoadingIdentity) return <Skeleton className="mx-auto h-96 w-full max-w-4xl" />;
  if (identityError || available.length === 0) return (
    <Empty><EmptyHeader><EmptyMedia variant="icon"><LockKeyhole /></EmptyMedia><EmptyTitle>Chưa được cấp chi nhánh</EmptyTitle>
      <EmptyDescription>{identityError ?? 'Vui lòng liên hệ quản trị viên để được cấp quyền mở màn hình QR.'}</EmptyDescription></EmptyHeader></Empty>
  );

  return (
    <div className="registration-qr-layout">
      <header className="registration-qr-header">
        <img src={dymLogo} alt="DYM Medical Center Vietnam" className="registration-qr-brand" />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" asChild>
            <a href={`/?page=admin&branch=${branch}`}>
              <ArrowLeft data-icon="inline-start" />Tiếp nhận
            </a>
          </Button>
          {available.length === 1 ? <p className="text-sm">{BRANCH_NAMES[branch]}</p> : <Select value={branch} onValueChange={(value) => { if (isBranchCode(value)) setBranch(value); }}>
            <SelectTrigger className="w-64 max-w-full" aria-label="Chi nhánh hiển thị QR"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{available.map((code) => <SelectItem key={code} value={code}>{BRANCH_NAMES[code]}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>}
          <Button variant="outline" size="icon" aria-label="Toàn màn hình" onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
            else void document.documentElement.requestFullscreen?.().catch(() => {});
          }}><Maximize2 /></Button>
          <Button variant="outline" onClick={() => void lock()}><LockKeyhole data-icon="inline-start" />Khóa</Button>
        </div>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Đăng ký khám sức khỏe</CardTitle>
          <CardDescription>{BRANCH_NAMES[branch]}</CardDescription>
        </CardHeader>
        <CardContent>
          <Separator />
          <div className="registration-qr-content">
            <div>
              <Badge variant="secondary">{activeQr ? 'Đang nhận đăng ký' : 'Đang kết nối'}</Badge>
              <h1 className="registration-qr-title">Quét mã QR<br />để lấy số khám</h1>
              <p className="max-w-sm text-muted-foreground">Dùng camera điện thoại để bắt đầu đăng ký. Không cần cài đặt ứng dụng.</p>
              <ol className="registration-qr-steps">
                <li><span>1</span>Mở camera và quét mã QR</li>
                <li><span>2</span>Điền thông tin khám sức khỏe</li>
                <li><span>3</span>Nhận số thứ tự và chờ gọi</li>
              </ol>
            </div>
            <div className="registration-qr-scan">
              {activeQr ? <div className="registration-qr-code"><QRCodeSVG value={registrationUrl} size={320} level="M" marginSize={4} bgColor="#ffffff" fgColor="#17324d" title={`Quét để đăng ký tại ${BRANCH_NAMES[branch]}`} /></div>
                : <div className="registration-qr-code-placeholder">{isLoading ? <Skeleton className="size-full aspect-square" /> : <Empty><EmptyHeader><EmptyMedia variant="icon"><WifiOff /></EmptyMedia><EmptyTitle>Đang chờ mã mới</EmptyTitle><EmptyDescription>Vui lòng chờ kết nối hoặc liên hệ lễ tân.</EmptyDescription></EmptyHeader></Empty>}</div>}
              <p className="registration-qr-countdown">{activeQr ? <>Mã mới sau <strong>00:{String(seconds).padStart(2, '0')}</strong></> : 'QR hết hạn sẽ tự ẩn để tránh khách quét nhầm.'}</p>
              <div className="registration-qr-track" aria-hidden="true"><div style={{ width: `${Math.min(100, seconds / 60 * 100)}%` }} /></div>
            </div>
          </div>
          {error && <Alert variant="destructive"><WifiOff className="size-4" /><AlertTitle>Chưa cập nhật được mã QR</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="size-4" aria-hidden="true" />Mỗi lượt quét hợp lệ có 20 phút điền thông tin.</p>
          {error && <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}><RefreshCw data-icon="inline-start" />Kết nối lại</Button>}
        </CardFooter>
      </Card>
    </div>
  );
}

export default function RegistrationQrPage() {
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const expired = useCallback(() => setHasSession(false), []);
  useEffect(() => {
    let current = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (current) setHasSession(Boolean(session));
    });
    void supabase.auth.getSession().then(({ data }) => { if (current) setHasSession(Boolean(data.session)); });
    return () => { current = false; subscription.unsubscribe(); };
  }, []);
  return (
    <main className="registration-access-surface flex min-h-svh items-center p-4">
      {hasSession === null ? <Skeleton className="mx-auto h-96 w-full max-w-4xl" /> : hasSession
        ? <QrScreen onSessionExpired={expired} />
        : <Card className="mx-auto w-full max-w-md">
          <CardHeader><img src={dymLogo} alt="DYM Medical Center" className="mb-5 h-auto w-36" /><CardTitle><h1>Mở màn hình QR đăng ký</h1></CardTitle><CardDescription>Nhân viên đăng nhập trên thiết bị tại phòng khám để hiển thị mã QR.</CardDescription></CardHeader>
          <CardContent><Alert><ShieldCheck className="size-4" /><AlertTitle>Chỉ dành cho nhân viên DYM</AlertTitle><AlertDescription>Khách dùng điện thoại quét mã trên màn hình sau khi được kích hoạt.</AlertDescription></Alert></CardContent>
          <CardFooter><Button asChild className="w-full"><a href={`/login?next=registration-qr&branch=${initialBranch()}`}><LogIn data-icon="inline-start" />Đăng nhập để kích hoạt</a></Button></CardFooter>
        </Card>}
    </main>
  );
}
