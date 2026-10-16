import React, { useEffect, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';

export interface BirthDateInputProps {
  value: string; // ISO format 'YYYY-MM-DD'
  onChange: (isoDate: string) => void;
  error?: string;
  onErrorClear?: () => void;
}

function isoToDisplay(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    if (y && m && d) {
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
  }
  return iso;
}

function displayToIso(display: string): string | null {
  const digits = display.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const day = parseInt(digits.slice(0, 2), 10);
  const month = parseInt(digits.slice(2, 4), 10);
  const year = parseInt(digits.slice(4, 8), 10);
  const currentYear = new Date().getFullYear();

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > currentYear) return null;

  const testDate = new Date(year, month - 1, day);
  if (
    testDate.getFullYear() !== year ||
    testDate.getMonth() !== month - 1 ||
    testDate.getDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDigits(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export const BirthDateInput: React.FC<BirthDateInputProps> = ({
  value,
  onChange,
  error,
  onErrorClear,
}) => {
  const [displayValue, setDisplayValue] = useState<string>(() => isoToDisplay(value));
  const hiddenPickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDisplayValue((prev) => {
      const formatted = isoToDisplay(value);
      if (value && formatted !== prev) {
        return formatted;
      }
      if (!value && prev.replace(/\D/g, '').length === 8) {
        return '';
      }
      return prev;
    });
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted = formatDigits(raw);
    setDisplayValue(formatted);
    if (onErrorClear) onErrorClear();

    const iso = displayToIso(formatted);
    if (iso) {
      onChange(iso);
    } else {
      onChange('');
    }
  };

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const iso = e.target.value; // 'YYYY-MM-DD'
    if (iso) {
      onChange(iso);
      setDisplayValue(isoToDisplay(iso));
      if (onErrorClear) onErrorClear();
    }
  };

  const triggerPicker = () => {
    try {
      if (hiddenPickerRef.current) {
        if (typeof hiddenPickerRef.current.showPicker === 'function') {
          hiddenPickerRef.current.showPicker();
        } else {
          hiddenPickerRef.current.focus();
        }
      }
    } catch {
      hiddenPickerRef.current?.focus();
    }
  };

  const maxDate = new Date().toISOString().split('T')[0];

  return (
    <div className="relative flex items-center w-full min-w-0">
      <input
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleTextChange}
        placeholder="18/01/2003"
        maxLength={10}
        className={`w-full min-w-0 pl-3 pr-10 py-2 bg-white border rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-dym-blue-200 transition-all ${
          error ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
        }`}
      />

      {/* Calendar Icon Button */}
      <button
        type="button"
        onClick={triggerPicker}
        className="absolute right-0 top-0 bottom-0 px-3 flex items-center justify-center text-slate-400 hover:text-dym-blue-600 transition-colors cursor-pointer"
        title="Chọn ngày từ lịch"
        aria-label="Chọn ngày từ lịch"
      >
        <Calendar className="w-4 h-4" />
      </button>

      {/* Hidden Native Picker for Mobile & Desktop Wheel */}
      <input
        ref={hiddenPickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value || ''}
        max={maxDate}
        min="1900-01-01"
        onChange={handlePickerChange}
        className="absolute right-0 top-0 bottom-0 w-10 opacity-0 cursor-pointer pointer-events-auto"
      />
    </div>
  );
};
