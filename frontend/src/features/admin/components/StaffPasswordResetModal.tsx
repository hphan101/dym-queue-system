import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
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
          <div>
            <span className="dym-eyebrow">Bảo mật tài khoản</span>
            <h2 id="staff-password-reset-title">Đặt lại mật khẩu</h2>
          </div>
          <button
            type="button"
            aria-label="Đóng"
            disabled={isResetting}
            onClick={onClose}
          >
            <XMarkIcon aria-hidden="true" />
          </button>
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
          <label>
            <span>Mật khẩu mới</span>
            <input
              type="password"
              value={newPassword}
              minLength={6}
              maxLength={72}
              required
              autoFocus
              autoComplete="new-password"
              placeholder="Tối thiểu 6 ký tự"
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <small>Tối thiểu 6 ký tự. Gửi mật khẩu qua kênh an toàn.</small>
          </label>
          <label>
            <span>Xác nhận mật khẩu mới</span>
            <input
              type="password"
              value={confirmedPassword}
              minLength={6}
              maxLength={72}
              required
              autoComplete="new-password"
              placeholder="Nhập lại mật khẩu mới"
              onChange={(event) => setConfirmedPassword(event.target.value)}
            />
          </label>
          <footer>
            <button
              type="button"
              className="dym-btn-action-secondary"
              disabled={isResetting}
              onClick={onClose}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="dym-btn-action-primary"
              disabled={isResetting}
            >
              {isResetting ? 'Đang lưu…' : 'Lưu mật khẩu mới'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
};
