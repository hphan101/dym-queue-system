import { createContext, useContext } from 'react';
import type {
  ClinicRoom,
  DailyRoomOverride,
  MedicalPersonnel,
  MedicalPersonnelInput,
  OnsiteScheduleInput,
  RosterAssignment,
  RosterAssignmentInput,
  RosterSchedule,
} from './rosterService';

export interface RosterContextValue {
  canEditHistory: boolean;
  rosterToday: string;
  // Scope state
  selectedBranch: 'q1' | 'q7';
  setSelectedBranch: (branch: 'q1' | 'q7') => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;

  // Data state
  personnelList: MedicalPersonnel[];
  activePersonnel: MedicalPersonnel[];
  personnelMap: Map<string, MedicalPersonnel>;
  roomsList: ClinicRoom[];
  roomMap: Map<string, ClinicRoom>;
  dailyRoomOverrides: DailyRoomOverride[];
  schedules: RosterSchedule[];
  scheduleMap: Map<string, RosterSchedule>;
  assignments: RosterAssignment[];

  // Status & feedback
  isLoading: boolean;
  isMutating: boolean;
  errorBanner: string | null;
  successBanner: string | null;
  clearBanners: () => void;
  showNotice: (message: string) => void;
  setErrorMessage: (message: string | null) => void;
  reloadAll: (showSpinner?: boolean) => Promise<void>;

  // Domain actions
  addRoom: (branch: 'q1' | 'q7', roomName: string) => Promise<ClinicRoom>;
  renameRoom: (roomId: string, roomName: string) => Promise<ClinicRoom>;
  removeRoom: (room: ClinicRoom, effectiveDate?: string) => Promise<void>;
  addDailyRoom: (
    branch: 'q1' | 'q7',
    date: string,
    roomName: string,
  ) => Promise<DailyRoomOverride>;
  deleteDailyRoom: (overrideId: string) => Promise<void>;
  hideRoomForDate: (
    branch: 'q1' | 'q7',
    date: string,
    roomId: string,
  ) => Promise<DailyRoomOverride>;
  restoreHiddenRoomForDate: (overrideId: string) => Promise<void>;
  restoreAllHiddenRoomsForDate: (
    branch: 'q1' | 'q7',
    date: string,
  ) => Promise<void>;
  upsertInsiteAssignment: (
    branch: 'q1' | 'q7',
    date: string,
    input: Omit<RosterAssignmentInput, 'schedule_id'>,
  ) => Promise<RosterAssignment>;
  copyInsiteFromYesterday: (
    branch: 'q1' | 'q7',
    targetDate: string,
  ) => Promise<{
    copiedCount: number;
    copiedRoomsCount: number;
    skippedCount: number;
    sourceTotalCount: number;
    sourceDate: string;
  }>;
  upsertCampaign: (input: OnsiteScheduleInput) => Promise<RosterSchedule>;
  createCampaigns: (
    inputs: OnsiteScheduleInput[],
    setupInputs?: OnsiteScheduleInput[],
  ) => Promise<RosterSchedule[]>;
  removeCampaign: (campaign: RosterSchedule) => Promise<void>;
  updateCampaignPositions: (
    campaignId: string,
    positionList: string[],
    orderMode?: 'alphabetical' | 'manual',
  ) => Promise<RosterSchedule>;
  renamePositionInCampaign: (
    campaignId: string,
    oldName: string,
    newName: string,
    currentPositionList: string[],
  ) => Promise<RosterSchedule>;
  removePositionFromCampaign: (
    campaignId: string,
    positionName: string,
    currentPositionList: string[],
  ) => Promise<RosterSchedule>;
  updateCampaignAllowance: (
    campaignId: string,
    allowanceCost: number,
    syncExistingAssignments?: boolean,
  ) => Promise<RosterSchedule>;
  cloneCampaign: (
    input: OnsiteScheduleInput,
    sourceAssignments: RosterAssignment[],
    copyAssignments: boolean,
  ) => Promise<RosterSchedule>;
  upsertCampaignAssignment: (
    input: RosterAssignmentInput,
  ) => Promise<RosterAssignment>;
  removeAssignment: (assignmentId: string) => Promise<void>;
  upsertPersonnel: (input: MedicalPersonnelInput) => Promise<MedicalPersonnel>;
  togglePersonnelActive: (
    person: MedicalPersonnel,
    nextActive: boolean,
  ) => Promise<MedicalPersonnel>;
  bulkUpsertPersonnel: (
    items: MedicalPersonnelInput[],
  ) => Promise<MedicalPersonnel[]>;
  removePersonnel: (
    person: MedicalPersonnel,
  ) => Promise<{ action: 'deleted' | 'archived' }>;
}

export const RosterContext = createContext<RosterContextValue | null>(null);

export function useRosterData(): RosterContextValue {
  const ctx = useContext(RosterContext);
  if (!ctx) {
    throw new Error('useRosterData must be used inside RosterDataProvider');
  }
  return ctx;
}
