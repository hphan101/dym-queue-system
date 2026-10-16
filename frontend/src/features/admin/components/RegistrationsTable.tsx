import React from 'react';
import { EyeIcon, PrinterIcon } from '@heroicons/react/24/outline';
import { formatQueueNumber } from '../../../lib/queueNumber';
import type { RegistrationDetails } from '../types';
import {
  calculateAge,
  formatBirthDate,
  formatFullAddress,
  formatPhone,
  formatRegistrationTime,
  getRegistrationDisplayState,
} from '../utils/adminFormatters';

export interface RegistrationsTableProps {
  rows: RegistrationDetails[];
  onSelectRow: (row: RegistrationDetails) => void;
  onPrintRow: (row: RegistrationDetails) => void;
}

export const RegistrationsTable: React.FC<RegistrationsTableProps> = ({
  rows,
  onSelectRow,
  onPrintRow,
}) => {
  return (
    <div className="dym-table-scroller">
      <table className="dym-table-precision">
        <thead>
          <tr>
            <th scope="col">Số Phiếu & Giờ</th>
            <th scope="col">Bệnh Nhân</th>
            <th scope="col">Liên Hệ & Định Danh</th>
            <th scope="col">Đơn Vị & Địa Chỉ</th>
            <th scope="col">Trạng Thái</th>
            <th scope="col" className="text-right">Hồ Sơ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const displayState = getRegistrationDisplayState(
              row.state,
              row.first_called_at,
            );
            const age = calculateAge(row.birth_date);

            return (
              <tr key={row.id}>
                {/* Ticket & Time */}
                <td className="col-ticket">
                  <div className="flex flex-col gap-1 items-start">
                    <span className="dym-ticket-tag">
                      {formatQueueNumber(row.queue_number)}
                    </span>
                    <div className="dym-time-cell">
                      <span>{formatRegistrationTime(row.registered_at)}</span>
                    </div>
                  </div>
                </td>

                {/* Patient Info */}
                <td>
                  <div className="dym-patient-block">
                    <div className="flex items-center gap-2">
                      <strong className="dym-patient-name uppercase tracking-tight">
                        {row.full_name}
                      </strong>
                      <span
                        className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                          row.gender === 'Nữ'
                            ? 'bg-rose-100 text-rose-700 border border-rose-200'
                            : 'bg-sky-100 text-sky-700 border border-sky-200'
                        }`}
                      >
                        {row.gender}
                      </span>
                    </div>
                    <div className="dym-patient-meta">
                      {age !== null && <span>{age} tuổi</span>}
                      {row.birth_date && (
                        <span>({formatBirthDate(row.birth_date)})</span>
                      )}
                    </div>
                  </div>
                </td>

                {/* Contact & ID */}
                <td>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-xs text-slate-900 tabular-nums">
                      {formatPhone(row.phone_number)}
                    </span>
                    <span className="text-xs text-slate-600 tabular-nums">
                      {row.identity_document || '—'}
                    </span>
                  </div>
                </td>

                {/* Company & Location */}
                <td>
                  <div className="flex flex-col gap-0.5 max-w-[280px]">
                    {row.company_name &&
                      row.company_name !== '—' &&
                      row.company_name !== 'Khách vãng lai' && (
                        <span
                          className="text-xs font-semibold text-slate-900 truncate"
                          title={row.company_name}
                        >
                          {row.company_name}
                        </span>
                      )}
                    <span
                      className="text-[11px] text-slate-700 leading-snug line-clamp-2"
                      title={formatFullAddress(
                        row.address_detail,
                        row.ward,
                        row.province,
                      )}
                    >
                      {formatFullAddress(
                        row.address_detail,
                        row.ward,
                        row.province,
                      )}
                    </span>
                  </div>
                </td>

                {/* Status */}
                <td>
                  <span className={`dym-status-badge ${displayState.cls}`}>
                    <span className="dym-status-indicator-dot" />
                    {displayState.label}
                  </span>
                </td>

                {/* Action Button */}
                <td className="text-right">
                  <div className="dym-table-actions-group">
                    <button
                      type="button"
                      className="dym-btn-table-action action-view"
                      onClick={() => onSelectRow(row)}
                      title="Xem hồ sơ chi tiết"
                    >
                      <EyeIcon
                        className="w-3.5 h-3.5 text-sky-600"
                        aria-hidden="true"
                      />
                      <span>Chi tiết</span>
                    </button>
                    <button
                      type="button"
                      className="dym-btn-table-action"
                      onClick={() => onPrintRow(row)}
                      title="In phiếu khám sức khỏe TT25"
                    >
                      <PrinterIcon
                        className="w-3.5 h-3.5 text-indigo-600"
                        aria-hidden="true"
                      />
                      <span>In TT25</span>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
