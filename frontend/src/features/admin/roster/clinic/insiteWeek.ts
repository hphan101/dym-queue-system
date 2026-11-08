import {
  shiftIsoDate,
  type ClinicRoom,
  type DailyRoomOverride,
  type RosterAssignment,
  type RosterSchedule,
} from '../data/rosterService';

export function getInsiteWeekDates(date: string): string[] {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const monday = shiftIsoDate(date, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => shiftIsoDate(monday, index));
}

export function buildInsiteWeek(
  dates: string[],
  branch: string,
  rooms: ClinicRoom[],
  overrides: DailyRoomOverride[],
  schedules: RosterSchedule[],
  assignments: RosterAssignment[],
) {
  const rows = new Map<
    string,
    {
      key: string;
      name: string;
      order: number;
      days: Map<string, RosterAssignment[]>;
    }
  >();
  for (const date of dates) {
    const dailyOverrides = overrides.filter(
      (item) => item.branch_code === branch && item.schedule_date === date,
    );
    const hidden = new Set(
      dailyOverrides
        .filter((item) => item.override_type === 'hide')
        .map((item) => item.room_id),
    );
    const effective = [
      ...rooms
        .filter(
          (room) =>
            room.branch_code === branch &&
            room.is_active &&
            (!room.inactive_from || date < room.inactive_from) &&
            !hidden.has(room.id),
        )
        .map((room) => ({
          key: `room:${room.id}`,
          name: room.room_name,
          order: room.display_order,
        })),
      ...dailyOverrides
        .filter((item) => item.override_type === 'add')
        .map((item) => ({
          key: `override:${item.id}`,
          name: item.custom_room_name,
          order: item.display_order,
        })),
    ];
    const scheduleIds = new Set(
      schedules
        .filter(
          (item) =>
            item.branch_code === branch &&
            item.schedule_date === date &&
            item.schedule_type === 'insite',
        )
        .map((item) => item.id),
    );
    for (const room of effective) {
      if (!rows.has(room.key)) rows.set(room.key, { ...room, days: new Map() });
      rows.get(room.key)!.days.set(
        date,
        assignments.filter(
          (item) =>
            scheduleIds.has(item.schedule_id) &&
            (item.daily_override_id
              ? `override:${item.daily_override_id}`
              : `room:${item.room_id}`) === room.key,
        ),
      );
    }
  }
  return [...rows.values()].sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name),
  );
}
