import { useCallback, useEffect, useState } from 'react';

export interface PrintStatusItem {
  consent: boolean;
  tt25: boolean;
  updatedAt: number;
}

type PrintStatusMap = Record<string, PrintStatusItem>;

const STORAGE_KEY = 'dym_registration_print_status_v1';
const EVENT_NAME = 'dym-print-status-change';
const MAX_STORED_ITEMS = 2000;

function readStorage(): PrintStatusMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PrintStatusMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorage(map: PrintStatusMap): void {
  if (typeof window === 'undefined') return;
  try {
    const entries = Object.entries(map);
    let nextMap = map;
    if (entries.length > MAX_STORED_ITEMS) {
      entries.sort((a, b) => (b[1]?.updatedAt ?? 0) - (a[1]?.updatedAt ?? 0));
      nextMap = Object.fromEntries(entries.slice(0, MAX_STORED_ITEMS));
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextMap));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch (err) {
    console.warn('Could not persist print status:', err);
  }
}

export function markRegistrationPrinted(
  registrationId: string,
  docType: 'consent' | 'tt25',
  printed = true,
): void {
  if (!registrationId) return;
  const currentMap = readStorage();
  const existing = currentMap[registrationId] ?? {
    consent: false,
    tt25: false,
    updatedAt: 0,
  };
  currentMap[registrationId] = {
    ...existing,
    [docType]: printed,
    updatedAt: Date.now(),
  };
  writeStorage(currentMap);
}

export function cycleRegistrationPrintStatus(registrationId: string): void {
  if (!registrationId) return;
  const currentMap = readStorage();
  const existing = currentMap[registrationId];
  const isBothPrinted = Boolean(existing?.consent && existing?.tt25);

  if (isBothPrinted) {
    delete currentMap[registrationId];
  } else {
    currentMap[registrationId] = {
      consent: true,
      tt25: true,
      updatedAt: Date.now(),
    };
  }
  writeStorage(currentMap);
}

export function getPrintStatusDisplay(item?: PrintStatusItem): {
  label: string;
  cls: string;
  isPrinted: boolean;
  isFull: boolean;
  title: string;
} {
  if (item?.consent && item?.tt25) {
    return {
      label: 'Đã in',
      cls: 'badge-print-done',
      isPrinted: true,
      isFull: true,
      title: 'Đã in đủ Đồng thuận & TT25 (Nhấn để đặt lại Chưa in)',
    };
  }
  if (item?.consent) {
    return {
      label: 'Đã in (ĐT)',
      cls: 'badge-print-partial',
      isPrinted: true,
      isFull: false,
      title: 'Đã in phiếu Đồng thuận — Chưa in TT25 (Nhấn để đánh dấu Đã in đủ)',
    };
  }
  if (item?.tt25) {
    return {
      label: 'Đã in (TT25)',
      cls: 'badge-print-partial',
      isPrinted: true,
      isFull: false,
      title: 'Đã in phiếu TT25 — Chưa in Đồng thuận (Nhấn để đánh dấu Đã in đủ)',
    };
  }
  return {
    label: 'Chưa in',
    cls: 'badge-print-pending',
    isPrinted: false,
    isFull: false,
    title: 'Chưa in hồ sơ (Nhấn để đánh dấu Đã in)',
  };
}

export function usePrintStatus() {
  const [statusMap, setStatusMap] = useState<PrintStatusMap>(() => readStorage());

  useEffect(() => {
    const sync = () => {
      setStatusMap(readStorage());
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) {
        sync();
      }
    };
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const markPrinted = useCallback(
    (registrationId: string, docType: 'consent' | 'tt25', printed = true) => {
      markRegistrationPrinted(registrationId, docType, printed);
    },
    [],
  );

  const togglePrintStatus = useCallback((registrationId: string) => {
    cycleRegistrationPrintStatus(registrationId);
  }, []);

  const getStatus = useCallback(
    (registrationId: string) => getPrintStatusDisplay(statusMap[registrationId]),
    [statusMap],
  );

  return {
    statusMap,
    getStatus,
    markPrinted,
    togglePrintStatus,
  };
}
