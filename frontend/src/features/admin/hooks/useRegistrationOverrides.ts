import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import type { BranchCode } from '../../../types/domain';
import type { RegistrationDetails, TT25StoredExtras } from '../types';

export interface RegistrationEditableFields {
  full_name: string;
  gender: 'Nam' | 'Nữ';
  birth_date: string;
  phone_number: string;
  identity_document: string;
  company_name: string;
  province: string;
  ward: string;
  address_detail: string;
  tt25_data?: TT25StoredExtras;
}

interface StoredOverride extends RegistrationEditableFields {
  updatedAt: number;
}

type OverrideMap = Record<string, StoredOverride>;
type CustomerExtrasMap = Record<string, TT25StoredExtras & { updatedAt: number }>;

const STORAGE_KEY = 'dym_registration_overrides_v1';
const EXTRAS_STORAGE_KEY = 'dym_tt25_customer_extras_v1';
const EVENT_NAME = 'dym-registration-override-change';
const MAX_STORED_ITEMS = 1000;

function readOverrides(): OverrideMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as OverrideMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeOverrides(map: OverrideMap): void {
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
    console.warn('Could not persist registration override:', err);
  }
}

function makeExtrasKey(queueNumber: number | string, cccd: string): string {
  const qNum = Number.parseInt(String(queueNumber), 10);
  const cleanDoc = (cccd || '').trim().toUpperCase();
  return `${Number.isFinite(qNum) ? qNum : queueNumber}:${cleanDoc}`;
}

function readCustomerExtras(): CustomerExtrasMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(EXTRAS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CustomerExtrasMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveCustomerTT25Extras(
  branch: BranchCode,
  queueNumber: number | string,
  identityDocument: string,
  extras: TT25StoredExtras,
): Promise<void> {
  const qNum = Number.parseInt(String(queueNumber), 10);
  const cleanDoc = (identityDocument || '').trim().toUpperCase();

  // 1. Save locally for immediate access on same browser
  if (typeof window !== 'undefined') {
    try {
      const map = readCustomerExtras();
      const key = makeExtrasKey(qNum, cleanDoc);
      map[key] = { ...extras, updatedAt: Date.now() };
      window.localStorage.setItem(EXTRAS_STORAGE_KEY, JSON.stringify(map));
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
    } catch {
      // Ignore storage quota errors
    }
  }

  // 2. Persist to Supabase so Admin on any machine gets full TT25 data
  if (Number.isFinite(qNum) && cleanDoc) {
    try {
      await supabase.rpc('save_registration_tt25_data', {
        p_branch_code: branch,
        p_queue_number: qNum,
        p_identity_document: cleanDoc,
        p_tt25_data: extras,
      });
    } catch (err) {
      console.info('Saved TT25 extras locally:', err);
    }
  }
}

export function getRegistrationOverride(
  id: string,
): StoredOverride | undefined {
  if (!id) return undefined;
  return readOverrides()[id];
}

export async function saveRegistrationEdit(
  id: string,
  fields: RegistrationEditableFields,
): Promise<void> {
  if (!id) return;

  const cleaned: RegistrationEditableFields = {
    full_name: fields.full_name.trim(),
    gender: fields.gender === 'Nữ' ? 'Nữ' : 'Nam',
    birth_date: fields.birth_date.trim(),
    phone_number: fields.phone_number.replace(/\s+/g, '').trim(),
    identity_document: fields.identity_document.trim().toUpperCase(),
    company_name: fields.company_name.trim(),
    province: fields.province.trim(),
    ward: fields.ward.trim(),
    address_detail: fields.address_detail.trim(),
    tt25_data: fields.tt25_data,
  };

  // 1. Save immediately in local override store for instant UI & print sync
  const currentMap = readOverrides();
  const prev = currentMap[id];
  currentMap[id] = {
    ...cleaned,
    tt25_data: {
      ...(prev?.tt25_data ?? {}),
      ...(cleaned.tt25_data ?? {}),
    },
    updatedAt: Date.now(),
  };
  writeOverrides(currentMap);

  // 2. Persist to Supabase via RPC if available
  try {
    const { error } = await supabase.rpc('update_registration_details', {
      p_registration_id: id,
      p_full_name: cleaned.full_name,
      p_birth_date: cleaned.birth_date,
      p_gender: cleaned.gender,
      p_phone_number: cleaned.phone_number,
      p_identity_document: cleaned.identity_document,
      p_company_name: cleaned.company_name,
      p_province: cleaned.province,
      p_ward: cleaned.ward,
      p_address_detail: cleaned.address_detail,
      p_tt25_data: cleaned.tt25_data ?? null,
    });
    if (error) {
      console.info(
        'Saved registration edit locally (remote RPC notice):',
        error.message,
      );
    }
  } catch (err) {
    console.info('Saved registration edit locally:', err);
  }
}

export function useRegistrationOverrides() {
  const [overrideMap, setOverrideMap] = useState<OverrideMap>(() =>
    readOverrides(),
  );
  const [extrasMap, setExtrasMap] = useState<CustomerExtrasMap>(() =>
    readCustomerExtras(),
  );

  useEffect(() => {
    const sync = () => {
      setOverrideMap(readOverrides());
      setExtrasMap(readCustomerExtras());
    };
    const handleStorage = (e: StorageEvent) => {
      if (
        e.key === STORAGE_KEY ||
        e.key === EXTRAS_STORAGE_KEY ||
        e.key === null
      ) {
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

  const applyToDetails = useCallback(
    (row: RegistrationDetails): RegistrationDetails => {
      const ov = overrideMap[row.id];
      const extKey = makeExtrasKey(row.queue_number, row.identity_document);
      const localExt = extrasMap[extKey];
      const mergedTt25: TT25StoredExtras = {
        ...(localExt ?? {}),
        ...(row.tt25_data ?? {}),
        ...(ov?.tt25_data ?? {}),
      };

      if (!ov && !localExt && !row.tt25_data) return row;

      return {
        ...row,
        full_name: ov?.full_name || row.full_name,
        gender: ov?.gender || row.gender,
        birth_date: ov?.birth_date || row.birth_date,
        phone_number: ov?.phone_number || row.phone_number,
        identity_document: ov?.identity_document ?? row.identity_document,
        company_name: ov?.company_name ?? row.company_name,
        province: ov?.province ?? row.province,
        ward: ov?.ward ?? row.ward,
        address_detail: ov?.address_detail ?? row.address_detail,
        tt25_data: mergedTt25,
      };
    },
    [overrideMap, extrasMap],
  );

  const applyToDetailsList = useCallback(
    (rows: RegistrationDetails[]): RegistrationDetails[] => {
      return rows.map(applyToDetails);
    },
    [applyToDetails],
  );

  return {
    overrideMap,
    applyToDetails,
    applyToDetailsList,
    saveEdit: saveRegistrationEdit,
  };
}
