import { TextInput } from '@astryxdesign/core/TextInput';
import {
  ArrowUturnLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import type { BranchCode } from '../../../types/domain';
import { STATUS_META, type QueueStatus } from '../constants/queueConstants';

export interface RegistrationRow {
  id: string;
  queueNumber: string;
  registeredAt: string;
  date: string;
  fullName: string;
  birthDate: string;
  gender: string;
  phone: string;
  companyName: string;
  branch: BranchCode;
  status: QueueStatus;
}

interface QueueTableProps {
  filteredRows: RegistrationRow[];
  paginatedRows: RegistrationRow[];
  query: string;
  onQueryChange: (query: string) => void;
  isDataLoading: boolean;
  isMutating: boolean;
  pendingUndoId: string | null;
  branchName: string;
  date: string;
  today: string;
  visiblePage: number;
  totalPages: number;
  firstVisibleRow: number;
  lastVisibleRow: number;
  onPageChange: (page: number) => void;
  onReturnToWaiting: (row: RegistrationRow) => void;
}

export function QueueTable({
  filteredRows,
  paginatedRows,
  query,
  onQueryChange,
  isDataLoading,
  isMutating,
  pendingUndoId,
  branchName,
  date,
  today,
  visiblePage,
  totalPages,
  firstVisibleRow,
  lastVisibleRow,
  onPageChange,
  onReturnToWaiting,
}: QueueTableProps) {
  return (
    <section className="dym-registry" aria-labelledby="dashboard-registry-title">
      <div className="dym-registry-toolbar">
        <div>
          <span className="dym-eyebrow">Sổ tiếp nhận</span>
          <h2 id="dashboard-registry-title">Danh sách trong ngày</h2>
          <p>
            {filteredRows.length} lượt tại {branchName} · 20 dòng mỗi trang
          </p>
        </div>
        <div className="dym-search">
          <TextInput
            label="Tìm kiếm lượt đăng ký"
            isLabelHidden
            value={query}
            onChange={onQueryChange}
            startIcon={MagnifyingGlassIcon}
            placeholder="Tìm tên, SĐT, công ty hoặc số thứ tự"
            hasClear
            width="100%"
            className="dym-search-control"
          />
        </div>
      </div>

      {isDataLoading ? (
        <div className="dym-empty-state" aria-live="polite">
          <div className="page-loader-dots" aria-hidden="true" />
          <h3>Đang tải danh sách</h3>
          <p>Dữ liệu đang được đồng bộ từ Supabase.</p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="dym-empty-state">
          <UserGroupIcon aria-hidden="true" />
          <h3>
            {query ? 'Không tìm thấy lượt phù hợp' : 'Chưa có lượt đăng ký'}
          </h3>
          <p>
            {query
              ? 'Hãy thử tìm bằng tên, số điện thoại hoặc số thứ tự khác.'
              : 'Khách đăng ký bằng mã QR sẽ xuất hiện tại đây.'}
          </p>
          {query && (
            <button type="button" onClick={() => onQueryChange('')}>
              Xóa tìm kiếm
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="dym-table-wrap">
            <table className="dym-dashboard-table">
              <thead>
                <tr>
                  <th scope="col">Số</th>
                  <th scope="col">Đăng ký</th>
                  <th scope="col">Khách hàng</th>
                  <th scope="col">Giới tính</th>
                  <th scope="col">Ngày sinh</th>
                  <th scope="col">Số điện thoại</th>
                  <th scope="col">Công ty</th>
                  <th scope="col">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong className="dym-queue-code">
                        {row.queueNumber}
                      </strong>
                    </td>
                    <td className="dym-table-secondary">
                      {row.registeredAt}
                    </td>
                    <td>
                      <strong>{row.fullName}</strong>
                    </td>
                    <td>{row.gender}</td>
                    <td className="dym-table-secondary">
                      {row.birthDate}
                    </td>
                    <td className="dym-table-secondary">{row.phone}</td>
                    <td className="dym-dashboard-company">
                      {row.companyName}
                    </td>
                    <td>
                      <div className="dym-dashboard-row-actions">
                        <span
                          className="dym-dashboard-status"
                          data-state={row.status}
                        >
                          {STATUS_META[row.status].label}
                        </span>
                        {row.status === 'called' && date === today && (
                          <button
                            type="button"
                            className="dym-queue-undo"
                            aria-label={`Đưa số ${row.queueNumber} về Chờ gọi`}
                            disabled={isMutating}
                            data-loading={pendingUndoId === row.id}
                            onClick={() => onReturnToWaiting(row)}
                          >
                            <ArrowUturnLeftIcon aria-hidden="true" />
                            <span>
                              {pendingUndoId === row.id
                                ? 'Đang hoàn tác'
                                : 'Đưa về chờ'}
                            </span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav
            className="dym-dashboard-pagination"
            aria-label="Phân trang danh sách tại bàn điều phối"
          >
            <span>
              {firstVisibleRow}–{lastVisibleRow} trong {filteredRows.length} lượt
            </span>
            <div>
              <button
                type="button"
                aria-label="Trang trước"
                disabled={visiblePage === 1}
                onClick={() => onPageChange(Math.max(1, visiblePage - 1))}
              >
                <ChevronLeftIcon aria-hidden="true" />
                <span>Trước</span>
              </button>
              <span aria-current="page">
                Trang <strong>{visiblePage}</strong> / {totalPages}
              </span>
              <button
                type="button"
                aria-label="Trang sau"
                disabled={visiblePage === totalPages}
                onClick={() => onPageChange(Math.min(totalPages, visiblePage + 1))}
              >
                <span>Sau</span>
                <ChevronRightIcon aria-hidden="true" />
              </button>
            </div>
          </nav>
        </>
      )}
    </section>
  );
}
