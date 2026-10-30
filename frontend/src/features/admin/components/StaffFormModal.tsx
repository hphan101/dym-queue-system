import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BRANCH_NAMES } from '../../../config/branches';
import type { BranchCode } from '../../../types/domain';
import type { StaffFormState, StaffRole } from '../types';

const BRANCH_CODES = Object.keys(BRANCH_NAMES) as BranchCode[];

export interface StaffFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  form: StaffFormState;
  setForm: React.Dispatch<React.SetStateAction<StaffFormState>>;
  isSaving: boolean;
  formError: string | null;
  onSave: (event: React.FormEvent<HTMLFormElement>) => Promise<void> | void;
  toggleBranch: (branchCode: BranchCode) => void;
}

export const StaffFormModal: React.FC<StaffFormModalProps> = ({
  isOpen,
  onClose,
  form,
  setForm,
  isSaving,
  formError,
  onSave,
  toggleBranch,
}) => {
  if (!isOpen) return null;

  return (
    <div className="dym-staff-dialog-backdrop" role="presentation">
      <section
        className="dym-staff-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-form-title"
      >
        <header>
          <h2 id="staff-form-title">
            {form.userId ? 'Chỉnh sửa nhân viên' : 'Thêm nhân viên mới'}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Đóng hộp thoại"
            disabled={isSaving}
            onClick={onClose}
            className="size-8 text-muted-foreground hover:text-foreground"
          >
            <X aria-hidden="true" />
          </Button>
        </header>

        <form onSubmit={(event) => void onSave(event)}>
          {formError && (
            <div className="dym-staff-form-error" role="alert">
              {formError}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="staff-display-name" className="text-xs font-medium">
              Họ và tên nhân viên
            </Label>
            <Input
              id="staff-display-name"
              type="text"
              value={form.displayName}
              maxLength={100}
              required
              autoFocus
              placeholder="VD: Nguyễn Văn A"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  displayName: event.target.value,
                }))
              }
              className="h-9 bg-background text-sm shadow-sm"
            />
          </div>

          <div className="dym-staff-form-grid">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="staff-login-name" className="text-xs font-medium">
                Tài khoản đăng nhập
              </Label>
              <Input
                id="staff-login-name"
                type="text"
                value={form.loginName}
                maxLength={32}
                required
                autoComplete="username"
                placeholder="VD: letan.q1"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    loginName: event.target.value,
                  }))
                }
                className="h-9 bg-background text-sm shadow-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="staff-role-select" className="text-xs font-medium">
                Vai trò hệ thống
              </Label>
              <Select
                value={form.role}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    role: value as StaffRole,
                  }))
                }
              >
                <SelectTrigger
                  id="staff-role-select"
                  className="h-9 bg-background text-sm shadow-sm"
                >
                  <SelectValue placeholder="Chọn vai trò" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="receptionist" className="text-sm">
                      Nhân viên lễ tân
                    </SelectItem>
                    <SelectItem value="operator" className="text-sm">
                      Nhân viên vận hành
                    </SelectItem>
                    <SelectItem value="admin" className="text-sm">
                      Quản trị viên
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!form.userId && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="staff-password" className="text-xs font-medium">
                Mật khẩu tạm thời
              </Label>
              <Input
                id="staff-password"
                type="password"
                value={form.password}
                minLength={6}
                maxLength={72}
                required
                autoComplete="new-password"
                placeholder="Tối thiểu 6 ký tự"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                className="h-9 bg-background text-sm shadow-sm"
              />
            </div>
          )}

          <fieldset>
            <legend>Cơ sở phòng khám được cấp quyền</legend>
            <div className="dym-staff-branch-options">
              {BRANCH_CODES.map((branchCode) => (
                <label key={branchCode}>
                  <input
                    type="checkbox"
                    checked={form.branchCodes.includes(branchCode)}
                    onChange={() => toggleBranch(branchCode)}
                  />
                  <span>
                    <strong>{branchCode.toUpperCase()}</strong>
                    {BRANCH_NAMES[branchCode]}
                  </span>
                </label>
              ))}
            </div>
            {form.role === 'admin' && (
              <small>Quản trị viên mặc định được truy cập toàn bộ các chi nhánh.</small>
            )}
          </fieldset>

          <footer>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSaving}
              onClick={onClose}
              className="h-9 px-4 text-xs font-medium"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSaving}
              className="h-9 px-4 text-xs font-medium shadow-sm"
            >
              {isSaving
                ? 'Đang lưu…'
                : form.userId
                  ? 'Lưu thay đổi'
                  : 'Tạo tài khoản'}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
};
