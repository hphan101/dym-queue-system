import type { BranchCode } from '../../../../types/domain';
import type { PositionOrderMode } from '../onsite/campaignPositionOrder';
import type { DoctorSpecialty } from '../personnel/doctorSpecialties';

export type PersonnelRoleType = 'doctor' | 'nurse' | 'technician' | 'ctv';

export type RosterScheduleType =
  'insite' | 'onsite_exam' | 'blood_draw' | 'setup';

export type ShiftPeriod = 'FULL' | 'AM' | 'PM';

export interface MedicalPersonnel {
  id: string;
  personnel_code: string;
  full_name: string;
  identity_number: string;
  practicing_certificate: string;
  specialties: DoctorSpecialty[];
  role_type: PersonnelRoleType;
  phone_number: string;
  email: string;
  fixed_cost: number;
  is_active: boolean;
  assignment_count?: number;
  created_at: string;
  updated_at: string;
}

export interface MedicalPersonnelInput {
  id?: string | null;
  personnel_code: string;
  full_name: string;
  identity_number?: string;
  practicing_certificate?: string;
  specialties?: DoctorSpecialty[];
  role_type: PersonnelRoleType;
  phone_number: string;
  email: string;
  fixed_cost: number;
  is_active?: boolean;
}

export interface ClinicRoom {
  doctor_specialty: DoctorSpecialty | null;
  id: string;
  branch_code: BranchCode;
  room_name: string;
  display_order: number;
  is_active: boolean;
  inactive_from: string | null;
  created_at: string;
}

export type DailyRoomOverrideType = 'add' | 'hide';

export interface DailyRoomOverride {
  id: string;
  schedule_date: string;
  branch_code: BranchCode;
  override_type: DailyRoomOverrideType;
  room_id: string | null;
  custom_room_name: string;
  display_order: number;
  created_at: string;
}

export interface RosterSchedule {
  campaign_group_id?: string;
  setup_onsite_ids?: string[];
  setup_targets?: RosterSchedule[];
  position_order_mode: PositionOrderMode;
  sales_person: string;
  departure_address: string;
  provisional_cost: number;
  id: string;
  schedule_type: RosterScheduleType;
  branch_code: BranchCode;
  schedule_date: string;
  campaign_code: string | null;
  company_name: string;
  contact_person: string;
  company_address: string;
  notes: string;
  default_allowance: number;
  position_list: string[];
  created_at: string;
  updated_at: string;
}

export interface RosterAssignment {
  id: string;
  schedule_id: string;
  room_id: string | null;
  daily_override_id: string | null;
  position_label: string;
  personnel_id: string;
  shift_period: ShiftPeriod;
  base_cost_snapshot: number;
  allowance_cost: number;
  total_cost: number;
  note: string;
  sort_order: number;
  created_at: string;
}

export interface EnrichedRosterAssignment extends RosterAssignment {
  personnel?: MedicalPersonnel;
  room?: ClinicRoom;
  schedule?: RosterSchedule;
}

export interface OnsiteScheduleInput {
  campaign_group_id?: string;
  setup_onsite_ids?: string[];
  position_order_mode?: PositionOrderMode;
  sales_person?: string;
  departure_address?: string;
  id?: string | null;
  schedule_type: 'onsite_exam' | 'blood_draw' | 'setup';
  branch_code: BranchCode;
  schedule_date: string;
  campaign_code: string;
  company_name: string;
  contact_person: string;
  company_address: string;
  notes: string;
  default_allowance?: number;
  position_list?: string[];
}

export interface RosterAssignmentInput {
  id?: string | null;
  schedule_id: string;
  room_id?: string | null;
  daily_override_id?: string | null;
  position_label: string;
  personnel_id: string;
  shift_period: ShiftPeriod;
  base_cost_snapshot: number;
  allowance_cost: number;
  note?: string;
  sort_order?: number;
}

export interface CopyInsiteScheduleResult {
  copiedCount: number;
  copiedRoomsCount: number;
  skippedCount: number;
  sourceTotalCount: number;
  targetSchedule: RosterSchedule | null;
  insertedAssignments: RosterAssignment[];
  insertedOverrides: DailyRoomOverride[];
}
