import React from 'react';
import { ExclamationTriangleIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import type { StaffAccount } from '../types';

export interface StaffLockConfirmModalProps {
  account: StaffAccount | null;
  onClose: () => void;
  onConfirm: (account: StaffAccount) => void;
  isPending: boolean;
}

export const StaffLockConfirmModal: React.FC<StaffLockConfirmModalProps> = ({
  account,
  onClose,
  onConfirm,
  isPending,
}) => {
  if (!account) return null;

  return (
    <div className="dym-staff-dialog-backdrop" role="presentation">
      <section
        className="dym-staff-dialog dym-staff-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="staff-lock-confirmation-title"
        aria-describedby="staff-lock-confirmation-description"
      >
        <div className="dym-staff-confirm-icon" aria-hidden="true">
          <ExclamationTriangleIcon />
        </div>
        <div>
          <span className="dym-eyebrow">Xác nhận thao tác</span>
          <h2 id="staff-lock-confirmation-title">Khóa tài khoản?</h2>
          <p id="staff-lock-confirmation-description">
            Bạn có chắc chắn muốn khóa tài khoản <strong>{account.displayName}</strong>?
            Nhân viên này sẽ bị ngắt kết nối ngay lập tức và không thể đăng nhập cho đến khi được mở khóa lại.
          </p>
        </div>
        <footer>
          <button
            type="button"
            className="dym-btn-action-secondary"
            disabled={isPending}
            autoFocus
            onClick={onClose}
          >
            Hủy
          </button>
          <button
            type="button"
            className="dym-btn-action-primary !bg-red-600 hover:!bg-red-700"
            disabled={isPending}
            onClick={() => onConfirm(account)}
          >
            <LockClosedIcon className="w-4 h-4 mr-1 inline-block" />
            {isPending ? 'Đang khóa' : 'Xác nhận khóa'}
          </button>
        </footer>
      </section>
    </div>
  );
};
