import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import type { TT25StoredExtras } from '../types';

export interface PrintStatusItem {
  consent: boolean;
  tt25: boolean;
  updatedAt: number;
}

type PrintStatusMap = Record<string, PrintStatusItem>;

const STORAGE_KEY = 'dym_registration_print_status_v1';
const EVENT_NAME = 'dym-print-status-change';
const MAX_STORED_ITEMS = 2000;
const OPTIMISTIC_LOCK_MS = 4000;

const inFlightIds = new Set<string>();

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

async function persistPrintStatusToSupabase(
  registrationId: string,
  consent: boolean | null,
  tt25: boolean | null,
): Promise<void> {
  if (!registrationId) return;
  inFlightIds.add(registrationId);
  try {
    const { error } = await supabase.rpc('update_registration_print_status', {
      p_registration_id: registrationId,
      p_printed_consent: consent,
      p_printed_tt25: tt25,
    });
    if (error) throw new Error('Không thể lưu trạng thái in.');
  } finally {
    inFlightIds.delete(registrationId);
  }
}

export function syncPrintStatusesFromServer(
  items: Array<{ id: string; tt25_data?: TT25StoredExtras | null }>,
): void {
  if (!items.length || typeof window === 'undefined') return;
  const currentMap = readStorage();
  let changed = false;
  const now = Date.now();

  for (const item of items) {
    const extras = item.tt25_data;
    if (
      !extras ||
      (extras.printedConsent === undefined && extras.printedTT25 === undefined)
    ) {
      continue;
    }

    if (inFlightIds.has(item.id)) {
      continue;
    }

    const existing = currentMap[item.id];
    if (existing && now - existing.updatedAt < OPTIMISTIC_LOCK_MS) {
      continue;
    }

    const nextConsent =
      extras.printedConsent !== undefined
        ? Boolean(extras.printedConsent)
        : Boolean(existing?.consent);
    const nextTt25 =
      extras.printedTT25 !== undefined
        ? Boolean(extras.printedTT25)
        : Boolean(existing?.tt25);

    if (
      !existing ||
      existing.consent !== nextConsent ||
      existing.tt25 !== nextTt25
    ) {
      currentMap[item.id] = {
        consent: nextConsent,
        tt25: nextTt25,
        updatedAt: existing?.updatedAt ?? 0,
      };
      changed = true;
    }
  }

  if (changed) {
    writeStorage(currentMap);
  }
}

export async function markRegistrationPrinted(
  registrationId: string,
  docType: 'consent' | 'tt25' | 'both',
): Promise<void> {
  if (!registrationId) return;
  await persistPrintStatusToSupabase(
    registrationId,
    docType !== 'tt25' ? true : null,
    docType !== 'consent' ? true : null,
  );
  const currentMap = readStorage();
  const existing = currentMap[registrationId] ?? {
    consent: false,
    tt25: false,
    updatedAt: 0,
  };
  const nextItem: PrintStatusItem = {
    ...existing,
    consent: docType !== 'tt25' || existing.consent,
    tt25: docType !== 'consent' || existing.tt25,
    updatedAt: Date.now(),
  };
  currentMap[registrationId] = nextItem;
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
      title: 'Đã in đủ phiếu Đồng thuận & phiếu khám TT25',
    };
  }
  if (item?.consent) {
    return {
      label: 'Đã in (ĐT)',
      cls: 'badge-print-partial',
      isPrinted: true,
      isFull: false,
      title: 'Đã in phiếu Đồng thuận — Chưa in phiếu TT25',
    };
  }
  if (item?.tt25) {
    return {
      label: 'Đã in (TT25)',
      cls: 'badge-print-partial',
      isPrinted: true,
      isFull: false,
      title: 'Đã in phiếu TT25 — Chưa in phiếu Đồng thuận',
    };
  }
  return {
    label: 'Chưa in',
    cls: 'badge-print-pending',
    isPrinted: false,
    isFull: false,
    title: 'Chưa in hồ sơ',
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
    (registrationId: string, docType: 'consent' | 'tt25') => {
      return markRegistrationPrinted(registrationId, docType);
    },
    [],
  );

  const getStatus = useCallback(
    (registrationId: string, serverExtras?: TT25StoredExtras | null) => {
      const localItem = statusMap[registrationId];
      if (localItem !== undefined) {
        return getPrintStatusDisplay(localItem);
      }
      if (
        serverExtras &&
        (serverExtras.printedConsent !== undefined ||
          serverExtras.printedTT25 !== undefined)
      ) {
        return getPrintStatusDisplay({
          consent: Boolean(serverExtras.printedConsent),
          tt25: Boolean(serverExtras.printedTT25),
          updatedAt: 0,
        });
      }
      return getPrintStatusDisplay(undefined);
    },
    [statusMap],
  );

  return {
    statusMap,
    getStatus,
    markPrinted,
  };
}
