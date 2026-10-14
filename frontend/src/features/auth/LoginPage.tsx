import { useState, type CSSProperties, type FormEvent } from 'react';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import { VStack } from '@astryxdesign/core/Layout';
import { Center } from '@astryxdesign/core/Center';
import { Text, Heading } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Link } from '@astryxdesign/core/Link';
import { Icon } from '@astryxdesign/core/Icon';
import { Theme } from '@astryxdesign/core/theme';
import '@astryxdesign/core/astryx.css';
import dymLogo from '../../assets/dym-logo-dark.png';
import { supabase } from '../../lib/supabaseClient';
import { dymAdminTheme } from '../admin/theme';
import './login.css';

const pageStyle: CSSProperties = {
  minHeight: '100dvh',
  padding: '24px 16px',
};

const contentStyle: CSSProperties = {
  width: '100%',
  maxWidth: 420,
};

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

      window.location.assign('/?page=admin');
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Không thể đăng nhập. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitLogin();
  };

  return (
    <Theme theme={dymAdminTheme} mode="light">
      <div className="dym-admin-theme">
        <Center axis="both" style={pageStyle}>
          <VStack gap={6} hAlign="center" style={contentStyle}>
          <img src={dymLogo} alt="DYM Medical Center Vietnam" className="dym-admin-logo" />

          <Card padding={8} width="100%" elevation="high" className="dym-admin-card">
            <VStack gap={5} hAlign="stretch">
              <VStack gap={1} hAlign="center">
                <Heading level={2}>Đăng nhập hệ thống</Heading>
                <Text type="body" color="secondary" size="sm" justify="center">
                  Dành cho nhân viên lễ tân và quản trị DYM
                </Text>
              </VStack>

              {error && (
                <div className="dym-admin-error" role="alert" aria-live="polite">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <VStack gap={4} hAlign="stretch">
                  <TextInput
                    label="Tài khoản"
                    type="text"
                    placeholder="Nhập tài khoản"
                    value={loginName}
                    onChange={(value) => {
                      setLoginName(value);
                      setError(null);
                    }}
                    width="100%"
                    size="lg"
                    isDisabled={isLoading}
                    htmlName="username"
                  />

                  <VStack gap={2} hAlign="stretch">
                    <TextInput
                      label="Mật khẩu"
                      type="password"
                      placeholder="Nhập mật khẩu"
                      value={password}
                      onChange={(value) => {
                        setPassword(value);
                        setError(null);
                      }}
                      width="100%"
                      size="lg"
                      isDisabled={isLoading}
                      htmlName="password"
                      status={error ? { type: 'error' } : undefined}
                    />
                    <VStack hAlign="end">
                      <Link
                        size="sm"
                        color="accent"
                        type="supporting"
                        onClick={() => setError('Vui lòng liên hệ quản trị viên DYM để đặt lại mật khẩu.')}
                      >
                        Quên mật khẩu?
                      </Link>
                    </VStack>
                  </VStack>

                  <Button
                    label="Đăng nhập"
                    variant="primary"
                    size="lg"
                    type="submit"
                    width="100%"
                    isLoading={isLoading}
                  />
                </VStack>
              </form>

            </VStack>
          </Card>

          <div className="dym-admin-note">
            <Icon icon={LockClosedIcon} size="sm" color="accent" />
            <Text type="supporting" color="secondary" justify="center">
              Chỉ dành cho nhân viên được DYM cấp quyền.
            </Text>
          </div>
          </VStack>
        </Center>
      </div>
    </Theme>
  );
}
