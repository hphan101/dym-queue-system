import { useEffect, useState } from 'react';
import {
  ArrowPathIcon,
  ClockIcon,
  PlayIcon,
  SpeakerWaveIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';

import {
  STATUS_META,
  STATUS_ORDER,
  type QueueStatus,
} from '../constants/queueConstants';

export type { QueueStatus };

interface QueueMetricsProps {
  currentQueue: string;
  currentPatient: string;
  branchName: string;
  announcement: string;
  isMutating: boolean;
  isDataLoading: boolean;
  counts: Record<QueueStatus, number>;
  totalDayCount: number;
  pendingAction: 'next' | 'recall' | null;
  onCallNext: () => void;
  onRecallCurrent: () => void;
}

export function QueueMetrics({
  currentQueue,
  currentPatient,
  branchName,
  announcement,
  isMutating,
  isDataLoading,
  counts,
  totalDayCount,
  pendingAction,
  onCallNext,
  onRecallCurrent,
}: QueueMetricsProps) {
  // Live clock display for clinical console
  const [currentTime, setCurrentTime] = useState<string>(() =>
    new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date()),
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(
        new Intl.DateTimeFormat('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(new Date()),
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const completionRate =
    totalDayCount > 0 ? Math.round((counts.called / totalDayCount) * 100) : 0;
  const isCallingActive = currentQueue !== '—' && currentQueue !== '';

  return (
    <section
      id="queue-call"
      className="dym-clinical-terminal"
      aria-labelledby="queue-terminal-title"
    >
      {/* Hero Console: Now Serving Terminal */}
      <article className="dym-terminal-hero">
        {/* Terminal Header */}
        <div className="dym-terminal-header">
          <div className="dym-terminal-radar">
            <span className="dym-radar-pulse" aria-hidden="true" />
            <span className="dym-terminal-pill">QUẦY TIẾP ĐÓN TRỰC TIẾP</span>
            <span className="dym-terminal-branch">{branchName}</span>
          </div>
          <div className="dym-terminal-clock" aria-label="Giờ tiếp nhận hiện tại">
            <ClockIcon className="dym-clock-icon" aria-hidden="true" />
            <span>{currentTime}</span>
          </div>
        </div>

        {/* Central Display Number Ticket */}
        <div className="dym-terminal-display">
          <span className="dym-display-kicker">
            {isCallingActive ? 'KHÁCH ĐANG PHỤC VỤ TẠI QUẦY' : 'SẴN SÀNG TIẾP NHẬN'}
          </span>

          <div
            className={`dym-display-number-card ${
              isCallingActive ? 'is-active' : 'is-idle'
            }`}
          >
            <div className="dym-number-glow" aria-hidden="true" />
            <span className="dym-number-ticket-header">DYM MEDICAL RECEIPT</span>
            <strong
              className="dym-display-digits"
              aria-label={`Đang gọi số ${currentQueue}`}
            >
              {currentQueue}
            </strong>
            <div className="dym-display-patient-name" id="queue-terminal-title">
              {currentPatient}
            </div>
            {isCallingActive && (
              <span className="dym-badge-serving">
                <span className="dym-badge-serving-dot" />
                ĐANG GỌI TẠI SẢNH
              </span>
            )}
          </div>
        </div>

        {/* Announcement Speaker Strip */}
        <div className="dym-terminal-announcement" aria-live="polite">
          <SpeakerWaveIcon className="dym-speaker-icon" aria-hidden="true" />
          <span className="dym-announcement-text">{announcement}</span>
        </div>

        {/* Action Button Strip */}
        <div className="dym-terminal-actions">
          <button
            type="button"
            className="dym-btn-call-next"
            disabled={isMutating || isDataLoading || counts.waiting === 0}
            data-loading={pendingAction === 'next'}
            onClick={onCallNext}
            aria-label="Gọi số tiếp theo trong hàng chờ"
          >
            <span className="dym-btn-call-icon">
              {pendingAction === 'next' ? (
                <span className="dym-btn-spinner" />
              ) : (
                <PlayIcon aria-hidden="true" />
              )}
            </span>
            <div className="dym-btn-call-copy">
              <span className="dym-btn-call-title">
                {pendingAction === 'next' ? 'Đang gọi số...' : 'GỌI SỐ TIẾP THEO'}
              </span>
              <span className="dym-btn-call-sub">
                {counts.waiting > 0
                  ? `Còn ${counts.waiting} khách đang chờ`
                  : 'Hàng chờ hiện tại đang trống'}
              </span>
            </div>
            <kbd className="dym-kbd-hint" title="Phím tắt: Phím Cách (Space)">
              Space
            </kbd>
          </button>

          <button
            type="button"
            className="dym-btn-recall"
            disabled={isMutating || isDataLoading || !isCallingActive}
            data-loading={pendingAction === 'recall'}
            onClick={onRecallCurrent}
            aria-label="Gọi lại số đang phục vụ"
          >
            <ArrowPathIcon
              className={`dym-recall-icon ${
                pendingAction === 'recall' ? 'animate-spin' : ''
              }`}
              aria-hidden="true"
            />
            <span className="dym-btn-recall-text">
              {pendingAction === 'recall' ? 'Đang gọi lại...' : 'Gọi lại số này'}
            </span>
            <kbd className="dym-kbd-hint" title="Phím tắt: Alt + R">
              Alt+R
            </kbd>
          </button>
        </div>
      </article>

      {/* Side Status Ledger & Analytics */}
      <aside className="dym-terminal-ledger" aria-labelledby="status-ledger-title">
        <div className="dym-ledger-header">
          <div>
            <span className="dym-ledger-subtitle">TIẾN ĐỘ TIẾP NHẬN</span>
            <h2 id="status-ledger-title" className="dym-ledger-title">
              Lưu lượng trong ngày
            </h2>
          </div>
          <span className="dym-ledger-total-pill">
            <UserGroupIcon className="w-4 h-4 mr-1.5 inline-block opacity-75" />
            {totalDayCount} lượt
          </span>
        </div>

        {/* Progress Tracker Bar */}
        <div className="dym-progress-card">
          <div className="dym-progress-info">
            <span className="dym-progress-label">Tỷ lệ hoàn thành</span>
            <span className="dym-progress-value">{completionRate}%</span>
          </div>
          <div
            className="dym-progress-track"
            role="progressbar"
            aria-valuenow={completionRate}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="dym-progress-fill"
              style={{ width: `${Math.min(100, Math.max(0, completionRate))}%` }}
            />
          </div>
        </div>

        {/* Status Breakdown Cards */}
        <div className="dym-status-cards">
          {STATUS_ORDER.map((status) => {
            const isWaiting = status === 'waiting';
            const count = counts[status];
            return (
              <div
                key={status}
                className={`dym-status-item ${isWaiting ? 'item-waiting' : 'item-called'}`}
              >
                <div className="dym-status-item-header">
                  <span className="dym-status-dot-indicator" />
                  <span className="dym-status-name">
                    {STATUS_META[status].label}
                  </span>
                </div>
                <div className="dym-status-count-row">
                  <strong className="dym-status-number">{count}</strong>
                  <span className="dym-status-unit">bệnh nhân</span>
                </div>
                <div className="dym-status-footnote">
                  {isWaiting
                    ? count > 0
                      ? 'Đang ngồi tại sảnh chờ'
                      : 'Không có bệnh nhân chờ'
                    : 'Đã hoàn tất tiếp đón'}
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </section>
  );
}
