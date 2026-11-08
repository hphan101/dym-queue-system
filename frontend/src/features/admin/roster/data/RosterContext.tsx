import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getTodayInVietnam } from '../../../../lib/date';
import { useAdminScope } from '../../hooks/useAdminScope';
import {
  addTemporaryDailyRoom,
  bulkImportMedicalPersonnel,
  copyInsiteScheduleFromDate,
  createClinicRoom,
  createOnsiteSchedules,
  deactivateClinicRoomFromDate,
  deleteOrArchiveMedicalPersonnel,
  deleteRosterAssignment,
  deleteRosterSchedule,
  duplicateOnsiteCampaign,
  ensureInsiteSchedule,
  fetchClinicRooms,
  fetchMedicalPersonnel,
  fetchRosterHistoryPermission,
  fetchRosterBundleForMonth,
  hideCatalogRoomForDate,
  removeCampaignPositionAndAssignments,
  removeTemporaryDailyRoom,
  renameCampaignPosition,
  saveMedicalPersonnel,
  saveOnsiteSchedule,
  saveRosterAssignment,
  setMedicalPersonnelActiveStatus,
  shiftIsoDate,
  unhideAllCatalogRoomsForDate,
  unhideCatalogRoomForDate,
  updateCampaignDefaultAllowance,
  updateCampaignPositionList,
  updateClinicRoom,
  type ClinicRoom,
  type DailyRoomOverride,
  type MedicalPersonnel,
  type MedicalPersonnelInput,
  type OnsiteScheduleInput,
  type RosterAssignment,
  type RosterAssignmentInput,
  type RosterSchedule,
} from './rosterService';
import { RosterContext, type RosterContextValue } from './useRosterData';

export function RosterDataProvider({ children }: { children: ReactNode }) {
  const { branch: scopeBranch, date: scopeDate } = useAdminScope();
  const today = getTodayInVietnam();

  const [selectedBranch, setSelectedBranch] = useState<'q1' | 'q7'>(() =>
    scopeBranch === 'q7' ? 'q7' : 'q1',
  );
  const [selectedDate, setSelectedDateState] = useState<string>(
    scopeDate || today,
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    (scopeDate || today).slice(0, 7),
  );

  const setSelectedDate = useCallback(
    (nextDate: string) => {
      setSelectedDateState(nextDate);
      const nextMonth = nextDate.slice(0, 7);
      if (nextMonth && nextMonth !== selectedMonth) {
        setSelectedMonth(nextMonth);
      }
    },
    [selectedMonth],
  );

  const [canEditHistory, setCanEditHistory] = useState(false);
  const [rosterToday, setRosterToday] = useState(today);
  useEffect(() => {
    const refresh = () => {
      setRosterToday(getTodayInVietnam());
      void fetchRosterHistoryPermission().then(setCanEditHistory);
    };
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(
      () => setRosterToday(getTodayInVietnam()),
      30000,
    );
    return () => {
      window.removeEventListener('focus', refresh);
      window.clearInterval(timer);
    };
  }, []);

  const [personnelList, setPersonnelList] = useState<MedicalPersonnel[]>([]);
  const [roomsList, setRoomsList] = useState<ClinicRoom[]>([]);
  const [dailyRoomOverrides, setDailyRoomOverrides] = useState<
    DailyRoomOverride[]
  >([]);
  const [schedules, setSchedules] = useState<RosterSchedule[]>([]);
  const [assignments, setAssignments] = useState<RosterAssignment[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [bannerTick, setBannerTick] = useState(0);

  const clearBanners = useCallback(() => {
    setErrorBanner(null);
    setSuccessBanner(null);
  }, []);

  const showNotice = useCallback((message: string) => {
    setSuccessBanner(message);
    setErrorBanner(null);
    setBannerTick((tick) => tick + 1);
  }, []);

  const setErrorMessage = useCallback((message: string | null) => {
    setErrorBanner(message);
    if (message) {
      setSuccessBanner(null);
      setBannerTick((tick) => tick + 1);
    }
  }, []);

  useEffect(() => {
    if (!successBanner) return;
    const timer = window.setTimeout(() => {
      setSuccessBanner(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [successBanner, bannerTick]);

  useEffect(() => {
    if (!errorBanner) return;
    const timer = window.setTimeout(() => {
      setErrorBanner(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [errorBanner, bannerTick]);

  const reloadAll = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setIsLoading(true);
      setErrorBanner(null);
      try {
        const [personnelData, roomsData, monthBundle, historyPermission] =
          await Promise.all([
            fetchMedicalPersonnel(),
            fetchClinicRooms(),
            fetchRosterBundleForMonth(selectedMonth),
            fetchRosterHistoryPermission(),
          ]);
        setCanEditHistory(historyPermission);
        setRosterToday(getTodayInVietnam());
        setPersonnelList(personnelData);
        setRoomsList(roomsData);
        setDailyRoomOverrides(monthBundle.dailyRoomOverrides);
        setSchedules(monthBundle.schedules);
        setAssignments(monthBundle.assignments);
      } catch (err) {
        setErrorBanner(
          err instanceof Error
            ? err.message
            : 'Không thể tải dữ liệu điều phối.',
        );
      } finally {
        setIsLoading(false);
      }
    },
    [selectedMonth],
  );

  useEffect(() => {
    void reloadAll(true);
  }, [reloadAll]);

  const personnelMap = useMemo(
    () => new Map(personnelList.map((p) => [p.id, p])),
    [personnelList],
  );
  const activePersonnel = useMemo(
    () => personnelList.filter((p) => p.is_active),
    [personnelList],
  );
  const roomMap = useMemo(
    () => new Map(roomsList.map((r) => [r.id, r])),
    [roomsList],
  );
  const scheduleMap = useMemo(
    () => new Map(schedules.map((s) => [s.id, s])),
    [schedules],
  );

  const addRoom = useCallback(
    async (branch: 'q1' | 'q7', roomName: string) => {
      setIsMutating(true);
      setErrorBanner(null);
      try {
        const branchRooms = roomsList.filter(
          (r) => r.branch_code === branch && !r.inactive_from,
        );
        const nextOrder =
          branchRooms.length > 0
            ? Math.max(...branchRooms.map((r) => r.display_order)) + 10
            : 10;
        const created = await createClinicRoom(branch, roomName, nextOrder);
        setRoomsList((prev) => [...prev, created]);
        return created;
      } finally {
        setIsMutating(false);
      }
    },
    [roomsList],
  );

  const renameRoom = useCallback(async (roomId: string, roomName: string) => {
    setIsMutating(true);
    setErrorBanner(null);
    try {
      const updated = await updateClinicRoom(roomId, {
        room_name: roomName.trim(),
      });
      setRoomsList((prev) => prev.map((r) => (r.id === roomId ? updated : r)));
      return updated;
    } finally {
      setIsMutating(false);
    }
  }, []);

  const removeRoom = useCallback(
    async (room: ClinicRoom, effectiveDate?: string) => {
      const targetDate = effectiveDate || selectedDate;
      const previousRooms = roomsList;
      const previousAssignments = assignments;
      setErrorBanner(null);

      // Soft-deactivate from targetDate onward so past months retain the room
      setRoomsList((prev) =>
        prev.map((r) =>
          r.id === room.id ? { ...r, inactive_from: targetDate } : r,
        ),
      );

      // Optimistically remove assignments for this room on or after targetDate
      const affectedScheduleIds = new Set(
        schedules
          .filter(
            (s) =>
              s.schedule_type === 'insite' &&
              s.branch_code === room.branch_code &&
              s.schedule_date >= targetDate,
          )
          .map((s) => s.id),
      );
      if (affectedScheduleIds.size > 0) {
        setAssignments((prev) =>
          prev.filter(
            (a) =>
              !(
                a.room_id === room.id && affectedScheduleIds.has(a.schedule_id)
              ),
          ),
        );
      }

      try {
        const updated = await deactivateClinicRoomFromDate(room.id, targetDate);
        setRoomsList((prev) =>
          prev.map((r) => (r.id === room.id ? updated : r)),
        );
      } catch (err) {
        setRoomsList(previousRooms);
        setAssignments(previousAssignments);
        throw err;
      }
    },
    [assignments, roomsList, schedules, selectedDate],
  );

  const addDailyRoom = useCallback(
    async (branch: 'q1' | 'q7', date: string, roomName: string) => {
      setIsMutating(true);
      setErrorBanner(null);
      try {
        const existingForDay = dailyRoomOverrides.filter(
          (o) =>
            o.branch_code === branch &&
            o.schedule_date === date &&
            o.override_type === 'add',
        );
        const nextOrder =
          existingForDay.length > 0
            ? Math.max(...existingForDay.map((o) => o.display_order)) + 10
            : 500;
        const created = await addTemporaryDailyRoom(
          branch,
          date,
          roomName,
          nextOrder,
        );
        setDailyRoomOverrides((prev) => [...prev, created]);
        return created;
      } finally {
        setIsMutating(false);
      }
    },
    [dailyRoomOverrides],
  );

  const deleteDailyRoom = useCallback(
    async (overrideId: string) => {
      const previousOverrides = dailyRoomOverrides;
      const previousAssignments = assignments;
      setErrorBanner(null);
      setDailyRoomOverrides((prev) => prev.filter((o) => o.id !== overrideId));
      setAssignments((prev) =>
        prev.filter((a) => a.daily_override_id !== overrideId),
      );
      try {
        await removeTemporaryDailyRoom(overrideId);
      } catch (err) {
        setDailyRoomOverrides(previousOverrides);
        setAssignments(previousAssignments);
        throw err;
      }
    },
    [assignments, dailyRoomOverrides],
  );

  const hideRoomForDate = useCallback(
    async (branch: 'q1' | 'q7', date: string, roomId: string) => {
      const previousOverrides = dailyRoomOverrides;
      const previousAssignments = assignments;
      setErrorBanner(null);

      const targetSchedule = schedules.find(
        (s) =>
          s.schedule_type === 'insite' &&
          s.branch_code === branch &&
          s.schedule_date === date,
      );

      const tempOverride: DailyRoomOverride = {
        id: `temp-hide-${roomId}-${date}`,
        schedule_date: date,
        branch_code: branch,
        override_type: 'hide',
        room_id: roomId,
        custom_room_name: '',
        display_order: 999,
        created_at: new Date().toISOString(),
      };

      setDailyRoomOverrides((prev) => [...prev, tempOverride]);
      if (targetSchedule) {
        setAssignments((prev) =>
          prev.filter(
            (a) =>
              !(a.schedule_id === targetSchedule.id && a.room_id === roomId),
          ),
        );
      }

      try {
        const created = await hideCatalogRoomForDate(
          branch,
          date,
          roomId,
          targetSchedule?.id,
        );
        setDailyRoomOverrides((prev) =>
          prev.map((o) => (o.id === tempOverride.id ? created : o)),
        );
        return created;
      } catch (err) {
        setDailyRoomOverrides(previousOverrides);
        setAssignments(previousAssignments);
        throw err;
      }
    },
    [assignments, dailyRoomOverrides, schedules],
  );

  const restoreHiddenRoomForDate = useCallback(
    async (overrideId: string) => {
      const previousOverrides = dailyRoomOverrides;
      setErrorBanner(null);
      setDailyRoomOverrides((prev) => prev.filter((o) => o.id !== overrideId));
      try {
        await unhideCatalogRoomForDate(overrideId);
      } catch (err) {
        setDailyRoomOverrides(previousOverrides);
        throw err;
      }
    },
    [dailyRoomOverrides],
  );

  const restoreAllHiddenRoomsForDate = useCallback(
    async (branch: 'q1' | 'q7', date: string) => {
      const previousOverrides = dailyRoomOverrides;
      setErrorBanner(null);
      setDailyRoomOverrides((prev) =>
        prev.filter(
          (o) =>
            !(
              o.branch_code === branch &&
              o.schedule_date === date &&
              o.override_type === 'hide'
            ),
        ),
      );
      try {
        await unhideAllCatalogRoomsForDate(branch, date);
      } catch (err) {
        setDailyRoomOverrides(previousOverrides);
        throw err;
      }
    },
    [dailyRoomOverrides],
  );

  const upsertInsiteAssignment = useCallback(
    async (
      branch: 'q1' | 'q7',
      date: string,
      input: Omit<RosterAssignmentInput, 'schedule_id'>,
    ) => {
      setIsMutating(true);
      setErrorBanner(null);
      try {
        const existingSchedule = schedules.find(
          (s) =>
            s.schedule_type === 'insite' &&
            s.branch_code === branch &&
            s.schedule_date === date,
        );
        const schedule =
          existingSchedule ?? (await ensureInsiteSchedule(branch, date));

        if (!existingSchedule) {
          setSchedules((prev) => [schedule, ...prev]);
        }

        const saved = await saveRosterAssignment({
          ...input,
          schedule_id: schedule.id,
        });

        setAssignments((prev) => {
          if (input.id) {
            return prev.map((item) => (item.id === saved.id ? saved : item));
          }
          return [...prev, saved];
        });

        return saved;
      } finally {
        setIsMutating(false);
      }
    },
    [schedules],
  );

  const copyInsiteFromYesterday = useCallback(
    async (branch: 'q1' | 'q7', targetDate: string) => {
      const sourceDate = shiftIsoDate(targetDate, -1);
      setIsMutating(true);
      setErrorBanner(null);
      try {
        const res = await copyInsiteScheduleFromDate(
          branch,
          sourceDate,
          targetDate,
        );
        if (res.targetSchedule) {
          const targetSchedule = res.targetSchedule;
          setSchedules((prev) =>
            prev.some((s) => s.id === targetSchedule.id)
              ? prev
              : [targetSchedule, ...prev],
          );
        }
        if (res.insertedOverrides.length > 0) {
          setDailyRoomOverrides((prev) => [...prev, ...res.insertedOverrides]);
        }
        if (res.insertedAssignments.length > 0) {
          setAssignments((prev) => [...prev, ...res.insertedAssignments]);
        }
        return {
          copiedCount: res.copiedCount,
          copiedRoomsCount: res.copiedRoomsCount,
          skippedCount: res.skippedCount,
          sourceTotalCount: res.sourceTotalCount,
          sourceDate,
        };
      } finally {
        setIsMutating(false);
      }
    },
    [],
  );

  const upsertCampaign = useCallback(
    async (input: OnsiteScheduleInput) => {
      setIsMutating(true);
      setErrorBanner(null);
      try {
        const saved = await saveOnsiteSchedule(input);
        const savedMonth = saved.schedule_date.slice(0, 7);
        if (savedMonth !== selectedMonth) {
          setSelectedMonth(savedMonth);
        } else {
          setSchedules((prev) => {
            const exists = prev.some((s) => s.id === saved.id);
            return exists
              ? prev.map((s) => (s.id === saved.id ? saved : s))
              : [saved, ...prev];
          });
        }
        return saved;
      } finally {
        setIsMutating(false);
      }
    },
    [selectedMonth],
  );

  const createCampaigns = useCallback(
    async (
      inputs: OnsiteScheduleInput[],
      setupInputs?: OnsiteScheduleInput[],
    ) => {
      setIsMutating(true);
      setErrorBanner(null);
      try {
        const created = await createOnsiteSchedules(inputs, setupInputs);
        const month = inputs[0].schedule_date.slice(0, 7);
        if (month !== selectedMonth) setSelectedMonth(month);
        else
          setSchedules((previous) => [
            ...created.filter((item) =>
              item.schedule_date.startsWith(selectedMonth),
            ),
            ...previous,
          ]);
        return created;
      } finally {
        setIsMutating(false);
      }
    },
    [selectedMonth],
  );

  const removeCampaign = useCallback(
    async (campaign: RosterSchedule) => {
      const previousSchedules = schedules;
      const previousAssignments = assignments;
      setErrorBanner(null);
      setSchedules((prev) => prev.filter((s) => s.id !== campaign.id));
      setAssignments((prev) =>
        prev.filter((a) => a.schedule_id !== campaign.id),
      );
      try {
        await deleteRosterSchedule(campaign.id);
      } catch (err) {
        setSchedules(previousSchedules);
        setAssignments(previousAssignments);
        throw err;
      }
    },
    [assignments, schedules],
  );

  const updateCampaignPositions = useCallback(
    async (
      campaignId: string,
      positionList: string[],
      orderMode?: 'alphabetical' | 'manual',
    ) => {
      setIsMutating(true);
      setErrorBanner(null);
      try {
        const updated = await updateCampaignPositionList(
          campaignId,
          positionList,
          orderMode,
        );
        setSchedules((prev) =>
          prev.map((s) => (s.id === campaignId ? updated : s)),
        );
        return updated;
      } finally {
        setIsMutating(false);
      }
    },
    [],
  );

  const renamePositionInCampaign = useCallback(
    async (
      campaignId: string,
      oldName: string,
      newName: string,
      currentPositionList: string[],
    ) => {
      setIsMutating(true);
      setErrorBanner(null);
      try {
        const updated = await renameCampaignPosition(
          campaignId,
          oldName,
          newName,
          currentPositionList,
        );
        const trimmedOld = oldName.trim();
        const trimmedNew = newName.trim();
        setSchedules((prev) =>
          prev.map((s) => (s.id === campaignId ? updated : s)),
        );
        setAssignments((prev) =>
          prev.map((a) =>
            a.schedule_id === campaignId &&
            a.position_label.trim() === trimmedOld
              ? { ...a, position_label: trimmedNew }
              : a,
          ),
        );
        return updated;
      } finally {
        setIsMutating(false);
      }
    },
    [],
  );

  const removePositionFromCampaign = useCallback(
    async (
      campaignId: string,
      positionName: string,
      currentPositionList: string[],
    ) => {
      const previousSchedules = schedules;
      const previousAssignments = assignments;
      const trimmed = positionName.trim();
      setErrorBanner(null);
      setSchedules((prev) =>
        prev.map((s) =>
          s.id === campaignId
            ? {
                ...s,
                position_list: currentPositionList
                  .map((p) => p.trim())
                  .filter((p) => p && p !== trimmed),
              }
            : s,
        ),
      );
      setAssignments((prev) =>
        prev.filter(
          (a) =>
            !(
              a.schedule_id === campaignId &&
              a.position_label.trim() === trimmed
            ),
        ),
      );
      try {
        const updated = await removeCampaignPositionAndAssignments(
          campaignId,
          positionName,
          currentPositionList,
        );
        setSchedules((prev) =>
          prev.map((s) => (s.id === campaignId ? updated : s)),
        );
        return updated;
      } catch (err) {
        setSchedules(previousSchedules);
        setAssignments(previousAssignments);
        throw err;
      }
    },
    [assignments, schedules],
  );

  const updateCampaignAllowance = useCallback(
    async (
      campaignId: string,
      allowanceCost: number,
      syncExistingAssignments = true,
    ) => {
      setIsMutating(true);
      setErrorBanner(null);
      try {
        const res = await updateCampaignDefaultAllowance(
          campaignId,
          allowanceCost,
          syncExistingAssignments,
        );
        setSchedules((prev) =>
          prev.map((s) => (s.id === campaignId ? res.schedule : s)),
        );
        if (syncExistingAssignments) {
          const updatedMap = new Map(
            res.updatedAssignments.map((a) => [a.id, a]),
          );
          setAssignments((prev) => prev.map((a) => updatedMap.get(a.id) ?? a));
        }
        return res.schedule;
      } finally {
        setIsMutating(false);
      }
    },
    [],
  );

  const cloneCampaign = useCallback(
    async (
      input: OnsiteScheduleInput,
      sourceAssignments: RosterAssignment[],
      copyAssignments: boolean,
    ) => {
      setIsMutating(true);
      setErrorBanner(null);
      try {
        const res = await duplicateOnsiteCampaign(
          input,
          sourceAssignments,
          copyAssignments,
        );
        const savedMonth = res.schedule.schedule_date.slice(0, 7);
        if (savedMonth !== selectedMonth) {
          setSelectedMonth(savedMonth);
        } else {
          setSchedules((prev) => [res.schedule, ...prev]);
          if (res.insertedAssignments.length > 0) {
            setAssignments((prev) => [...prev, ...res.insertedAssignments]);
          }
        }
        return res.schedule;
      } finally {
        setIsMutating(false);
      }
    },
    [selectedMonth],
  );

  const upsertCampaignAssignment = useCallback(
    async (input: RosterAssignmentInput) => {
      setIsMutating(true);
      setErrorBanner(null);
      try {
        const saved = await saveRosterAssignment(input);
        setAssignments((prev) => {
          if (input.id) {
            return prev.map((a) => (a.id === saved.id ? saved : a));
          }
          return [...prev, saved];
        });
        return saved;
      } finally {
        setIsMutating(false);
      }
    },
    [],
  );

  const removeAssignment = useCallback(
    async (assignmentId: string) => {
      const previousAssignments = assignments;
      setErrorBanner(null);
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
      try {
        await deleteRosterAssignment(assignmentId);
      } catch (err) {
        setAssignments(previousAssignments);
        throw err;
      }
    },
    [assignments],
  );

  const upsertPersonnel = useCallback(async (input: MedicalPersonnelInput) => {
    setIsMutating(true);
    setErrorBanner(null);
    try {
      const saved = await saveMedicalPersonnel(input);
      setPersonnelList((prev) => {
        const existing = prev.find((p) => p.id === saved.id);
        if (existing) {
          const merged: MedicalPersonnel = {
            ...saved,
            assignment_count:
              saved.assignment_count ?? existing.assignment_count ?? 0,
          };
          return prev.map((p) => (p.id === saved.id ? merged : p));
        }
        return [saved, ...prev];
      });
      return saved;
    } finally {
      setIsMutating(false);
    }
  }, []);

  const togglePersonnelActive = useCallback(
    async (person: MedicalPersonnel, nextActive: boolean) => {
      const previousPersonnel = personnelList;
      setErrorBanner(null);
      setPersonnelList((prev) =>
        prev.map((p) =>
          p.id === person.id ? { ...p, is_active: nextActive } : p,
        ),
      );
      try {
        const updated = await setMedicalPersonnelActiveStatus(
          person.id,
          nextActive,
        );
        const merged: MedicalPersonnel = {
          ...updated,
          assignment_count: person.assignment_count ?? 0,
        };
        setPersonnelList((prev) =>
          prev.map((p) => (p.id === person.id ? merged : p)),
        );
        return merged;
      } catch (err) {
        setPersonnelList(previousPersonnel);
        throw err;
      }
    },
    [personnelList],
  );

  const bulkUpsertPersonnel = useCallback(
    async (items: MedicalPersonnelInput[]) => {
      setIsMutating(true);
      setErrorBanner(null);
      try {
        const savedItems = await bulkImportMedicalPersonnel(items);
        const freshPersonnel = await fetchMedicalPersonnel();
        setPersonnelList(freshPersonnel);
        return savedItems;
      } finally {
        setIsMutating(false);
      }
    },
    [],
  );

  const removePersonnel = useCallback(
    async (person: MedicalPersonnel) => {
      const previousPersonnel = personnelList;
      const hasKnownAssignments =
        (person.assignment_count ?? 0) > 0 ||
        assignments.some((a) => a.personnel_id === person.id);
      setErrorBanner(null);
      if (hasKnownAssignments) {
        setPersonnelList((prev) =>
          prev.map((p) =>
            p.id === person.id ? { ...p, is_active: false } : p,
          ),
        );
      } else {
        setPersonnelList((prev) => prev.filter((p) => p.id !== person.id));
      }

      try {
        const res = await deleteOrArchiveMedicalPersonnel(person.id);
        if (res.action === 'archived' && !hasKnownAssignments) {
          setPersonnelList(
            previousPersonnel.map((p) =>
              p.id === person.id ? { ...p, is_active: false } : p,
            ),
          );
        }
        return res;
      } catch (err) {
        setPersonnelList(previousPersonnel);
        throw err;
      }
    },
    [assignments, personnelList],
  );

  const value = useMemo<RosterContextValue>(
    () => ({
      canEditHistory,
      rosterToday,
      selectedBranch,
      setSelectedBranch,
      selectedDate,
      setSelectedDate,
      selectedMonth,
      setSelectedMonth,
      personnelList,
      activePersonnel,
      personnelMap,
      roomsList,
      roomMap,
      dailyRoomOverrides,
      schedules,
      scheduleMap,
      assignments,
      isLoading,
      isMutating,
      errorBanner,
      successBanner,
      clearBanners,
      showNotice,
      setErrorMessage,
      reloadAll,
      addRoom,
      renameRoom,
      removeRoom,
      addDailyRoom,
      deleteDailyRoom,
      hideRoomForDate,
      restoreHiddenRoomForDate,
      restoreAllHiddenRoomsForDate,
      upsertInsiteAssignment,
      copyInsiteFromYesterday,
      upsertCampaign,
      createCampaigns,
      removeCampaign,
      updateCampaignPositions,
      renamePositionInCampaign,
      removePositionFromCampaign,
      updateCampaignAllowance,
      cloneCampaign,
      upsertCampaignAssignment,
      removeAssignment,
      upsertPersonnel,
      togglePersonnelActive,
      bulkUpsertPersonnel,
      removePersonnel,
    }),
    [
      canEditHistory,
      rosterToday,
      selectedBranch,
      selectedDate,
      setSelectedDate,
      selectedMonth,
      personnelList,
      activePersonnel,
      personnelMap,
      roomsList,
      roomMap,
      dailyRoomOverrides,
      schedules,
      scheduleMap,
      assignments,
      isLoading,
      isMutating,
      errorBanner,
      successBanner,
      clearBanners,
      showNotice,
      setErrorMessage,
      reloadAll,
      addRoom,
      renameRoom,
      removeRoom,
      addDailyRoom,
      deleteDailyRoom,
      hideRoomForDate,
      restoreHiddenRoomForDate,
      restoreAllHiddenRoomsForDate,
      upsertInsiteAssignment,
      copyInsiteFromYesterday,
      upsertCampaign,
      createCampaigns,
      removeCampaign,
      updateCampaignPositions,
      renamePositionInCampaign,
      removePositionFromCampaign,
      updateCampaignAllowance,
      cloneCampaign,
      upsertCampaignAssignment,
      removeAssignment,
      upsertPersonnel,
      togglePersonnelActive,
      bulkUpsertPersonnel,
      removePersonnel,
    ],
  );

  return (
    <RosterContext.Provider value={value}>{children}</RosterContext.Provider>
  );
}
