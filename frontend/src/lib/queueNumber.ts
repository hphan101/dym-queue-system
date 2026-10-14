const MINIMUM_QUEUE_NUMBER_DIGITS = 3;

export function formatQueueNumber(value: number | string) {
  const parsedValue = Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return String(value);
  }

  return String(parsedValue).padStart(MINIMUM_QUEUE_NUMBER_DIGITS, '0');
}
