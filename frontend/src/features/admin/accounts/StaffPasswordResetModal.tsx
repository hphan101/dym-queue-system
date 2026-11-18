import { Alert, AlertDescription } from '@/components/ui/alert';
import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { StaffAccount } from './types';

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
    <Dialog open onOpenChange={(open) => { if (!open && !isResetting) onClose(); }}>
      <DialogContent hideCloseButton aria-describedby={undefined} className="dym-staff-compact-dialog dym-staff-password-dialog">
        <DialogHeader className="dym-staff-password-header">
          <DialogTitle>Đặt lại mật khẩu</DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Đóng hộp thoại"
            data-slot="overlay-close"
            disabled={isResetting}
            onClick={onClose}
            className="dym-staff-password-close dym-overlay-close"
          >
            <X aria-hidden="true" />
          </Button>
        </DialogHeader>
        <div className="dym-staff-dialog-account">
          <p>{account.displayName}</p>
          <span>@{account.loginName}</span>
        </div>
        <form className="dym-staff-password-form" onSubmit={(event) => void onReset(event)} aria-busy={isResetting}>
          {passwordResetError && (
            <Alert variant="destructive"><AlertDescription>
              {passwordResetError}
            </AlertDescription></Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="staff-new-password">
              Mật khẩu mới
            </Label>
            <Input
              id="staff-new-password"
              type="password"
              disabled={isResetting}
              value={newPassword}
              minLength={6}
              maxLength={72}
              required
              autoFocus
              autoComplete="new-password"
              placeholder="Tối thiểu 6 ký tự"
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="staff-confirm-password"
            >
              Xác nhận mật khẩu mới
            </Label>
            <Input
              id="staff-confirm-password"
              type="password"
              disabled={isResetting}
              value={confirmedPassword}
              minLength={6}
              maxLength={72}
              required
              autoComplete="new-password"
              placeholder="Nhập lại mật khẩu mới"
              onChange={(event) => setConfirmedPassword(event.target.value)}
            />
          </div>
          <DialogFooter className="dym-staff-compact-footer">
            <Button
              type="button"
              variant="outline"
              disabled={isResetting}
              onClick={onClose}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={isResetting}
            >
              {isResetting ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
