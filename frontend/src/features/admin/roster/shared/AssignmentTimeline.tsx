import type { ReactNode } from 'react';
import type { PersonnelRoleType, RosterAssignment } from '../data/types';
import { CLINIC_SHIFT_DEFAULTS, SHIFT_MINUTES } from '../data/shiftTime';

const START = 7 * 60;
const END = 18 * 60;
const HOURS = SHIFT_MINUTES.filter((minute) => minute >= START && minute < END && minute % 60 === 0);
const percent = (minutes: number) => `${minutes / (END - START) * 100}%`;

export function AssignmentTimelineScale() {
  return (
    <div className="dym-assignment-scale dym-roster-tabular" aria-hidden="true">
      {[...HOURS, END].map((minute) => (
        <span key={minute} style={{ insetInlineStart: percent(minute - START) }}>
          {minute / 60}h
        </span>
      ))}
    </div>
  );
}

export function AssignmentTimelineAddLabels() {
  const label = '+ Thêm';
  return (
    <>
      {HOURS.map((minute) => (
        <span key={minute} className="dym-assignment-add-hour" data-start-minute={minute} aria-hidden="true">
          <span>{label}</span>
        </span>
      ))}
      <span className="dym-assignment-add-label" aria-hidden="true">{label}</span>
    </>
  );
}

export function AssignmentTimelineTrack({ assignments, role, label, renderAssignment }: {
  assignments: RosterAssignment[];
  role?: PersonnelRoleType;
  label: string;
  renderAssignment: (assignment: RosterAssignment, gridColumn?: string) => ReactNode;
}) {
  const shifts = assignments.map((assignment) => {
    const [defaultStart, defaultEnd] = CLINIC_SHIFT_DEFAULTS[assignment.shift_period];
    return {
      assignment,
      start: Math.max(START, assignment.start_minute ?? defaultStart),
      end: Math.min(END, assignment.end_minute ?? defaultEnd),
    };
  }).sort((a, b) => a.start - b.start);
  const visible = shifts.filter(({ start, end }) => start < end);
  const outside = shifts.filter(({ start, end }) => start >= end);

  return (
    <>
      {visible.length > 0 && (
        <div className="dym-assignment-track" data-personnel-role={role} role="group" aria-label={label}>
          {visible.map(({ assignment, start, end }) => renderAssignment(
            assignment,
            `${(start - START) / 15 + 1} / ${(end - START) / 15 + 1}`,
          ))}
        </div>
      )}
      {outside.length > 0 && (
        <div className="dym-assignment-outside flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Ngoài khung giờ</span>
          {outside.map(({ assignment }) => renderAssignment(assignment))}
        </div>
      )}
    </>
  );
}
