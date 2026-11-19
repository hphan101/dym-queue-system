import type { RosterAssignment, ShiftPeriod } from './types';

type Shift = Pick<RosterAssignment, 'shift_period' | 'start_minute' | 'end_minute'>;

const LEGACY_RANGES: Record<ShiftPeriod, [number, number]> = {
  FULL: [0, 1440], AM: [0, 720], PM: [720, 1440],
};

export const CLINIC_SHIFT_DEFAULTS: Record<ShiftPeriod, [number, number]> = {
  FULL: [420, 900], AM: [420, 720], PM: [720, 900],
};

export function formatShiftMinute(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export function formatAssignmentShift(shift: Shift) {
  if (shift.start_minute != null && shift.end_minute != null) {
    return `${formatShiftMinute(shift.start_minute)}–${formatShiftMinute(shift.end_minute)}`;
  }
  return shift.shift_period === 'FULL' ? 'Cả ngày' : shift.shift_period;
}

export function assignmentShiftsOverlap(first: Shift, second: Shift) {
  const [firstStart, firstEnd] = LEGACY_RANGES[first.shift_period];
  const [secondStart, secondEnd] = LEGACY_RANGES[second.shift_period];
  return (first.start_minute ?? firstStart) < (second.end_minute ?? secondEnd)
    && (second.start_minute ?? secondStart) < (first.end_minute ?? firstEnd);
}

export function calculateClinicShiftCost(dayRate: number, start: number, end: number) {
  return Math.round(dayRate * Math.max(0, end - start) / 480);
}
