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
        className="sm:max-w-[425px] gap-5 p-6"
      >
        <DialogHeader className="flex flex-col gap-1.5 text-left">
          <DialogTitle>Khóa tài khoản?</DialogTitle>
          <DialogDescription>
            Bạn có chắc chắn muốn khóa tài khoản{' '}
            <strong className="font-semibold text-foreground">
              {account.displayName}
            </strong>
            ? Nhân viên này sẽ bị ngắt kết nối ngay lập tức và không thể đăng
            nhập cho đến khi được mở khóa lại.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            autoFocus
            onClick={onClose}
            className="h-9 px-4 text-xs font-medium"
          >
            Hủy
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={() => onConfirm(account)}
            className="h-9 px-4 text-xs font-medium shadow-sm"
          >
            {isPending ? 'Đang khóa…' : 'Xác nhận khóa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
