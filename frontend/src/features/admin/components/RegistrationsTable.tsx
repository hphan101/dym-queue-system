import React from 'react';
import { Button } from '@/components/ui/button';
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
  checkedIds?: Set<string>;
  onToggleChecked?: (ids: string[], checked: boolean) => void;
}

export const RegistrationsTable: React.FC<RegistrationsTableProps> = ({
  rows,
  searchQuery,
  onSelectRow,
  onPrintRow,
  onPrintConsentRow,
  checkedIds,
  onToggleChecked,
}) => {
  const { getStatus } = usePrintStatus();
  const isSelectable = Boolean(checkedIds && onToggleChecked);
  const allChecked =
    isSelectable && rows.length > 0 && rows.every((r) => checkedIds!.has(r.id));

  return (
    <div className="dym-table-scroller">
      <table className="dym-table-precision">
        <thead>
          <tr>
            {isSelectable && (
              <th scope="col" className="w-10">
                <input
                  type="checkbox"
                  className="size-4 cursor-pointer accent-primary align-middle"
                  checked={allChecked}
                  onChange={(e) =>
                    onToggleChecked!(rows.map((r) => r.id), e.target.checked)
                  }
                  aria-label="Chọn tất cả hồ sơ trên trang này"
                />
              </th>
            )}
            <th scope="col">Số Phiếu & Giờ</th>
            <th scope="col">Tên Khách Hàng</th>
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
            const printStatus = getStatus(row.id, row.tt25_data);

            return (
              <tr key={row.id}>
                {isSelectable && (
                  <td className="w-10">
                    <input
                      type="checkbox"
                      className="size-4 cursor-pointer accent-primary align-middle"
                      checked={checkedIds!.has(row.id)}
                      onChange={(e) => onToggleChecked!([row.id], e.target.checked)}
                      aria-label={`Chọn hồ sơ ${row.full_name}`}
                    />
                  </td>
                )}
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
                        className={`inline-flex items-center text-[11px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                          row.gender === 'Nữ'
                            ? 'bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
                            : 'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900'
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
                  <span
                    title={printStatus.title}
                    className={`dym-status-badge ${printStatus.cls}`}
                  >
                    <span className="dym-status-indicator-dot" />
                    {printStatus.label}
                  </span>
                </td>

                {/* Action Button */}
                <td className="text-right">
                  <div className="dym-table-actions-group">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 bg-card px-3 text-xs"
                      onClick={() => onSelectRow(row)}
                      title="Xem hồ sơ chi tiết"
                    >
                      Chi tiết
                    </Button>
                    {onPrintConsentRow && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 bg-card px-3 text-xs"
                        onClick={() => onPrintConsentRow(row)}
                        title="In phiếu Đồng thuận khám sức khỏe"
                      >
                        In Đồng thuận
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 bg-card px-3 text-xs"
                      onClick={() => onPrintRow(row)}
                      title="In phiếu khám sức khỏe TT25"
                    >
                      In TT25
                    </Button>
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
