import React from 'react';
import { PermissionButton as Button } from '@/features/admin/components/PermissionButton';
import { formatQueueNumber } from '../../../lib/queueNumber';
import { usePrintStatus } from '../hooks/usePrintStatus';
import type { RegistrationDetails } from '../types';
import { getTT25PrintCopies } from '../../registration/tt25Types';
import { getRegistrationCheckupReason } from '../utils/buildPrintData';
import {
  calculateAge,
  formatBirthDate,
  formatFullAddress,
  formatPhone,
  formatRegistrationTime,
  getRegistrationDisplayState,
} from '../utils/adminFormatters';
import { HighlightText } from './HighlightText';
import { ReceptionNoteCell } from './ReceptionNoteCell';

export interface RegistrationsTableProps {
  rows: RegistrationDetails[];
  searchQuery?: string;
  onSelectRow: (row: RegistrationDetails) => void;
  onPrintRow: (row: RegistrationDetails) => void;
  onPrintConsentRow?: (row: RegistrationDetails) => void;
  checkedIds?: Set<string>;
  onToggleChecked?: (ids: string[], checked: boolean) => void;
  onNoteSaved: (id: string, note: string) => void;
}

export const RegistrationsTable: React.FC<RegistrationsTableProps> = ({
  rows,
  searchQuery,
  onSelectRow,
  onPrintRow,
  onPrintConsentRow,
  checkedIds,
  onToggleChecked,
  onNoteSaved,
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
            <th scope="col">Số phiếu & giờ</th>
            <th scope="col">Tên khách hàng</th>
            <th scope="col">SĐT & CCCD</th>
            <th scope="col">Đơn vị & địa chỉ</th>
            <th scope="col">Ghi chú</th>
            <th scope="col">Trạng thái</th>
            <th scope="col">Trạng thái in</th>
            <th scope="col" className="text-right">Hồ sơ</th>
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
            const tt25Copies = getTT25PrintCopies({ checkupReason: getRegistrationCheckupReason(row) });

            return (
              <tr key={row.id} data-selected={checkedIds?.has(row.id) ?? false}>
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
                    <span className="dym-ticket-tag" data-parity={row.queue_number % 2 === 0 ? 'even' : 'odd'}>
                      <HighlightText
                        text={formatQueueNumber(row.queue_number)}
                        query={searchQuery}
                      />
                    </span>
                    <div className="dym-time-cell">
                      <span>{formatRegistrationTime(row.registered_at, false)}</span>
                    </div>
                  </div>
                </td>

                {/* Patient Info */}
                <td>
                  <div className="dym-patient-block">
                    <div className="flex items-center gap-2">
                      <strong className="dym-patient-name whitespace-nowrap uppercase">
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
                <td className="w-44 min-w-44 max-w-44">
                  <ReceptionNoteCell id={row.id} name={row.full_name} value={row.reception_note ?? ''} query={searchQuery} onSaved={(note) => onNoteSaved(row.id, note)} />
                </td>
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
                      <Button permissionAction="view" permissionModule="printing"
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 bg-card px-3 text-xs"
                        onClick={() => onPrintConsentRow(row)}
                        title="In phiếu Đồng thuận khám sức khỏe"
                      >
                        In Đồng thuận · 1 bộ
                      </Button>
                    )}
                    <Button permissionAction="view" permissionModule="printing"
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 bg-card px-3 text-xs"
                      onClick={() => onPrintRow(row)}
                      title="In phiếu khám sức khỏe TT25"
                    >
                      In TT25 · {tt25Copies} bộ
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
