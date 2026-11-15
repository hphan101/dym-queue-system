import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { StaffAccount } from './types';

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
    <Dialog
      open={Boolean(account)}
      onOpenChange={(open) => {
        if (!open && !isPending) {
          onClose();
        }
      }}
    >
      <DialogContent
        hideCloseButton
        role="alertdialog"
        className="dym-staff-compact-dialog"
      >
        <DialogHeader>
          <DialogTitle>Khóa tài khoản</DialogTitle>
        </DialogHeader>
        <div className="dym-staff-dialog-account">
          <p>{account.displayName}</p>
          <span>@{account.loginName}</span>
        </div>
        <DialogDescription>
          Nhân viên này sẽ không thể tiếp tục sử dụng hệ thống cho đến khi tài
          khoản được mở khóa.
        </DialogDescription>
        <DialogFooter className="dym-staff-compact-footer">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            autoFocus
            onClick={onClose}
          >
            Hủy
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={() => onConfirm(account)}
            aria-busy={isPending}
          >
            {isPending ? 'Đang khóa…' : 'Khóa tài khoản'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
