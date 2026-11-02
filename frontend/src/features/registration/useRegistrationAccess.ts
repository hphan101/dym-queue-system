import { useCallback, useEffect, useState } from 'react';
import type { BranchCode } from '../../types/domain';
import {
  requestRegistrationAccess, RegistrationAccessError, type AccessSessionResponse,
} from './registrationAccessApi';
import {
  clearRegistrationSession, readRegistrationSession, storeRegistrationSession,
  type RegistrationSession,
} from './registrationSession';
import { requestStaffRegistrationSession } from './staffRegistrationAccess';

export type RegistrationAccessState =
  | { status: 'checking' | 'required' | 'qr-expired' | 'session-expired' | 'error'; message?: string }
  | { status: 'ready'; session: RegistrationSession; assisted?: boolean };

export function useRegistrationAccess(branch: BranchCode | null, assisted = false) {
  const [state, setState] = useState<RegistrationAccessState>({ status: 'checking' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 12_000);
    const open = async () => {
      if (!branch) { setState({ status: 'required' }); return; }
      const saved = assisted ? null : readRegistrationSession(branch);
      if (saved) { setState({ status: 'ready', session: saved }); return; }
      const challenge = new URLSearchParams(window.location.hash.slice(1)).get('qr');
      if (!challenge && !assisted) { setState({ status: 'required' }); return; }
      setState({ status: 'checking' });
      try {
        const result = assisted ? await requestStaffRegistrationSession(branch, controller.signal)
          : await requestRegistrationAccess<AccessSessionResponse>(
            { action: 'exchange', branch, challenge: challenge! }, controller.signal,
          );
        if (!current || controller.signal.aborted) return;
        if (result.branch !== branch || !/^[a-f0-9]{64}$/.test(result.sessionToken)) throw new Error('INVALID_SESSION');
        const lifetime = Date.parse(result.expiresAt) - Date.parse(result.serverNow);
        if (!Number.isFinite(lifetime) || lifetime <= 0 || lifetime > 20 * 60_000) throw new Error('INVALID_SESSION');
        const session = { branch, token: result.sessionToken, expiresAt: Date.now() + lifetime };
        if (!assisted) storeRegistrationSession(session);
        setState({ status: 'ready', session, assisted });
        const url = new URL(window.location.href);
        url.hash = '';
        window.history.replaceState(null, '', url);
      } catch (error) {
        if (!current) return;
        if (controller.signal.aborted && !timedOut) return;
        setState(error instanceof RegistrationAccessError && error.code === 'QR_EXPIRED'
          ? { status: 'qr-expired' }
          : { status: 'error', message: error instanceof RegistrationAccessError && error.code === 'RATE_LIMITED'
            ? 'Có quá nhiều lượt truy cập. Vui lòng chờ ít phút hoặc liên hệ lễ tân.'
            : error instanceof RegistrationAccessError && error.code === 'AUTH_REQUIRED'
              ? 'Vui lòng đăng nhập tài khoản lễ tân hoặc quản trị viên rồi mở lại Đăng ký.'
              : error instanceof RegistrationAccessError && error.code === 'ACCESS_DENIED'
                ? 'Tài khoản chưa được phép đăng ký hộ tại chi nhánh này.'
                : assisted ? 'Chưa mở được đăng ký hộ. Vui lòng kiểm tra kết nối rồi thử lại.'
                  : 'Không thể kiểm tra mã QR. Vui lòng kiểm tra kết nối rồi thử lại.' });
      }
    };
    void open().finally(() => window.clearTimeout(timeout));
    return () => { current = false; controller.abort(); window.clearTimeout(timeout); };
  }, [branch, attempt, assisted]);

  useEffect(() => {
    if (state.status !== 'ready') return;
    const expire = () => {
      if (Date.now() < state.session.expiresAt) return;
      if (!assisted) clearRegistrationSession();
      setState(assisted ? { status: 'error', message: 'Phiên đăng ký hộ đã hết hạn. Bấm Thử lại để tiếp tục.' } : { status: 'session-expired' });
    };
    const timer = window.setTimeout(expire, Math.max(0, state.session.expiresAt - Date.now()));
    document.addEventListener('visibilitychange', expire);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', expire); };
  }, [state, assisted]);

  const invalidate = useCallback(() => {
    if (assisted) { setState({ status: 'checking' }); setAttempt((value) => value + 1); return; }
    clearRegistrationSession();
    setState({ status: 'session-expired' });
  }, [assisted]);

  return { state, invalidate, retry: () => setAttempt((value) => value + 1), complete: () => { if (!assisted) clearRegistrationSession(); } };
}
