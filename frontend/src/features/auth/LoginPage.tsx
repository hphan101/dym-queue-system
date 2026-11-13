import { useState, type FormEvent } from 'react';
import { LoginForm } from '@/components/login-form';
import dymLogo from '../../assets/dym-logo-dark.png';
import { supabase } from '../../lib/supabaseClient';
import { isBranchCode } from '../../config/branches';
import './login.css';

function getLoginErrorMessage(code?: string): string {
  switch (code) {
    case 'invalid_credentials':
    case 'INVALID_CREDENTIALS':
      return 'Tài khoản hoặc mật khẩu không đúng.';
    case 'email_not_confirmed':
      return 'Email của tài khoản chưa được xác nhận.';
    case 'weak_password':
      return 'Mật khẩu hiện tại không đạt chính sách bảo mật. Vui lòng liên hệ quản trị viên để đổi mật khẩu.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
    case 'OVER_REQUEST_RATE_LIMIT':
      return 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ ít phút rồi thử lại.';
    case 'user_banned':
      return 'Tài khoản đang bị khóa. Vui lòng liên hệ quản trị viên.';
    default:
      return 'Không thể đăng nhập. Vui lòng thử lại.';
  }
}

export default function LoginPage() {
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const submitLogin = async () => {
    setError(null);

    if (!loginName.trim() || !password) {
      setError('Vui lòng nhập đầy đủ tài khoản và mật khẩu.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ loginName: loginName.trim(), password }),
        },
      );
      const result = (await response.json().catch(() => null)) as {
        success?: boolean;
        code?: string;
        session?: { access_token: string; refresh_token: string };
      } | null;

      if (!response.ok || !result?.success || !result.session) {
        throw new Error(getLoginErrorMessage(result?.code));
      }

      const { data, error: sessionError } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });

      if (sessionError || !data.user) {
        throw new Error(getLoginErrorMessage('invalid_credentials'));
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (profileError || !profile?.is_active) {
        await supabase.auth.signOut();
        throw new Error('Tài khoản chưa được cấp quyền hoặc đã bị khóa.');
      }

      const params = new URLSearchParams(window.location.search);
      const branch = params.get('branch') ?? '';
      window.location.assign(params.get('next') === 'registration-qr'
        ? `/registration-qr?branch=${isBranchCode(branch) ? branch : 'q1'}`
        : '/?page=admin');
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : 'Không thể đăng nhập. Vui lòng kiểm tra lại thông tin.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitLogin();
  };

  return (
    <div className="dym-login-page flex min-h-svh w-full flex-col items-center justify-center bg-muted/40 px-4 py-8 sm:p-10 antialiased">
      <div className="flex w-full max-w-lg flex-col gap-8">
        <div className="flex flex-col items-center gap-2">
          <img
            src={dymLogo}
            alt="DYM Medical Center Vietnam"
            className="h-auto w-52 object-contain sm:w-56"
          />
        </div>

        <LoginForm
          loginName={loginName}
          password={password}
          error={error}
          isLoading={isLoading}
          onLoginNameChange={(value) => {
            setLoginName(value);
            setError(null);
          }}
          onPasswordChange={(value) => {
            setPassword(value);
            setError(null);
          }}
          onForgotPassword={() =>
            setError('Vui lòng liên hệ quản trị viên DYM để đặt lại mật khẩu.')
          }
          onFormSubmit={handleSubmit}
        />

        <p className="text-center text-sm text-muted-foreground">
          Chỉ dành cho nhân viên được DYM cấp quyền
        </p>
      </div>
    </div>
  );
}
