import React from 'react';
import {
  ClockIcon,
  IdentificationIcon,
  PrinterIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { BRANCH_NAMES } from '../../../config/branches';
import { formatQueueNumber } from '../../../lib/queueNumber';
import type { BranchCode } from '../../../types/domain';
import type { RegistrationDetails } from '../types';
import {
  calculateAge,
  formatBirthDate,
  formatPhone,
  formatRegistrationTime,
  getRegistrationDisplayState,
} from '../utils/adminFormatters';

export interface RegistrationDetailModalProps {
  selectedRow: RegistrationDetails | null;
  branch: BranchCode;
  onClose: () => void;
  onPrint: (row: RegistrationDetails) => void;
}

export const RegistrationDetailModal: React.FC<RegistrationDetailModalProps> = ({
  selectedRow,
  branch,
  onClose,
  onPrint,
}) => {
  if (!selectedRow) return null;

  const displayState = getRegistrationDisplayState(
    selectedRow.state,
    selectedRow.first_called_at,
  );

  return (
    <div
      className="dym-clinical-drawer-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-patient-name"
    >
      <div
        className="dym-clinical-drawer-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="dym-clinical-drawer-header">
          <div className="dym-clinical-drawer-title-wrap">
            <span className="dym-clinical-drawer-kicker">
              PHIẾU ĐĂNG KÝ TIẾP ĐÓN
            </span>
            <h2
              id="drawer-patient-name"
              className="dym-clinical-drawer-title flex items-center gap-2.5"
            >
              <span>{selectedRow.full_name}</span>
              <span className="dym-ticket-number text-xs">
                {formatQueueNumber(selectedRow.queue_number)}
              </span>
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPrint(selectedRow)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-dym-blue-500 hover:bg-dym-blue-600 active:scale-95 text-white font-semibold text-xs rounded-lg shadow-sm transition-all cursor-pointer"
              title="In phiếu khám sức khỏe theo mẫu Thông tư 25"
            >
              <PrinterIcon className="w-4 h-4" />
              <span>In phiếu TT25</span>
            </button>
            <button
              type="button"
              className="dym-clinical-drawer-close-btn"
              onClick={onClose}
              aria-label="Đóng bảng chi tiết"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="dym-clinical-drawer-body">
          {/* Section 1: Thông tin cá nhân */}
          <div className="dym-detail-section">
            <div className="dym-detail-section-title">
              <IdentificationIcon className="w-4 h-4" />
              <span>Thông tin cá nhân</span>
            </div>
            <div className="dym-detail-grid">
              <div className="dym-detail-item">
                <span className="dym-detail-label">Họ và tên</span>
                <span className="dym-detail-value">{selectedRow.full_name}</span>
              </div>
              <div className="dym-detail-item">
                <span className="dym-detail-label">Giới tính</span>
                <span className="dym-detail-value">{selectedRow.gender}</span>
              </div>
              <div className="dym-detail-item">
                <span className="dym-detail-label">Ngày sinh</span>
                <span className="dym-detail-value">
                  {formatBirthDate(selectedRow.birth_date)}
                  {calculateAge(selectedRow.birth_date) !== null && (
                    <span className="text-xs font-normal text-slate-500 ml-1">
                      ({calculateAge(selectedRow.birth_date)} tuổi)
                    </span>
                  )}
                </span>
              </div>
              <div className="dym-detail-item">
                <span className="dym-detail-label">Số điện thoại</span>
                <span className="dym-detail-value">
                  {formatPhone(selectedRow.phone_number)}
                </span>
              </div>
              <div className="dym-detail-item dym-detail-full-width">
                <span className="dym-detail-label">CCCD / Hộ chiếu</span>
                <span className="dym-detail-value tabular-nums">
                  {selectedRow.identity_document || '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Đơn vị & Địa chỉ */}
          <div className="dym-detail-section">
            <div className="dym-detail-section-title">
              <UserGroupIcon className="w-4 h-4" />
              <span>Đơn vị & Nơi cư trú</span>
            </div>
            <div className="dym-detail-grid">
              <div className="dym-detail-item dym-detail-full-width">
                <span className="dym-detail-label">Tên cơ quan / Công ty</span>
                <span className="dym-detail-value">
                  {selectedRow.company_name || 'Khách cá nhân / Vãng lai'}
                </span>
              </div>
              <div className="dym-detail-item">
                <span className="dym-detail-label">Tỉnh / Thành phố</span>
                <span className="dym-detail-value">{selectedRow.province || '—'}</span>
              </div>
              <div className="dym-detail-item">
                <span className="dym-detail-label">Phường / Xã</span>
                <span className="dym-detail-value">{selectedRow.ward || '—'}</span>
              </div>
              <div className="dym-detail-item dym-detail-full-width">
                <span className="dym-detail-label">Địa chỉ chi tiết</span>
                <span className="dym-detail-value">
                  {selectedRow.address_detail || '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Quản lý lượt gọi */}
          <div className="dym-detail-section">
            <div className="dym-detail-section-title">
              <ClockIcon className="w-4 h-4" />
              <span>Nhật ký hàng đợi</span>
            </div>
            <div className="dym-detail-grid">
              <div className="dym-detail-item">
                <span className="dym-detail-label">Cơ sở tiếp nhận</span>
                <span className="dym-detail-value">{BRANCH_NAMES[branch]}</span>
              </div>
              <div className="dym-detail-item">
                <span className="dym-detail-label">Thời gian lấy số</span>
                <span className="dym-detail-value tabular-nums">
                  {formatRegistrationTime(selectedRow.registered_at)} ({selectedRow.queue_date})
                </span>
              </div>
              <div className="dym-detail-item">
                <span className="dym-detail-label">Lần gọi đầu</span>
                <span className="dym-detail-value tabular-nums">
                  {selectedRow.first_called_at
                    ? formatRegistrationTime(selectedRow.first_called_at)
                    : 'Chưa gọi'}
                </span>
              </div>
              <div className="dym-detail-item">
                <span className="dym-detail-label">Trạng thái</span>
                <span className="dym-detail-value">
                  <span className={`dym-status-badge ${displayState.cls}`}>
                    <span className="dym-badge-dot" />
                    {displayState.label}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
