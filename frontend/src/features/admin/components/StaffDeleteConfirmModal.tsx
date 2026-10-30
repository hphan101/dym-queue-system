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

export interface StaffDeleteConfirmModalProps {
  account: StaffAccount | null;
  onClose: () => void;
  onConfirm: (account: StaffAccount) => void;
  isPending: boolean;
}

export const StaffDeleteConfirmModal: React.FC<StaffDeleteConfirmModalProps> = ({
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
          <DialogTitle>Xóa tài khoản nhân viên?</DialogTitle>
          <DialogDescription>
            Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản{' '}
            <strong className="font-semibold text-foreground">
              {account.displayName}
            </strong>{' '}
            (@{account.loginName})? Thao tác này không thể hoàn tác.
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
            {isPending ? 'Đang xóa…' : 'Xác nhận xóa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
