import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { StaffAccount } from '../types';

export interface StaffPasswordResetModalProps {
  account: StaffAccount | null;
  onClose: () => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  confirmedPassword: string;
  setConfirmedPassword: (value: string) => void;
  passwordResetError: string | null;
  isResetting: boolean;
  onReset: (event: React.FormEvent<HTMLFormElement>) => Promise<void> | void;
}

export const StaffPasswordResetModal: React.FC<StaffPasswordResetModalProps> = ({
  account,
  onClose,
  newPassword,
  setNewPassword,
  confirmedPassword,
  setConfirmedPassword,
  passwordResetError,
  isResetting,
  onReset,
}) => {
  if (!account) return null;

  return (
    <div className="dym-staff-dialog-backdrop" role="presentation">
      <section
        className="dym-staff-dialog dym-staff-password-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-password-reset-title"
      >
        <header>
          <h2 id="staff-password-reset-title">Đặt lại mật khẩu</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Đóng"
            disabled={isResetting}
            onClick={onClose}
            className="size-8 text-muted-foreground hover:text-foreground"
          >
            <X aria-hidden="true" />
          </Button>
        </header>
        <form onSubmit={(event) => void onReset(event)}>
          <p className="dym-staff-password-note">
            Đặt mật khẩu mới cho nhân viên <strong>{account.displayName}</strong> (@{account.loginName}). Mật khẩu cũ sẽ mất hiệu lực ngay lập tức.
          </p>
          {passwordResetError && (
            <div className="dym-staff-form-error" role="alert">
              {passwordResetError}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="staff-new-password" className="text-xs font-medium">
              Mật khẩu mới
            </Label>
            <Input
              id="staff-new-password"
              type="password"
              value={newPassword}
              minLength={6}
              maxLength={72}
              required
              autoFocus
              autoComplete="new-password"
              placeholder="Tối thiểu 6 ký tự"
              onChange={(event) => setNewPassword(event.target.value)}
              className="h-9 bg-background text-sm shadow-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="staff-confirm-password"
              className="text-xs font-medium"
            >
              Xác nhận mật khẩu mới
            </Label>
            <Input
              id="staff-confirm-password"
              type="password"
              value={confirmedPassword}
              minLength={6}
              maxLength={72}
              required
              autoComplete="new-password"
              placeholder="Nhập lại mật khẩu mới"
              onChange={(event) => setConfirmedPassword(event.target.value)}
              className="h-9 bg-background text-sm shadow-sm"
            />
          </div>
          <footer>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isResetting}
              onClick={onClose}
              className="h-9 px-4 text-xs font-medium"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isResetting}
              className="h-9 px-4 text-xs font-medium shadow-sm"
            >
              {isResetting ? 'Đang lưu…' : 'Lưu mật khẩu mới'}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
};
