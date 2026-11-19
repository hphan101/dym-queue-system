const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const { rosterPath } = require('./helpers/roster-modules.cjs');

const shifts = {};
const source = fs.readFileSync(rosterPath('shiftTime.ts'), 'utf8');
new Function('exports', ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(shifts);

test('clinic shift costs round once and adjacent quarter-hour ranges do not overlap', () => {
  const morning = { shift_period: 'FULL', start_minute: 435, end_minute: 735 };
  const next = { shift_period: 'FULL', start_minute: 735, end_minute: 750 };
  assert.equal(shifts.formatAssignmentShift(morning), '07:15–12:15');
  assert.equal(shifts.calculateClinicShiftCost(1500000, 435, 735), 937500);
  assert.equal(shifts.calculateClinicShiftCost(1500000, 735, 750), 46875);
  assert.equal(shifts.assignmentShiftsOverlap(morning, next), false);
  assert.equal(shifts.assignmentShiftsOverlap(morning, { ...next, start_minute: 720 }), true);
  assert.equal(shifts.assignmentShiftsOverlap(morning, { shift_period: 'PM' }), true);
});

test('database allows back-to-back clinic assignments and rejects overlaps, off-grid times and mismatched costs', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.roster_schedules (id integer primary key, schedule_date date not null);
      create table public.roster_assignments (
        id integer generated always as identity primary key,
        schedule_id integer not null references public.roster_schedules(id),
        personnel_id integer not null, shift_period text not null default 'FULL',
        base_cost_snapshot bigint not null
      );
      insert into roster_schedules values (1, '2026-11-20'), (2, '2026-11-20'), (3, '2026-11-21');
      insert into roster_assignments (schedule_id, personnel_id, shift_period, base_cost_snapshot)
        values (1, 2, 'AM', 1500000);
    `);
    await db.exec(fs.readFileSync(path.resolve(__dirname,
      '../../supabase/migrations/20261119153000_add_clinic_assignment_time_slots.sql'), 'utf8'));
    const assign = (schedule, person, start, end, cost = shifts.calculateClinicShiftCost(1500000, start, end)) =>
      db.query(`insert into roster_assignments
        (schedule_id, personnel_id, start_minute, end_minute, day_rate_snapshot, base_cost_snapshot)
        values ($1, $2, $3, $4, 1500000, $5)`, [schedule, person, start, end, cost]);
    await assign(1, 1, 435, 735);
    await assign(2, 1, 735, 750);
    await assign(3, 1, 435, 735);
    await assert.rejects(assign(2, 1, 720, 735), { code: '23P01' });
    await assert.rejects(assign(2, 2, 705, 720), { code: '23P01' });
    await assert.rejects(assign(2, 3, 436, 735), { code: '23514' });
    await assert.rejects(assign(2, 3, 345, 360), { code: '23514' });
    await assert.rejects(assign(2, 3, 435, 735, 1), { code: '23514' });
    await assign(2, 3, 1425, 1440);
  } finally {
    await db.close();
  }
});
