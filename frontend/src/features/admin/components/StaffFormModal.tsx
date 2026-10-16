import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
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
          <div>
            <span className="dym-eyebrow">Tài khoản nhân sự</span>
            <h2 id="staff-form-title">
              {form.userId ? 'Chỉnh sửa nhân viên' : 'Thêm nhân viên mới'}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Đóng hộp thoại"
            disabled={isSaving}
            onClick={onClose}
          >
            <XMarkIcon aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={(event) => void onSave(event)}>
          {formError && (
            <div className="dym-staff-form-error" role="alert">
              {formError}
            </div>
          )}

          <label>
            <span>Họ và tên nhân viên</span>
            <input
              type="text"
              value={form.displayName}
              maxLength={100}
              required
              autoFocus
              placeholder="vd: Nguyễn Văn A"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  displayName: event.target.value,
                }))
              }
            />
          </label>

          <div className="dym-staff-form-grid">
            <label>
              <span>Tài khoản đăng nhập</span>
              <input
                type="text"
                value={form.loginName}
                maxLength={32}
                required
                autoComplete="username"
                placeholder="vd: letan.q1"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    loginName: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Vai trò hệ thống</span>
              <select
                value={form.role}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    role: event.target.value as StaffRole,
                  }))
                }
              >
                <option value="receptionist">Nhân viên lễ tân</option>
                <option value="admin">Quản trị viên</option>
              </select>
            </label>
          </div>

          {!form.userId && (
            <label>
              <span>Mật khẩu tạm thời</span>
              <input
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
              />
              <small>Gửi mật khẩu cho nhân viên qua kênh an toàn.</small>
            </label>
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
            <button
              type="button"
              className="dym-btn-action-secondary"
              disabled={isSaving}
              onClick={onClose}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="dym-btn-action-primary"
              disabled={isSaving}
            >
              {isSaving
                ? 'Đang lưu…'
                : form.userId
                  ? 'Lưu thay đổi'
                  : 'Tạo tài khoản'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
};
