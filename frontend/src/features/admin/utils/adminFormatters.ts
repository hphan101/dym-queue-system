export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('vi')
    .trim();
}

const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatRegistrationTime(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return dateTimeFormatter.format(new Date(value));
  } catch {
    return String(value);
  }
}

export function formatDateTime(value: string | null | undefined): string {
  return formatRegistrationTime(value);
}

/** Formats ISO string 'YYYY-MM-DD' into Vietnamese format 'DD/MM/YYYY' */
export function formatDisplayDate(isoDate?: string | null, fallback = '--/--/----'): string {
  if (!isoDate) return fallback;
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return isoDate;
}

const centralCities = [
  'hà nội',
  'hồ chí minh',
  'đà nẵng',
  'hải phòng',
  'cần thơ',
  'huế',
];

export function normalizeProvinceName(province?: string | null): string {
  if (!province) return '';
  const trimmed = province.trim();
  if (!trimmed || trimmed === '—') return '';
  if (/^(tỉnh|thành phố|tp\.?)\s+/i.test(trimmed)) return trimmed;

  const lower = trimmed.toLowerCase();
  if (centralCities.some((c) => lower.includes(c))) {
    return `Thành phố ${trimmed}`;
  }
  return `Tỉnh ${trimmed}`;
}

export function normalizeWardName(ward?: string | null, province?: string | null): string {
  if (!ward) return '';
  const trimmed = ward.trim();
  if (!trimmed || trimmed === '—') return '';
  if (/^(phường|xã|thị trấn|tt\.?)\s+/i.test(trimmed)) return trimmed;

  // Numeric or P.xx -> "Phường "
  if (/^(p\.?|phường\s*)?\d+$/i.test(trimmed)) {
    return `Phường ${trimmed.replace(/^p\.?\s*/i, '')}`;
  }

  const provLower = (province || '').toLowerCase();
  const isCentral = centralCities.some((c) => provLower.includes(c));
  if (isCentral && !/(xã|thôn|ấp|bình chánh|thạnh an|nhà bè|củ chi|hóc môn)/i.test(provLower)) {
    return `Phường ${trimmed}`;
  }

  return `Xã ${trimmed}`;
}

export function formatFullAddress(
  addressDetail?: string | null,
  ward?: string | null,
  province?: string | null,
): string {
  const parts: string[] = [];

  const cleanDetail = (addressDetail || '').trim();
  if (cleanDetail && cleanDetail !== '—') {
    parts.push(cleanDetail);
  }

  const cleanWard = normalizeWardName(ward, province);
  if (cleanWard) {
    parts.push(cleanWard);
  }

  const cleanProvince = normalizeProvinceName(province);
  if (cleanProvince) {
    parts.push(cleanProvince);
  }

  return parts.length > 0 ? parts.join(', ') : '—';
}

export function calculateAge(birthDateStr?: string | null): number | null {
  if (!birthDateStr) return null;
  const trimmed = birthDateStr.trim();
  if (!trimmed || trimmed === '—') return null;

  const currentYear = new Date().getFullYear();
  let birthYear: number | null = null;

  if (trimmed.includes('-')) {
    const year = Number.parseInt(trimmed.split('-')[0] ?? '', 10);
    birthYear = Number.isNaN(year) ? null : year;
  } else if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    const year = Number.parseInt(parts[parts.length - 1] ?? '', 10);
    birthYear = Number.isNaN(year) ? null : year;
  }

  if (birthYear === null || birthYear < 1900 || birthYear > currentYear) return null;
  return currentYear - birthYear;
}

export function formatPhone(value?: string | null): string {
  if (!value) return '—';
  const clean = value.replace(/\D/g, '');
  if (clean.length === 10) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 7)} ${clean.slice(7)}`;
  }
  return clean || value;
}

export function formatBirthDate(value?: string | null): string {
  return formatDisplayDate(value, '—');
}

export function getRegistrationDisplayState(
  state: 'active' | 'completed' | 'cancelled',
  firstCalledAt: string | null,
) {
  if (state === 'completed') {
    return { key: 'completed', label: 'Hoàn tất', cls: 'badge-called' };
  }
  if (state === 'cancelled') {
    return { key: 'cancelled', label: 'Đã hủy', cls: 'badge-cancelled' };
  }
  if (firstCalledAt) {
    return { key: 'called', label: 'Đã gọi', cls: 'badge-called' };
  }
  return { key: 'waiting', label: 'Chờ gọi', cls: 'badge-waiting' };
}


