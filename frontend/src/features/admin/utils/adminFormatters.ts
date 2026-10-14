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

