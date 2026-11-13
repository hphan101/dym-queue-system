import { useMemo, useState } from 'react';
import { useRosterDeepLink } from '../shared/useRosterDeepLink';
import { GripVertical } from 'lucide-react';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  DocumentDuplicateIcon,
  EllipsisHorizontalIcon,
  EyeSlashIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Badge } from '@/components/ui/badge';
import { PermissionButton as Button } from '@/features/admin/components/PermissionButton';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { getTodayInVietnam } from '../../../../lib/date';
import { formatDisplayDate } from '../../utils/adminFormatters';
import { exportScheduleCostExcel } from '../shared/exportRosterExcel';
import {
  RosterAssignmentCell,
  type RosterAssignmentDraft,
} from '../shared/RosterAssignmentCell';
import {
  formatVndCurrency,
  getProvisionalCost,
  getCountedProvisionalCost,
  isRosterDateLocked,
  updateClinicRoom,
  saveClinicRoomOrder,
  ROSTER_BRANCH_LABELS,
  SHIFT_SHORT_LABELS,
  shiftIsoDate,
  summarizeAssignmentCosts,
  type ClinicRoom,
  type RosterAssignment,
} from '../data/rosterService';
import { RosterShell } from '../shared/RosterShell';
import { useRosterData } from '../data/useRosterData';
import { RosterInsiteWeek } from './RosterInsiteWeek';
import './insiteDay.css';
import '../shared/positionDrag.css';
import { useCampaignPositionDrag } from '../shared/useCampaignPositionDrag';
import { applySavedPositionOrder } from '../onsite/campaignPositionOrder';
import { RosterProvisionalCost } from '../shared/RosterProvisionalCost';
import {
  canAssignDoctorToRoom,
  inferDoctorSpecialty,
  DOCTOR_SPECIALTIES,
  type DoctorSpecialty,
} from '../personnel/doctorSpecialties';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '@/components/ui/select';

interface EffectiveRoomRow {
  doctorSpecialty: DoctorSpecialty | null;
  key: string;
  roomId: string | null;
  overrideId: string | null;
  roomName: string;
  displayOrder: number;
  isTemporaryToday: boolean;
}

interface PendingRoomRemoval {
  mode: 'hide-today' | 'delete-today-room' | 'deactivate-catalog-room';
  roomName: string;
  roomId?: string;
  overrideId?: string;
  catalogRoom?: ClinicRoom;
  assignedCount: number;
  assignedCost: number;
}

export function RosterInsitePage({
  authorizedIsAdmin = true,
}: {
  authorizedIsAdmin?: boolean;
}) {
  const {
    canEditHistory,
    rosterToday,
    selectedBranch,
    setSelectedBranch,
    selectedDate,
    setSelectedDate,
    activePersonnel,
    personnelMap,
    roomsList,
    roomMap,
    dailyRoomOverrides,
    schedules,
    assignments,
    isLoading,
    isMutating,
    reloadAll,
    showNotice,
    setErrorMessage,
    addRoom,
    renameRoom,
    removeRoom,
    addDailyRoom,
    deleteDailyRoom,
    hideRoomForDate,
    restoreAllHiddenRoomsForDate,
    upsertInsiteAssignment,
    copyInsiteFromYesterday,
    removeAssignment,
  } = useRosterData();

  const today = rosterToday || getTodayInVietnam();
  const historyLocked = isRosterDateLocked(selectedDate, today, canEditHistory);
  const [view, setView] = useState<'week' | 'day'>('week');
  const [weekDate, setWeekDate] = useState(selectedDate);
  const [weekRefresh, setWeekRefresh] = useState(0);
  useRosterDeepLink('roster-insite', (link) => {
    setSelectedDate(link.date);
    setSelectedBranch(link.branch);
    setWeekDate(link.date);
    if (link.view === 'day') setView('day');
  });

  // Step 1: Fixed Room Catalog Drawer (⚙) state
  const [isRoomCatalogOpen, setIsRoomCatalogOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingRoomName, setEditingRoomName] = useState('');

  // Per-day Room Override state ("+ Thêm phòng cho ngày này" & row menu ⋯)
  const [isAddingDailyRoom, setIsAddingDailyRoom] = useState(false);
  const [newDailyRoomName, setNewDailyRoomName] = useState('');
  const [openRowMenuKey, setOpenRowMenuKey] = useState<string | null>(null);
  const [pendingRoomRemoval, setPendingRoomRemoval] =
    useState<PendingRoomRemoval | null>(null);

  // Per-row Popover state for adding/editing room assignment
  const [popoverRoomKey, setPopoverRoomKey] = useState<string | null>(null);
  const closePopover = () => setPopoverRoomKey(null);

  // Fixed catalog rooms active on selectedDate (soft-deactivated rooms with inactive_from <= selectedDate are excluded)
  const catalogRoomsForDate = useMemo(
    () =>
      roomsList
        .filter(
          (r) =>
            r.branch_code === selectedBranch &&
            r.is_active &&
            (!r.inactive_from || selectedDate < r.inactive_from),
        )
        .sort(
          (a, b) =>
            a.display_order - b.display_order ||
            a.room_name.localeCompare(b.room_name),
        ),
    [roomsList, selectedBranch, selectedDate],
  );

  // Daily room overrides for (selectedBranch, selectedDate)
  const dailyOverridesToday = useMemo(
    () =>
      dailyRoomOverrides.filter(
        (o) =>
          o.branch_code === selectedBranch && o.schedule_date === selectedDate,
      ),
    [dailyRoomOverrides, selectedBranch, selectedDate],
  );

  const hiddenOverridesToday = useMemo(
    () =>
      dailyOverridesToday.filter(
        (o) => o.override_type === 'hide' && Boolean(o.room_id),
      ),
    [dailyOverridesToday],
  );

  const hiddenRoomIdsSet = useMemo(
    () => new Set(hiddenOverridesToday.map((o) => o.room_id as string)),
    [hiddenOverridesToday],
  );

  const addedOverridesToday = useMemo(
    () =>
      dailyOverridesToday
        .filter((o) => o.override_type === 'add')
        .sort(
          (a, b) =>
            a.display_order - b.display_order ||
            a.created_at.localeCompare(b.created_at),
        ),
    [dailyOverridesToday],
  );

  // Effective displayed rooms = Fixed catalog rooms (active on date) - Hidden rooms + Added "Chỉ hôm nay" rooms
  const defaultRooms = useMemo<EffectiveRoomRow[]>(() => {
    const fixedRows: EffectiveRoomRow[] = catalogRoomsForDate
      .filter((r) => !hiddenRoomIdsSet.has(r.id))
      .map((r) => ({
        key: `room:${r.id}`,
        roomId: r.id,
        overrideId: null,
        roomName: r.room_name,
        doctorSpecialty:
          r.doctor_specialty === undefined
            ? inferDoctorSpecialty(r.room_name)
            : r.doctor_specialty,
        displayOrder: r.display_order,
        isTemporaryToday: false,
      }));

    const addedRows: EffectiveRoomRow[] = addedOverridesToday.map((o) => ({
      key: `override:${o.id}`,
      roomId: null,
      overrideId: o.id,
      roomName: o.custom_room_name,
      doctorSpecialty: inferDoctorSpecialty(o.custom_room_name),
      displayOrder: o.display_order,
      isTemporaryToday: true,
    }));

    return [...fixedRows, ...addedRows];
  }, [addedOverridesToday, catalogRoomsForDate, hiddenRoomIdsSet]);

  const currentInsiteSchedule = useMemo(
    () =>
      schedules.find(
        (s) =>
          s.schedule_type === 'insite' &&
          s.branch_code === selectedBranch &&
          s.schedule_date === selectedDate,
      ) ?? null,
    [schedules, selectedBranch, selectedDate],
  );

  const orderedRoomKeys = useMemo(
    () =>
      applySavedPositionOrder(
        defaultRooms.map((room) => room.key),
        currentInsiteSchedule?.position_order_mode === 'manual'
          ? currentInsiteSchedule.position_list
          : [],
      ),
    [defaultRooms, currentInsiteSchedule],
  );
  const roomDrag = useCampaignPositionDrag({
    campaignId: `${selectedBranch}:${selectedDate}`,
    positions: orderedRoomKeys,
    disabled: isLoading || isMutating || historyLocked,
    onSave: async (keys) => {
      await saveClinicRoomOrder(selectedBranch, selectedDate, keys);
      await reloadAll(false);
    },
    onError: setErrorMessage,
  });
  const effectiveRooms = useMemo(() => {
    const byKey = new Map(defaultRooms.map((room) => [room.key, room]));
    return roomDrag.positions
      .map((key) => byKey.get(key))
      .filter((room): room is EffectiveRoomRow => Boolean(room));
  }, [defaultRooms, roomDrag.positions]);

  const rawInsiteAssignments = useMemo(() => {
    if (!currentInsiteSchedule) return [];
    return assignments.filter(
      (a) => a.schedule_id === currentInsiteSchedule.id,
    );
  }, [assignments, currentInsiteSchedule]);

  // Visible assignments in effectiveRooms (includes "Chỉ hôm nay", excludes hidden rooms)
  const visibleInsiteAssignments = useMemo(() => {
    const visibleRoomIds = new Set(
      effectiveRooms.map((r) => r.roomId).filter(Boolean) as string[],
    );
    const visibleOverrideIds = new Set(
      effectiveRooms.map((r) => r.overrideId).filter(Boolean) as string[],
    );

    return rawInsiteAssignments.filter((a) => {
      if (a.room_id && visibleRoomIds.has(a.room_id)) return true;
      if (a.daily_override_id && visibleOverrideIds.has(a.daily_override_id)) {
        return true;
      }
      return false;
    });
  }, [effectiveRooms, rawInsiteAssignments]);

  // Map assignments by effectiveRoom.key
  const assignmentsByRoomKey = useMemo(() => {
    const map = new Map<string, RosterAssignment[]>();
    for (const row of effectiveRooms) {
      map.set(row.key, []);
    }
    for (const assign of visibleInsiteAssignments) {
      const key = assign.room_id
        ? `room:${assign.room_id}`
        : assign.daily_override_id
          ? `override:${assign.daily_override_id}`
          : null;
      if (key && map.has(key)) {
        map.get(key)?.push(assign);
      }
    }
    return map;
  }, [effectiveRooms, visibleInsiteAssignments]);

  // Same-day schedules map for cross-branch & cross-page (Insite <-> Onsite) double-booking detection
  const sameDayScheduleMap = useMemo(() => {
    const map = new Map<string, (typeof schedules)[number]>();
    for (const sched of schedules) {
      if (sched.schedule_date === selectedDate) {
        map.set(sched.id, sched);
      }
    }
    return map;
  }, [schedules, selectedDate]);

  // Same-day assignments per person for double-booking detection (across D1, D7, and Onsite campaigns on selectedDate)
  const sameDayAssignmentsByPerson = useMemo(() => {
    const map = new Map<string, RosterAssignment[]>();
    const currentScheduleId = currentInsiteSchedule?.id;
    const visibleCurrentIds = new Set(
      visibleInsiteAssignments.map((a) => a.id),
    );

    for (const item of assignments) {
      if (!sameDayScheduleMap.has(item.schedule_id)) continue;
      if (
        currentScheduleId &&
        item.schedule_id === currentScheduleId &&
        !visibleCurrentIds.has(item.id)
      ) {
        continue;
      }
      const list = map.get(item.personnel_id) ?? [];
      list.push(item);
      map.set(item.personnel_id, list);
    }
    return map;
  }, [
    assignments,
    currentInsiteSchedule?.id,
    sameDayScheduleMap,
    visibleInsiteAssignments,
  ]);

  const {
    baseCost: dayBaseCost,
    allowanceCost: dayAllowanceCost,
    totalCost: dayAssignedCost,
  } = useMemo(
    () => summarizeAssignmentCosts(visibleInsiteAssignments),
    [visibleInsiteAssignments],
  );

  const provisionalCost = getProvisionalCost(currentInsiteSchedule);
  const dayTotalCost =
    dayAssignedCost + getCountedProvisionalCost(currentInsiteSchedule, today);

  const dayCostBreakdownText = useMemo(
    () =>
      `Cố định ${formatVndCurrency(dayBaseCost)} + Phụ cấp ${formatVndCurrency(dayAllowanceCost)} + Dự phòng ${formatVndCurrency(provisionalCost)}${selectedDate < today ? ' (không tính vào thực tế)' : ''}`,
    [dayBaseCost, dayAllowanceCost, provisionalCost, selectedDate, today],
  );

  const staffedRoomsCount = useMemo(
    () =>
      effectiveRooms.filter(
        (r) => (assignmentsByRoomKey.get(r.key)?.length ?? 0) > 0,
      ).length,
    [assignmentsByRoomKey, effectiveRooms],
  );

  const getAssignmentRoomDisplayName = (assign: RosterAssignment): string => {
    const sched = sameDayScheduleMap.get(assign.schedule_id);
    if (sched && sched.schedule_type !== 'insite') {
      const pos = assign.position_label || 'Đoàn khám';
      const company = sched.company_name || sched.campaign_code || 'Onsite';
      return `${pos} (${company})`;
    }
    const branchSuffix =
      sched && sched.branch_code !== selectedBranch
        ? ` (${sched.branch_code === 'q7' ? 'D7' : 'D1'})`
        : '';
    if (assign.room_id) {
      const rName =
        roomMap.get(assign.room_id)?.room_name || assign.position_label;
      return `${rName}${branchSuffix}`;
    }
    if (assign.daily_override_id) {
      const ov = dailyRoomOverrides.find(
        (o) => o.id === assign.daily_override_id,
      );
      if (ov?.custom_room_name) return `${ov.custom_room_name}${branchSuffix}`;
    }
    return `${assign.position_label || 'Phòng khác'}${branchSuffix}`;
  };

  // Fixed catalog room actions (⚙ Drawer)
  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    try {
      const created = await addRoom(selectedBranch, newRoomName);
      setNewRoomName('');
      showNotice(
        `Đã thêm phòng cố định "${created.room_name}" vào ${ROSTER_BRANCH_LABELS[selectedBranch]}.`,
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Không thể thêm phòng.',
      );
    }
  };

  const handleSaveRoomEdit = async (roomId: string) => {
    if (!editingRoomName.trim()) return;
    try {
      const updated = await renameRoom(roomId, editingRoomName);
      setEditingRoomId(null);
      setEditingRoomName('');
      showNotice(`Đã đổi tên phòng thành "${updated.room_name}".`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Không thể đổi tên phòng.',
      );
    }
  };

  const requestDeactivateCatalogRoom = (room: ClinicRoom) => {
    const roomAssignsToday = rawInsiteAssignments.filter(
      (a) => a.room_id === room.id,
    );
    if (roomAssignsToday.length > 0) {
      const assignedCost = roomAssignsToday.reduce(
        (sum, a) =>
          sum + Number(a.base_cost_snapshot) + Number(a.allowance_cost),
        0,
      );
      setPendingRoomRemoval({
        mode: 'deactivate-catalog-room',
        roomName: room.room_name,
        catalogRoom: room,
        assignedCount: roomAssignsToday.length,
        assignedCost,
      });
      return;
    }
    void executeDeactivateCatalogRoom(room);
  };

  const executeDeactivateCatalogRoom = async (room: ClinicRoom) => {
    showNotice(
      `Đã ngừng dùng phòng "${room.room_name}" từ ngày ${formatDisplayDate(selectedDate)} trở đi (dữ liệu lịch cũ vẫn được giữ nguyên).`,
    );
    try {
      await removeRoom(room, selectedDate);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Không thể ngừng dùng phòng.',
      );
    }
  };

  // Per-day room override actions ("+ Thêm phòng cho ngày này" & "Ẩn phòng hôm nay" / "Xóa phòng")
  const handleAddDailyRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newDailyRoomName.trim();
    if (!trimmed) return;
    try {
      const created = await addDailyRoom(selectedBranch, selectedDate, trimmed);
      setNewDailyRoomName('');
      setIsAddingDailyRoom(false);
      showNotice(
        `Đã thêm phòng "${created.custom_room_name}" (chỉ ngày ${formatDisplayDate(selectedDate)}).`,
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Không thể thêm phòng cho ngày này.',
      );
    }
  };

  const requestRemoveOrHideRoomRow = (row: EffectiveRoomRow) => {
    setOpenRowMenuKey(null);
    const roomAssigns = assignmentsByRoomKey.get(row.key) ?? [];
    if (roomAssigns.length > 0) {
      const assignedCost = roomAssigns.reduce(
        (sum, a) =>
          sum + Number(a.base_cost_snapshot) + Number(a.allowance_cost),
        0,
      );
      setPendingRoomRemoval({
        mode: row.isTemporaryToday ? 'delete-today-room' : 'hide-today',
        roomName: row.roomName,
        roomId: row.roomId ?? undefined,
        overrideId: row.overrideId ?? undefined,
        assignedCount: roomAssigns.length,
        assignedCost,
      });
      return;
    }

    if (row.isTemporaryToday && row.overrideId) {
      void executeDeleteDailyRoom(row.overrideId, row.roomName);
    } else if (!row.isTemporaryToday && row.roomId) {
      void executeHideRoomToday(row.roomId, row.roomName);
    }
  };

  const executeHideRoomToday = async (roomId: string, roomName: string) => {
    if (popoverRoomKey === `room:${roomId}`) {
      setPopoverRoomKey(null);
    }
    showNotice(
      `Đã ẩn phòng "${roomName}" trong ngày ${formatDisplayDate(selectedDate)}.`,
    );
    try {
      await hideRoomForDate(selectedBranch, selectedDate, roomId);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Không thể ẩn phòng hôm nay.',
      );
    }
  };

  const executeDeleteDailyRoom = async (
    overrideId: string,
    roomName: string,
  ) => {
    if (popoverRoomKey === `override:${overrideId}`) {
      setPopoverRoomKey(null);
    }
    showNotice(
      `Đã xóa phòng "${roomName}" khỏi ngày ${formatDisplayDate(selectedDate)}.`,
    );
    try {
      await deleteDailyRoom(overrideId);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Không thể xóa phòng trong ngày.',
      );
    }
  };

  const handleConfirmPendingRoomRemoval = async () => {
    if (!pendingRoomRemoval) return;
    const current = pendingRoomRemoval;
    setPendingRoomRemoval(null);

    if (current.mode === 'hide-today' && current.roomId) {
      await executeHideRoomToday(current.roomId, current.roomName);
    } else if (current.mode === 'delete-today-room' && current.overrideId) {
      await executeDeleteDailyRoom(current.overrideId, current.roomName);
    } else if (
      current.mode === 'deactivate-catalog-room' &&
      current.catalogRoom
    ) {
      await executeDeactivateCatalogRoom(current.catalogRoom);
    }
  };

  const handleRestoreAllHiddenRooms = async () => {
    const count = hiddenOverridesToday.length;
    if (count === 0) return;
    showNotice(
      `Đã hiện lại ${count} phòng trong ngày ${formatDisplayDate(selectedDate)}.`,
    );
    try {
      await restoreAllHiddenRoomsForDate(selectedBranch, selectedDate);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Không thể hiện lại các phòng đã ẩn.',
      );
    }
  };

  const handleSaveAssignment = async (
    targetRoom: EffectiveRoomRow,
    draft: RosterAssignmentDraft,
  ): Promise<boolean> => {
    if (!draft.personnelId) {
      setErrorMessage('Vui lòng chọn nhân sự chưa bị trùng ca trực.');
      return false;
    }

    const person = personnelMap.get(draft.personnelId);
    const existing = rawInsiteAssignments.find(
      (item) => item.id === draft.editingAssignmentId,
    );
    if (
      person &&
      (!existing || existing.personnel_id !== person.id) &&
      !canAssignDoctorToRoom(person, targetRoom.doctorSpecialty)
    ) {
      setErrorMessage('Bác sĩ chưa có chuyên môn phù hợp với phòng này.');
      return false;
    }

    if (draft.conflictAssignment) {
      const conflictRoom = getAssignmentRoomDisplayName(
        draft.conflictAssignment,
      );
      const personName =
        personnelMap.get(draft.personnelId)?.full_name || 'Nhân sự';
      setErrorMessage(
        `${personName} đã được xếp tại ${conflictRoom} (${SHIFT_SHORT_LABELS[draft.conflictAssignment.shift_period]}).`,
      );
      return false;
    }

    try {
      await upsertInsiteAssignment(selectedBranch, selectedDate, {
        id: draft.editingAssignmentId,
        room_id: targetRoom.roomId,
        daily_override_id: targetRoom.overrideId,
        position_label: targetRoom.roomName,
        personnel_id: draft.personnelId,
        shift_period: draft.shiftPeriod,
        base_cost_snapshot: draft.baseCostSnapshot,
        allowance_cost: draft.allowanceCost,
        note: draft.note,
        sort_order: targetRoom.displayOrder,
      });

      showNotice('Đã lưu phân công vào lịch phòng khám.');
      return true;
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Không thể lưu phân công phòng khám.',
      );
      return false;
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    showNotice('Đã xóa phân công khỏi phòng.');
    try {
      await removeAssignment(assignmentId);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Không thể xóa phân công.',
      );
    }
  };

  const handleCopyFromYesterday = async () => {
    try {
      const res = await copyInsiteFromYesterday(selectedBranch, selectedDate);
      if (res.sourceTotalCount === 0 && res.copiedRoomsCount === 0) {
        showNotice(
          `Ngày hôm qua (${formatDisplayDate(res.sourceDate)}) chưa có phân công nào tại ${selectedBranch.toUpperCase()}.`,
        );
        return;
      }
      if (res.copiedCount === 0 && res.copiedRoomsCount === 0) {
        showNotice(
          `Tất cả ${res.sourceTotalCount} ca trực từ ngày ${formatDisplayDate(res.sourceDate)} đã có sẵn trong ngày ${formatDisplayDate(selectedDate)}.`,
        );
        return;
      }
      const extraRoomsNote =
        res.copiedRoomsCount > 0
          ? ` (kèm ${res.copiedRoomsCount} phòng "Chỉ hôm nay")`
          : '';
      showNotice(
        `Đã sao chép ${res.copiedCount} ca trực${extraRoomsNote} từ ngày ${formatDisplayDate(res.sourceDate)} sang ngày ${formatDisplayDate(selectedDate)}.`,
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Không thể sao chép lịch từ hôm qua.',
      );
    }
  };

  return (
    <RosterShell
      activePage="roster-insite"
      title={`Lịch tại Phòng khám (${ROSTER_BRANCH_LABELS[selectedBranch]})`}
      authorizedIsAdmin={authorizedIsAdmin}
      headerActions={
        <div className="flex items-center gap-2">
          {view === 'day' &&
            currentInsiteSchedule &&
            (visibleInsiteAssignments.length > 0 || provisionalCost > 0) && (
              <Button permissionAction="view" permissionModule="export"
                type="button"
                size="sm"
                onClick={() =>
                  exportScheduleCostExcel({
                    schedule: currentInsiteSchedule,
                    assignments: visibleInsiteAssignments,
                    personnelMap,
                    roomMap,
                  })
                }
                className="h-9 gap-1.5 px-3 text-[13px] font-medium shadow-sm"
              >
                <ArrowDownTrayIcon className="size-4 shrink-0" />
                <span>Xuất Excel ({selectedBranch.toUpperCase()})</span>
              </Button>
            )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={() => {
              setWeekRefresh((value) => value + 1);
              void reloadAll(true);
            }}
            className="h-9 gap-1.5 bg-card px-3 text-[13px] font-medium shadow-sm"
          >
            <ArrowPathIcon
              className={cn('size-4 shrink-0', isLoading && 'animate-spin')}
              aria-hidden="true"
            />
            <span>{isLoading ? 'Đang tải...' : 'Làm mới'}</span>
          </Button>
        </div>
      }
    >
      {view === 'week' ? (
        <RosterInsiteWeek
          refreshKey={weekRefresh}
          date={weekDate}
          onDateChange={(date) => {
            setWeekDate(date);
            setSelectedDate(date);
          }}
          onOpenDay={(date) => {
            setSelectedDate(date);
            setView('day');
          }}
        />
      ) : (
        <div className="dym-insite-day">
          <div className="dym-day-intro">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                closePopover();
                setIsAddingDailyRoom(false);
                setView('week');
              }}
            >
              <ChevronLeftIcon data-icon="inline-start" /> Về lịch tuần
            </Button>
            <h2>Lịch ngày {formatDisplayDate(selectedDate)}</h2>
            <span className="dym-day-state">
              {historyLocked
                ? 'Chỉ xem'
                : selectedDate < today
                  ? 'Được sửa lịch cũ'
                  : 'Có thể chỉnh sửa'}
            </span>
          </div>
          {/* Top Bar: [D1] [D7] ◀ Date ▶ Hôm nay [Sao chép từ hôm qua] | Tổng ngày: X đ ⚙ */}
          <div className="dym-roster-scope-bar">
            <div className="dym-roster-scope-left">
              <Tabs
                value={selectedBranch}
                onValueChange={(value) => {
                  closePopover();
                  setIsAddingDailyRoom(false);
                  setSelectedBranch(value as 'q1' | 'q7');
                }}
              >
                <TabsList
                  aria-label="Chọn cơ sở D1 hoặc D7"
                  className="h-9 bg-muted p-1"
                >
                  <TabsTrigger
                    value="q1"
                    className="h-7 px-3.5 text-[13px] font-semibold"
                  >
                    D1
                  </TabsTrigger>
                  <TabsTrigger
                    value="q7"
                    className="h-7 px-3.5 text-[13px] font-semibold"
                  >
                    D7
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    closePopover();
                    setIsAddingDailyRoom(false);
                    setSelectedDate(shiftIsoDate(selectedDate, -1));
                  }}
                  className="size-9 bg-card shadow-sm"
                  title="Ngày hôm trước"
                  aria-label="Ngày hôm trước"
                >
                  <ChevronLeftIcon className="size-4" />
                </Button>

                <DatePicker
                  value={selectedDate}
                  onChange={(nextDate) => {
                    closePopover();
                    setIsAddingDailyRoom(false);
                    setSelectedDate(nextDate);
                  }}
                  ariaLabel="Chọn ngày trực"
                />

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    closePopover();
                    setIsAddingDailyRoom(false);
                    setSelectedDate(shiftIsoDate(selectedDate, 1));
                  }}
                  className="size-9 bg-card shadow-sm"
                  title="Ngày tiếp theo"
                  aria-label="Ngày tiếp theo"
                >
                  <ChevronRightIcon className="size-4" />
                </Button>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={selectedDate === today}
                onClick={() => {
                  closePopover();
                  setIsAddingDailyRoom(false);
                  setSelectedDate(today);
                }}
                className="h-9 bg-card px-3 text-[13px] font-medium shadow-sm"
              >
                Hôm nay
              </Button>

              <Button permissionAction="create"
                type="button"
                variant="outline"
                size="sm"
                disabled={isMutating || isLoading || historyLocked}
                onClick={() => void handleCopyFromYesterday()}
                className="h-9 gap-1.5 bg-card px-3 text-[13px] font-medium shadow-sm"
              >
                <DocumentDuplicateIcon className="size-4 shrink-0" />
                <span>Sao chép từ hôm qua</span>
              </Button>
            </div>

            <div className="dym-roster-scope-right">
              {/* Tổng ngày with instant hover breakdown: "Cố định X + Phụ cấp Y" */}
              <div
                tabIndex={0}
                title={dayCostBreakdownText}
                className="dym-day-total group relative outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <span className="text-muted-foreground">
                  {selectedDate < today ? 'Chi phí thực tế:' : 'Tổng dự kiến:'}
                </span>
                <strong className="dym-roster-tabular font-semibold text-foreground">
                  {formatVndCurrency(dayTotalCost)}
                </strong>
                {dayAllowanceCost > 0 && (
                  <span className="inline-flex size-4 items-center justify-center rounded-full bg-amber-500/15 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                    +
                  </span>
                )}
                <div
                  role="tooltip"
                  className="pointer-events-none invisible absolute right-0 top-full z-40 mt-1.5 w-max rounded-md border border-border bg-popover px-3 py-1.5 text-[13px] font-medium text-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
                >
                  <span className="dym-roster-tabular">
                    {dayCostBreakdownText}
                  </span>
                </div>
              </div>

              <Button permissionAction="update"
                type="button"
                variant="outline"
                size="icon"
                disabled={historyLocked}
                onClick={() => setIsRoomCatalogOpen(true)}
                className="size-9 bg-card shadow-sm"
                title={`Danh mục phòng cố định (${catalogRoomsForDate.length} phòng)`}
                aria-label="Danh mục phòng cố định"
              >
                <Cog6ToothIcon className="size-4" />
              </Button>
            </div>
          </div>

          {historyLocked && (
            <p
              role="status"
              className="my-3 rounded-md border border-border bg-muted p-3 text-sm"
            >
              Lịch đã khóa: từ hôm qua trở về trước chỉ tài khoản được cấp quyền
              sửa lịch cũ mới được chỉnh sửa.
            </p>
          )}
          <fieldset disabled={historyLocked} className="min-w-0 border-0 p-0">
            <RosterProvisionalCost
              key={`${selectedBranch}-${selectedDate}-${provisionalCost}`}
              branch={selectedBranch}
              date={selectedDate}
              amount={provisionalCost}
              readOnly={historyLocked}
              historical={selectedDate < today}
              disabled={isLoading || isMutating}
              onSaved={async () => {
                await reloadAll(false);
                showNotice('Đã lưu chi phí dự phòng.');
              }}
            />

            {/* Room-Grouped List with Per-Day Room Adjustments */}
            <section className="dym-roster-panel dym-day-room-panel">
              <header className="dym-day-room-header">
                <h3>Phân công theo phòng</h3>
                <span>
                  {staffedRoomsCount}/{effectiveRooms.length} phòng đã xếp ·{' '}
                  {visibleInsiteAssignments.length} ca trực
                </span>
              </header>
              <div className="dym-roster-table-wrap">
                <span id="clinic-room-order-help" className="sr-only">
                  Giữ tay nắm để kéo phòng rồi thả tại vị trí mới. Có thể dùng
                  phím mũi tên lên hoặc xuống, Escape để hủy.
                </span>
                <table className="dym-roster-table">
                  <thead>
                    <tr>
                      <th className="dym-position-handle-cell">
                        <span className="sr-only">Đổi thứ tự phòng</span>
                      </th>
                      <th className="w-56 sm:w-64">Phòng</th>
                      <th>Nhân sự trực</th>
                      <th className="is-right w-36 sm:w-44">Chi phí phòng</th>
                    </tr>
                  </thead>
                  <tbody ref={roomDrag.bodyRef}>
                    {isLoading ? (
                      [0, 1, 2, 3, 4].map((index) => (
                        <tr key={index} aria-hidden="true">
                          <td className="dym-position-handle-cell" />
                          <td>
                            <Skeleton className="h-4 w-32" />
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-7 w-40 rounded-md" />
                              <Skeleton className="h-7 w-16 rounded-md" />
                            </div>
                          </td>
                          <td className="is-right">
                            <Skeleton className="ml-auto h-4 w-24" />
                          </td>
                        </tr>
                      ))
                    ) : (
                      <>
                        {effectiveRooms.map((roomRow) => {
                          const roomAssigns =
                            assignmentsByRoomKey.get(roomRow.key) ?? [];
                          const hasStaff = roomAssigns.length > 0;
                          const {
                            baseCost: roomBaseCost,
                            allowanceCost: roomAllowanceCost,
                            totalCost: roomTotalCost,
                          } = summarizeAssignmentCosts(roomAssigns);
                          const roomBreakdownTitle =
                            roomTotalCost > 0
                              ? `Cố định ${formatVndCurrency(roomBaseCost)} + Phụ cấp ${formatVndCurrency(roomAllowanceCost)}`
                              : undefined;

                          const isRoomPopoverOpen =
                            popoverRoomKey === roomRow.key;
                          const isRowMenuOpen = openRowMenuKey === roomRow.key;

                          return (
                            <tr
                              key={roomRow.key}
                              data-position={roomRow.key}
                              data-dragging={
                                roomDrag.drag?.source === roomRow.key
                              }
                              style={
                                roomDrag.drag?.source === roomRow.key
                                  ? {
                                      transform: `translate3d(0, ${roomDrag.drag.offset}px, 0)`,
                                    }
                                  : undefined
                              }
                              className={cn(
                                'dym-position-row group/row',
                                !hasStaff && 'bg-muted/15',
                              )}
                            >
                              <td className="dym-position-handle-cell">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  className="dym-position-drag-handle"
                                  disabled={
                                    isLoading || isMutating || historyLocked
                                  }
                                  aria-label={`Đổi thứ tự phòng ${roomRow.roomName}`}
                                  aria-describedby="clinic-room-order-help"
                                  {...roomDrag.handleProps(roomRow.key)}
                                >
                                  <GripVertical />
                                </Button>
                              </td>
                              <td className="align-middle">
                                <div className="flex items-center gap-1.5">
                                  {/* Left hover ⋯ menu for per-day room hide / delete */}
                                  <Popover
                                    open={isRowMenuOpen}
                                    onOpenChange={(nextOpen) =>
                                      setOpenRowMenuKey(
                                        nextOpen ? roomRow.key : null,
                                      )
                                    }
                                  >
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        className={cn(
                                          'inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100',
                                          isRowMenuOpen
                                            ? 'bg-accent text-foreground opacity-100'
                                            : 'opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100',
                                        )}
                                        title="Tùy chọn phòng trong ngày"
                                        aria-label={`Tùy chọn phòng ${roomRow.roomName}`}
                                      >
                                        <EllipsisHorizontalIcon className="size-4" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent
                                      align="start"
                                      sideOffset={4}
                                      className="w-48 p-1"
                                    >
                                      {roomRow.isTemporaryToday ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            requestRemoveOrHideRoomRow(roomRow)
                                          }
                                          className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/10"
                                        >
                                          <TrashIcon className="size-4 shrink-0" />
                                          <span>Xóa phòng</span>
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            requestRemoveOrHideRoomRow(roomRow)
                                          }
                                          className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
                                        >
                                          <EyeSlashIcon className="size-4 shrink-0 text-muted-foreground" />
                                          <span>Ẩn phòng hôm nay</span>
                                        </button>
                                      )}
                                    </PopoverContent>
                                  </Popover>

                                  <span
                                    className={cn(
                                      'size-2 shrink-0 rounded-full',
                                      hasStaff
                                        ? 'bg-emerald-500'
                                        : 'border border-muted-foreground/40 bg-transparent',
                                    )}
                                    aria-hidden="true"
                                  />

                                  <span
                                    className={cn(
                                      'text-[15px] font-semibold',
                                      hasStaff
                                        ? 'text-foreground'
                                        : 'text-foreground/80',
                                    )}
                                  >
                                    {roomRow.roomName}
                                  </span>

                                  {roomRow.isTemporaryToday && (
                                    <Badge
                                      variant="secondary"
                                      className="h-5 px-2 text-xs font-medium text-muted-foreground"
                                    >
                                      Chỉ hôm nay
                                    </Badge>
                                  )}
                                </div>
                              </td>

                              <td className="align-middle">
                                <RosterAssignmentCell
                                  readOnly={historyLocked}
                                  rowKey={roomRow.key}
                                  targetLabel={roomRow.roomName}
                                  assignments={roomAssigns}
                                  activePersonnel={activePersonnel.filter(
                                    (person) =>
                                      canAssignDoctorToRoom(
                                        person,
                                        roomRow.doctorSpecialty,
                                      ),
                                  )}
                                  personnelMap={personnelMap}
                                  sameDayAssignmentsByPerson={
                                    sameDayAssignmentsByPerson
                                  }
                                  getConflictLocationLabel={
                                    getAssignmentRoomDisplayName
                                  }
                                  isOpen={isRoomPopoverOpen}
                                  onOpenChange={(nextOpen) =>
                                    setPopoverRoomKey(
                                      nextOpen ? roomRow.key : null,
                                    )
                                  }
                                  isMutating={isMutating}
                                  autoSelectFirstAvailableOnSubmit
                                  deleteChipTitle="Xóa khỏi phòng"
                                  updateButtonLabel="Cập nhật (Enter)"
                                  onSaveAssignment={(draft) =>
                                    handleSaveAssignment(roomRow, draft)
                                  }
                                  onDeleteAssignment={handleDeleteAssignment}
                                />
                              </td>

                              <td
                                title={roomBreakdownTitle}
                                className={cn(
                                  'is-right dym-roster-tabular align-middle text-[15px] font-semibold',
                                  roomTotalCost === 0 &&
                                    'font-normal text-muted-foreground/60',
                                )}
                              >
                                <div className="inline-flex items-center justify-end gap-1">
                                  {roomAllowanceCost > 0 && (
                                    <span
                                      className="inline-flex size-4 items-center justify-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-600 dark:text-amber-400"
                                      title={roomBreakdownTitle}
                                    >
                                      +
                                    </span>
                                  )}
                                  <span>
                                    {formatVndCurrency(roomTotalCost)}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}

                        {/* Dashed Bottom Row: "+ Thêm phòng cho ngày này" */}
                        <tr className="bg-muted/10">
                          <td colSpan={4} className="py-2.5">
                            {isAddingDailyRoom ? (
                              <form
                                onSubmit={(e) =>
                                  void handleAddDailyRoomSubmit(e)
                                }
                                className="flex flex-wrap items-center gap-2 pl-7"
                              >
                                <Input
                                  type="text"
                                  autoFocus
                                  value={newDailyRoomName}
                                  onChange={(e) =>
                                    setNewDailyRoomName(e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') {
                                      setIsAddingDailyRoom(false);
                                      setNewDailyRoomName('');
                                    }
                                  }}
                                  placeholder="Tên phòng"
                                  className="h-9 w-60 max-w-full text-sm sm:w-72"
                                />
                                <Button
                                  type="submit"
                                  size="sm"
                                  disabled={
                                    isMutating || !newDailyRoomName.trim()
                                  }
                                  className="h-9 px-3.5 text-[13px] font-medium"
                                >
                                  Lưu (Enter)
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setIsAddingDailyRoom(false);
                                    setNewDailyRoomName('');
                                  }}
                                  className="h-9 px-3 text-[13px]"
                                >
                                  Hủy
                                </Button>
                              </form>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsAddingDailyRoom(true);
                                  setNewDailyRoomName('');
                                }}
                                className="inline-flex h-9 w-full items-center gap-1.5 rounded-md border border-dashed border-border px-3 pl-7 text-left text-[13px] font-medium text-muted-foreground transition-[border-color,background-color,color,transform] duration-150 ease-out-quint hover:border-ring/60 hover:bg-card hover:text-foreground active:scale-[0.99]"
                              >
                                <PlusIcon className="size-4 shrink-0" />
                                <span>Thêm phòng</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                  {!isLoading && (
                    <tfoot>
                      <tr>
                        <td
                          colSpan={2}
                          className="text-[13px] text-muted-foreground"
                        >
                          <div className="flex flex-col gap-0.5">
                            <span>
                              Đã xếp {staffedRoomsCount}/{effectiveRooms.length}{' '}
                              phòng
                            </span>
                            {hiddenOverridesToday.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 text-xs font-normal text-muted-foreground">
                                <span>
                                  {hiddenOverridesToday.length} phòng đã ẩn hôm
                                  nay
                                </span>
                                <span>·</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleRestoreAllHiddenRooms()
                                  }
                                  className="font-medium text-primary underline-offset-2 hover:underline"
                                >
                                  Hiện lại
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="text-[13px] text-muted-foreground">
                          <div className="dym-day-breakdown">
                            <span>
                              Cố định{' '}
                              <strong>{formatVndCurrency(dayBaseCost)}</strong>
                            </span>
                            <span>
                              Phụ cấp{' '}
                              <strong>
                                {formatVndCurrency(dayAllowanceCost)}
                              </strong>
                            </span>
                            <span>
                              Dự phòng{' '}
                              <strong>
                                {formatVndCurrency(provisionalCost)}
                              </strong>
                              {selectedDate < today && ' · Không tính thực tế'}
                            </span>
                          </div>
                        </td>
                        <td
                          title={dayCostBreakdownText}
                          className="is-right dym-roster-tabular text-[15px] text-foreground"
                        >
                          <div className="group relative inline-flex cursor-default items-center justify-end gap-1">
                            <span>{formatVndCurrency(dayTotalCost)}</span>
                            <div
                              role="tooltip"
                              className="pointer-events-none invisible absolute bottom-full right-0 z-40 mb-1.5 w-max rounded-md border border-border bg-popover px-3 py-1.5 text-[13px] font-medium text-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover:visible group-hover:opacity-100"
                            >
                              <span className="dym-roster-tabular">
                                {dayCostBreakdownText}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </section>
          </fieldset>
        </div>
      )}

      {/* Confirmation Dialog when hiding/deleting a room that has assigned shifts */}
      <Dialog
        open={Boolean(pendingRoomRemoval) && !historyLocked}
        onOpenChange={(open) => {
          if (!open) setPendingRoomRemoval(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingRoomRemoval?.mode === 'hide-today'
                ? `Ẩn phòng "${pendingRoomRemoval.roomName}" hôm nay?`
                : pendingRoomRemoval?.mode === 'delete-today-room'
                  ? `Xóa phòng "${pendingRoomRemoval?.roomName}"?`
                  : `Ngừng dùng phòng "${pendingRoomRemoval?.roomName}"?`}
            </DialogTitle>
            <DialogDescription>
              Phòng <strong>{pendingRoomRemoval?.roomName}</strong> đang có{' '}
              <strong>{pendingRoomRemoval?.assignedCount} ca trực</strong> (
              <span className="dym-roster-tabular font-medium text-foreground">
                {formatVndCurrency(pendingRoomRemoval?.assignedCost ?? 0)}
              </span>
              ) trong ngày {formatDisplayDate(selectedDate)}. Nếu tiếp tục, các
              ca trực này sẽ được xóa cùng lúc để không bị tính chi phí ngầm.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPendingRoomRemoval(null)}
            >
              Hủy
            </Button>
            <Button permissionAction="delete"
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => void handleConfirmPendingRoomRemoval()}
            >
              {pendingRoomRemoval?.mode === 'hide-today'
                ? 'Xóa ca & Ẩn phòng hôm nay'
                : 'Xóa ca & Xóa phòng'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fixed Room Catalog Drawer (⚙ Sheet) */}
      <Sheet
        open={isRoomCatalogOpen && !historyLocked}
        onOpenChange={setIsRoomCatalogOpen}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-5 sm:max-w-md"
        >
          <SheetHeader className="text-left">
            <SheetTitle>
              Danh mục phòng cố định ({ROSTER_BRANCH_LABELS[selectedBranch]})
            </SheetTitle>
            <SheetDescription>
              Thay đổi tại đây áp dụng cố định cho mọi ngày. Khi bỏ một phòng,
              phòng sẽ ngừng hiển thị từ ngày {formatDisplayDate(selectedDate)}{' '}
              trở đi nhưng vẫn giữ nguyên trong lịch và báo cáo của các ngày
              trước đó.
            </SheetDescription>
          </SheetHeader>

          <form
            onSubmit={(e) => void handleAddRoom(e)}
            className="flex items-center gap-2"
          >
            <Input
              type="text"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="Tên phòng"
              className="h-9 min-w-0 flex-1 text-sm"
            />
            <Button
              type="submit"
              size="sm"
              disabled={isMutating || !newRoomName.trim()}
              className="h-9 shrink-0 gap-1.5 px-3"
            >
              <PlusIcon className="size-4" />
              <span>Thêm phòng</span>
            </Button>
          </form>

          <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {catalogRoomsForDate.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Chưa có phòng cố định nào tại{' '}
                {ROSTER_BRANCH_LABELS[selectedBranch]}.
              </div>
            ) : (
              catalogRoomsForDate.map((room) => (
                <div
                  key={room.id}
                  className="group flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm"
                >
                  {editingRoomId === room.id ? (
                    <div className="flex w-full items-center gap-1.5">
                      <Input
                        type="text"
                        autoFocus
                        value={editingRoomName}
                        onChange={(e) => setEditingRoomName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleSaveRoomEdit(room.id);
                          } else if (e.key === 'Escape') {
                            setEditingRoomId(null);
                          }
                        }}
                        className="h-8 min-w-0 flex-1 text-sm"
                      />
                      <Button permissionAction="update"
                        type="button"
                        size="sm"
                        onClick={() => void handleSaveRoomEdit(room.id)}
                        className="h-8 px-2.5 text-xs"
                      >
                        Lưu
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingRoomId(null)}
                        className="h-8 px-2.5 text-xs"
                      >
                        Hủy
                      </Button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRoomId(room.id);
                          setEditingRoomName(room.room_name);
                        }}
                        className="min-w-0 flex-1 truncate text-left font-medium text-foreground hover:underline"
                        title="Bấm để đổi tên phòng"
                      >
                        {room.room_name}
                      </button>
                      <Select
                        value={room.doctor_specialty ?? 'unconfigured'}
                        onValueChange={(value) => {
                          void updateClinicRoom(room.id, {
                            doctor_specialty:
                              value === 'unconfigured'
                                ? null
                                : (value as DoctorSpecialty),
                          })
                            .then(() => reloadAll(false))
                            .catch(() =>
                              setErrorMessage(
                                'Không thể lưu chuyên môn của phòng.',
                              ),
                            );
                        }}
                      >
                        <SelectTrigger
                          aria-label={`Chuyên môn bác sĩ cho phòng ${room.room_name}`}
                          className="h-8 w-40"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="unconfigured">
                              Chưa chọn chuyên môn
                            </SelectItem>
                            {DOCTOR_SPECIALTIES.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <button
                        type="button"
                        onClick={() => requestDeactivateCatalogRoom(room)}
                        className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive group-focus-within:opacity-100 group-hover:opacity-100"
                        title={`Ngừng dùng phòng ${room.room_name} từ ngày ${formatDisplayDate(selectedDate)}`}
                        aria-label={`Ngừng dùng phòng ${room.room_name}`}
                      >
                        <XMarkIcon className="size-4" />
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </RosterShell>
  );
}

export default RosterInsitePage;
