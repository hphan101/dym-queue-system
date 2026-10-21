import React from 'react';
import { formatQueueNumber } from '../../../lib/queueNumber';
import { usePrintStatus } from '../hooks/usePrintStatus';
import type { RegistrationDetails } from '../types';
import {
  calculateAge,
  formatBirthDate,
  formatFullAddress,
  formatPhone,
  formatRegistrationTime,
  getRegistrationDisplayState,
} from '../utils/adminFormatters';
import { HighlightText } from './HighlightText';

export interface RegistrationsTableProps {
  rows: RegistrationDetails[];
  searchQuery?: string;
  onSelectRow: (row: RegistrationDetails) => void;
  onPrintRow: (row: RegistrationDetails) => void;
  onPrintConsentRow?: (row: RegistrationDetails) => void;
}

export const RegistrationsTable: React.FC<RegistrationsTableProps> = ({
  rows,
  searchQuery,
  onSelectRow,
  onPrintRow,
  onPrintConsentRow,
}) => {
  const { getStatus, togglePrintStatus } = usePrintStatus();

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
            <th scope="col">Trạng Thái In</th>
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
            const printStatus = getStatus(row.id);

            return (
              <tr key={row.id}>
                {/* Ticket & Time */}
                <td className="col-ticket">
                  <div className="flex flex-col gap-1 items-start">
                    <span className="dym-ticket-tag">
                      <HighlightText
                        text={formatQueueNumber(row.queue_number)}
                        query={searchQuery}
                      />
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
                        <HighlightText
                          text={row.full_name}
                          query={searchQuery}
                        />
                      </strong>
                      <span
                        className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
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
                        <span>
                          (
                          <HighlightText
                            text={formatBirthDate(row.birth_date)}
                            query={searchQuery}
                          />
                          )
                        </span>
                      )}
                    </div>
                  </div>
                </td>

                {/* Contact & ID */}
                <td>
                  <div className="flex flex-col gap-0.5">
                    <span className="dym-contact-phone">
                      <HighlightText
                        text={formatPhone(row.phone_number)}
                        query={searchQuery}
                      />
                    </span>
                    <span className="dym-contact-id">
                      {row.identity_document ? (
                        <HighlightText
                          text={row.identity_document}
                          query={searchQuery}
                        />
                      ) : (
                        '—'
                      )}
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
                          className="dym-company-name truncate"
                          title={row.company_name}
                        >
                          <HighlightText
                            text={row.company_name}
                            query={searchQuery}
                          />
                        </span>
                      )}
                    <span
                      className="dym-address-line line-clamp-2"
                      title={formatFullAddress(
                        row.address_detail,
                        row.ward,
                        row.province,
                      )}
                    >
                      <HighlightText
                        text={formatFullAddress(
                          row.address_detail,
                          row.ward,
                          row.province,
                        )}
                        query={searchQuery}
                      />
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

                {/* Print Status */}
                <td>
                  <button
                    type="button"
                    onClick={() => togglePrintStatus(row.id)}
                    title={printStatus.title}
                    className={`dym-status-badge dym-print-status-btn ${printStatus.cls}`}
                  >
                    <span className="dym-status-indicator-dot" />
                    {printStatus.label}
                  </button>
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
                      <span>Chi tiết</span>
                    </button>
                    {onPrintConsentRow && (
                      <button
                        type="button"
                        className="dym-btn-table-action"
                        onClick={() => onPrintConsentRow(row)}
                        title="In phiếu Đồng thuận khám sức khỏe"
                      >
                        <span>In Đồng thuận</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="dym-btn-table-action"
                      onClick={() => onPrintRow(row)}
                      title="In phiếu khám sức khỏe TT25"
                    >
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
