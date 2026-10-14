import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { ArrowPathIcon, PlayIcon } from '@heroicons/react/24/outline';

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
  return (
    <section id="queue-call" className="dym-operations" aria-labelledby="queue-title">
      <article className="dym-now-serving">
        <div className="dym-panel-kicker">
          <StatusDot
            variant="success"
            label="Quầy đang hoạt động"
            isPulsing
          />
          <span>Đang hoạt động</span>
        </div>
        <div className="dym-serving-copy">
          <span className="dym-serving-label">Đang gọi</span>
          <strong aria-label={`Đang gọi số ${currentQueue}`}>
            {currentQueue}
          </strong>
          <h2 id="queue-title">{currentPatient}</h2>
          <p>{branchName}</p>
        </div>
        <div className="dym-serving-actions">
          <Button
            label="Gọi số tiếp theo"
            variant="primary"
            size="lg"
            icon={<Icon icon={PlayIcon} size="sm" />}
            isDisabled={isMutating || isDataLoading || counts.waiting === 0}
            isLoading={pendingAction === 'next'}
            onClick={onCallNext}
            style={{
              color: 'var(--color-brand-accent-ink)',
              backgroundColor: 'var(--color-brand-accent)',
            }}
          />
          <Button
            label="Gọi lại"
            variant="secondary"
            size="lg"
            icon={<Icon icon={ArrowPathIcon} size="sm" />}
            isDisabled={isMutating || isDataLoading || currentQueue === '—'}
            isLoading={pendingAction === 'recall'}
            onClick={onRecallCurrent}
            style={{
              color: 'var(--color-ink)',
              borderColor: 'var(--color-rule-2)',
              backgroundColor: 'var(--color-paper-3)',
            }}
          />
        </div>
        <p className="dym-announcement" aria-live="polite">
          {announcement}
        </p>
      </article>

      <section className="dym-status-ledger" aria-labelledby="status-title">
        <div className="dym-section-heading">
          <div>
            <span className="dym-eyebrow">Tình hình hôm nay</span>
            <h2 id="status-title">Luồng tiếp nhận</h2>
          </div>
          <span className="dym-total-count">{totalDayCount} lượt</span>
        </div>
        <div className="dym-ledger-list">
          {STATUS_ORDER.map((status) => (
            <div className="dym-ledger-row" key={status}>
              <div>
                <StatusDot
                  variant={STATUS_META[status].dot}
                  label={STATUS_META[status].label}
                />
                <span>{STATUS_META[status].label}</span>
              </div>
              <strong>{counts[status]}</strong>
            </div>
          ))}
        </div>
        <p className="dym-ledger-note">
          Khách quét QR đăng ký sẽ vào “Chờ gọi”. Khi lễ tân gọi số, hệ thống tự chuyển khách sang “Đã gọi”.
        </p>
      </section>
    </section>
  );
}
