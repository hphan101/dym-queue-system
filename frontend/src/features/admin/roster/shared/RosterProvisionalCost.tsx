import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  formatCurrencyInput,
  formatVndCurrency,
  parseCurrencyInput,
  saveInsiteProvisionalCost,
  saveScheduleProvisionalCost,
} from '../data/rosterService';
import './provisionalCost.css';

export function RosterProvisionalCost({
  branch,
  date,
  scheduleId,
  amount,
  onSaved,
  disabled,
  readOnly = false,
  historical = false,
}: {
  branch: 'q1' | 'q7';
  date: string;
  scheduleId?: string;
  amount: number;
  onSaved: () => Promise<void>;
  disabled: boolean;
  readOnly?: boolean;
  historical?: boolean;
}) {
  const inputId = useId();
  const [value, setValue] = useState(amount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const explanation = historical
    ? 'Dự phòng lưu tham khảo, không cộng vào chi phí thực tế của ngày đã qua.'
    : 'Cộng thêm vào chi phí đã xếp. Khi chốt người, vận hành tự giảm dự phòng hoặc đưa về 0.';
  if (readOnly)
    return (
      <div className="dym-provisional-editor dym-provisional-readonly">
        <div className="dym-provisional-copy">
          <span className="dym-provisional-label">Chi phí dự phòng đã ghi</span>
          <p>{explanation}</p>
        </div>
        <strong className="dym-provisional-amount">
          {formatVndCurrency(amount)}
        </strong>
      </div>
    );
  return (
    <form
      className="dym-provisional-editor"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setSaved(false);
        void (
          scheduleId
            ? saveScheduleProvisionalCost(scheduleId, value)
            : saveInsiteProvisionalCost(branch, date, value)
        )
          .then(async () => {
            await onSaved();
            setSaved(true);
          })
          .catch((cause: unknown) =>
            setError(
              cause instanceof Error
                ? cause.message
                : 'Không thể lưu dự phòng.',
            ),
          )
          .finally(() => setBusy(false));
      }}
    >
      <div className="dym-provisional-copy">
        <label htmlFor={inputId} className="dym-provisional-label">
          Chi phí dự phòng còn thiếu
        </label>
        <p id={`${inputId}-description`}>{explanation}</p>
      </div>
      <div className="dym-provisional-controls">
        <div className="dym-provisional-input">
          <Input
            id={inputId}
            aria-label="Chi phí dự phòng còn thiếu (VNĐ)"
            aria-describedby={`${inputId}-description`}
            placeholder="0"
            inputMode="numeric"
            value={formatCurrencyInput(value)}
            disabled={busy || disabled}
            onChange={(event) => {
              setValue(parseCurrencyInput(event.target.value));
              setSaved(false);
            }}
          />
          <span aria-hidden="true">VNĐ</span>
        </div>
        <Button type="submit" disabled={busy || disabled}>
          {busy ? 'Đang lưu…' : 'Lưu dự phòng'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="w-full text-sm">
          Đã lưu chi phí dự phòng.
        </p>
      )}
    </form>
  );
}
