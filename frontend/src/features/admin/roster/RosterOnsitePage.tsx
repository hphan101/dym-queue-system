import { useEffect, useId, useMemo, useState } from 'react';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  DocumentDuplicateIcon,
  EllipsisHorizontalIcon,
  PencilSquareIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatePicker, MonthPicker } from '@/components/ui/date-picker';
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { BranchCode } from '../../../types/domain';
import { formatDisplayDate } from '../utils/adminFormatters';
import { exportScheduleCostExcel } from './exportRosterExcel';
import {
  RosterAssignmentCell,
  type RosterAssignmentDraft,
} from './RosterAssignmentCell';
import {
  CAMPAIGN_POSITION_TEMPLATES,
  formatCurrencyInput,
  formatMonthTag,
  formatVndCurrency,
  parseCurrencyInput,
  ROSTER_BRANCH_LABELS,
  SHIFT_SHORT_LABELS,
  summarizeAssignmentCosts,
  type OnsiteScheduleInput,
  type RosterAssignment,
  type RosterSchedule,
} from './rosterService';
import { RosterShell } from './RosterShell';
import { useRosterData } from './useRosterData';

interface PendingPositionRemoval {
  positionName: string;
  assignedCount: number;
  assignedCost: number;
}

export function RosterOnsitePage({
  authorizedIsAdmin = true,
}: {
  authorizedIsAdmin?: boolean;
}) {
  const {
    selectedBranch,
    selectedDate,
    selectedMonth,
    setSelectedMonth,
    activePersonnel,
    personnelMap,
    roomMap,
    dailyRoomOverrides,
    schedules,
    assignments,
    isLoading,
    isMutating,
    reloadAll,
    showNotice,
    setErrorMessage,
    upsertCampaign,
    removeCampaign,
    updateCampaignPositions,
    renamePositionInCampaign,
    removePositionFromCampaign,
    updateCampaignAllowance,
    cloneCampaign,
    upsertCampaignAssignment,
    removeAssignment,
  } = useRosterData();

  const [typeFilter, setTypeFilter] = useState<
    'all' | 'onsite_exam' | 'blood_draw'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputId = useId();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    null,
  );

  // Global search keyboard shortcut '/'
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        event.preventDefault();
        const searchInput = document.getElementById(searchInputId);
        searchInput?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchInputId]);

  // Campaign Create / Edit / Clone Dialog state
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [campaignModalMode, setCampaignModalMode] = useState<
    'create' | 'edit' | 'clone'
  >('create');
  const [cloneSourceCampaign, setCloneSourceCampaign] =
    useState<RosterSchedule | null>(null);
  const [startFromTemplate, setStartFromTemplate] = useState(true);
  const [copyAssignmentsOnClone, setCopyAssignmentsOnClone] = useState(true);
  const [campaignForm, setCampaignForm] = useState<OnsiteScheduleInput>({
    id: null,
    schedule_type: 'onsite_exam',
    branch_code: 'q1',
    schedule_date: selectedDate,
    campaign_code: '',
    company_name: '',
    contact_person: '',
    company_address: '',
    notes: '',
    default_allowance: 0,
    position_list: [],
  });

  // Campaign Header Actions menu & Delete Campaign confirmation Dialog
  const [isCampaignMenuOpen, setIsCampaignMenuOpen] = useState(false);
  const [campaignPendingDelete, setCampaignPendingDelete] =
    useState<RosterSchedule | null>(null);

  // Campaign-level "Phụ cấp mỗi người" input state
  const [allowanceDraft, setAllowanceDraft] = useState<number>(0);

  // Position rows management state (add, rename, delete)
  const [isAddingPosition, setIsAddingPosition] = useState(false);
  const [newPositionName, setNewPositionName] = useState('');
  const [openPositionMenuKey, setOpenPositionMenuKey] = useState<string | null>(
    null,
  );
  const [renamingPosition, setRenamingPosition] = useState<string | null>(null);
  const [renamePositionDraft, setRenamePositionDraft] = useState('');
  const [pendingPositionRemoval, setPendingPositionRemoval] =
    useState<PendingPositionRemoval | null>(null);

  // Per-position Popover state for adding/editing personnel chip
  const [popoverPositionName, setPopoverPositionName] = useState<string | null>(
    null,
  );

  // Sort campaigns chronologically by schedule_date so coordinators can scan upcoming/monthly dates easily
  const allOnsiteCampaigns = useMemo(
    () =>
      schedules
        .filter((s) => s.schedule_type !== 'insite')
        .sort(
          (a, b) =>
            a.schedule_date.localeCompare(b.schedule_date) ||
            (a.campaign_code ?? '').localeCompare(b.campaign_code ?? ''),
        ),
    [schedules],
  );

  const filteredCampaigns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allOnsiteCampaigns.filter((c) => {
      if (typeFilter !== 'all' && c.schedule_type !== typeFilter) return false;
      if (!q) return true;
      const hay =
        `${c.campaign_code ?? ''} ${c.company_name} ${c.contact_person} ${c.company_address}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allOnsiteCampaigns, typeFilter, searchQuery]);

  useEffect(() => {
    if (
      filteredCampaigns.length > 0 &&
      (!selectedCampaignId ||
        !filteredCampaigns.some((c) => c.id === selectedCampaignId))
    ) {
      setSelectedCampaignId(filteredCampaigns[0].id);
    } else if (filteredCampaigns.length === 0) {
      setSelectedCampaignId(null);
    }
  }, [filteredCampaigns, selectedCampaignId]);

  const selectedCampaign = useMemo(
    () => filteredCampaigns.find((c) => c.id === selectedCampaignId) ?? null,
    [filteredCampaigns, selectedCampaignId],
  );

  useEffect(() => {
    if (selectedCampaign) {
      setAllowanceDraft(Number(selectedCampaign.default_allowance ?? 0));
      setIsAddingPosition(false);
      setNewPositionName('');
      setRenamingPosition(null);
      setPopoverPositionName(null);
    }
  }, [selectedCampaign]);

  const selectedCampaignAssignments = useMemo(() => {
    if (!selectedCampaign) return [];
    return assignments.filter((a) => a.schedule_id === selectedCampaign.id);
  }, [assignments, selectedCampaign]);

  // Effective positions list for the selected campaign:
  // Union of selectedCampaign.position_list + any position_label from existing assignments
  const effectivePositions = useMemo<string[]>(() => {
    if (!selectedCampaign) return [];
    const result: string[] = [];
    const seen = new Set<string>();

    for (const pos of selectedCampaign.position_list ?? []) {
      const trimmed = pos.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        result.push(trimmed);
      }
    }

    for (const assign of selectedCampaignAssignments) {
      const trimmed = (assign.position_label || 'Vị trí chung').trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        result.push(trimmed);
      }
    }

    return result;
  }, [selectedCampaign, selectedCampaignAssignments]);

  // Template suggestions that are not yet in effectivePositions
  const remainingTemplateSuggestions = useMemo<string[]>(() => {
    if (!selectedCampaign) return [];
    const templateType =
      selectedCampaign.schedule_type === 'blood_draw'
        ? 'blood_draw'
        : 'onsite_exam';
    const existingSet = new Set(effectivePositions.map((p) => p.toLowerCase()));
    return CAMPAIGN_POSITION_TEMPLATES[templateType].filter(
      (item) => !existingSet.has(item.toLowerCase()),
    );
  }, [effectivePositions, selectedCampaign]);

  const assignmentsByPosition = useMemo(() => {
    const map = new Map<string, RosterAssignment[]>();
    for (const pos of effectivePositions) {
      map.set(pos, []);
    }
    for (const assign of selectedCampaignAssignments) {
      const key = (assign.position_label || 'Vị trí chung').trim();
      const list = map.get(key) ?? [];
      list.push(assign);
      map.set(key, list);
    }
    return map;
  }, [effectivePositions, selectedCampaignAssignments]);

  // Cross-page & same-day conflict detection (Insite D1, Insite D7, and all Onsite campaigns on selectedCampaign.schedule_date)
  const sameDayScheduleMap = useMemo(() => {
    const map = new Map<string, RosterSchedule>();
    if (!selectedCampaign) return map;
    for (const sched of schedules) {
      if (sched.schedule_date === selectedCampaign.schedule_date) {
        map.set(sched.id, sched);
      }
    }
    return map;
  }, [schedules, selectedCampaign]);

  const sameDayAssignmentsByPerson = useMemo(() => {
    const map = new Map<string, RosterAssignment[]>();
    if (!selectedCampaign) return map;

    for (const item of assignments) {
      const sched = sameDayScheduleMap.get(item.schedule_id);
      if (!sched) continue;

      // Skip assignments belonging to hidden Insite rooms on that day
      if (sched.schedule_type === 'insite' && item.room_id) {
        const isHiddenRoom = dailyRoomOverrides.some(
          (o) =>
            o.schedule_date === sched.schedule_date &&
            o.branch_code === sched.branch_code &&
            o.override_type === 'hide' &&
            o.room_id === item.room_id,
        );
        if (isHiddenRoom) continue;
      }

      const list = map.get(item.personnel_id) ?? [];
      list.push(item);
      map.set(item.personnel_id, list);
    }
    return map;
  }, [assignments, dailyRoomOverrides, sameDayScheduleMap, selectedCampaign]);

  const getConflictLocationLabel = (assign: RosterAssignment): string => {
    const sched = sameDayScheduleMap.get(assign.schedule_id);
    if (!sched) return assign.position_label || 'Ca khác';

    if (sched.schedule_type === 'insite') {
      const branchShort = sched.branch_code === 'q7' ? 'D7' : 'D1';
      let roomName = assign.position_label || 'Phòng khám';
      if (assign.room_id) {
        roomName = roomMap.get(assign.room_id)?.room_name || roomName;
      } else if (assign.daily_override_id) {
        const ov = dailyRoomOverrides.find(
          (o) => o.id === assign.daily_override_id,
        );
        if (ov?.custom_room_name) roomName = ov.custom_room_name;
      }
      return `${roomName} (${branchShort})`;
    }

    if (selectedCampaign && sched.id === selectedCampaign.id) {
      return assign.position_label || 'Trong đoàn';
    }

    const pos = assign.position_label || 'Đoàn khác';
    const company = sched.company_name || sched.campaign_code || 'Onsite';
    return `${pos} (${company})`;
  };

  // Campaign cost totals (3 numbers at top: Cost cố định, Phụ cấp, Tổng + Số người)
  const {
    baseCost: campaignBaseCost,
    allowanceCost: campaignAllowanceCost,
    totalCost: campaignTotalCost,
  } = useMemo(
    () => summarizeAssignmentCosts(selectedCampaignAssignments),
    [selectedCampaignAssignments],
  );

  const staffedPositionsCount = useMemo(
    () =>
      effectivePositions.filter(
        (pos) => (assignmentsByPosition.get(pos)?.length ?? 0) > 0,
      ).length,
    [assignmentsByPosition, effectivePositions],
  );

  // Campaign Modal handlers (Create / Edit / Clone)
  const buildNextCampaignCode = (dateStr: string) => {
    const randomSuffix = String(allOnsiteCampaigns.length + 1).padStart(3, '0');
    return `DOAN-${dateStr.replace(/-/g, '')}-${randomSuffix}`;
  };

  const openCreateCampaignModal = () => {
    setCampaignModalMode('create');
    setCloneSourceCampaign(null);
    setStartFromTemplate(true);
    setCampaignForm({
      id: null,
      schedule_type: 'onsite_exam',
      branch_code: selectedBranch,
      schedule_date: selectedDate,
      campaign_code: buildNextCampaignCode(selectedDate),
      company_name: '',
      contact_person: '',
      company_address: '',
      notes: '',
      default_allowance: 0,
      position_list: [...CAMPAIGN_POSITION_TEMPLATES.onsite_exam],
    });
    setIsCampaignModalOpen(true);
  };

  const openEditCampaignModal = (campaign: RosterSchedule) => {
    setCampaignModalMode('edit');
    setCloneSourceCampaign(null);
    setCampaignForm({
      id: campaign.id,
      schedule_type:
        campaign.schedule_type === 'blood_draw' ? 'blood_draw' : 'onsite_exam',
      branch_code: campaign.branch_code,
      schedule_date: campaign.schedule_date,
      campaign_code: campaign.campaign_code ?? '',
      company_name: campaign.company_name,
      contact_person: campaign.contact_person,
      company_address: campaign.company_address,
      notes: campaign.notes,
      default_allowance: campaign.default_allowance ?? 0,
      position_list: campaign.position_list ?? [],
    });
    setIsCampaignModalOpen(true);
  };

  const openCloneCampaignModal = (campaign: RosterSchedule) => {
    setIsCampaignMenuOpen(false);
    setCampaignModalMode('clone');
    setCloneSourceCampaign(campaign);
    setCopyAssignmentsOnClone(true);
    setCampaignForm({
      id: null,
      schedule_type:
        campaign.schedule_type === 'blood_draw' ? 'blood_draw' : 'onsite_exam',
      branch_code: campaign.branch_code,
      schedule_date: selectedDate,
      campaign_code: buildNextCampaignCode(selectedDate),
      company_name: campaign.company_name,
      contact_person: campaign.contact_person,
      company_address: campaign.company_address,
      notes: campaign.notes,
      default_allowance: campaign.default_allowance ?? 0,
      position_list:
        effectivePositions.length > 0
          ? [...effectivePositions]
          : [
              ...CAMPAIGN_POSITION_TEMPLATES[
                campaign.schedule_type === 'blood_draw'
                  ? 'blood_draw'
                  : 'onsite_exam'
              ],
            ],
    });
    setIsCampaignModalOpen(true);
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !campaignForm.campaign_code.trim() ||
      !campaignForm.company_name.trim()
    ) {
      setErrorMessage('Vui lòng nhập Mã đoàn khám và Tên công ty.');
      return;
    }

    try {
      if (campaignModalMode === 'clone' && cloneSourceCampaign) {
        const sourceAssigns = assignments.filter(
          (a) => a.schedule_id === cloneSourceCampaign.id,
        );
        const cloned = await cloneCampaign(
          campaignForm,
          sourceAssigns,
          copyAssignmentsOnClone,
        );
        setSelectedCampaignId(cloned.id);
        setIsCampaignModalOpen(false);
        showNotice(
          `Đã nhân bản đoàn khám "${cloned.company_name}" (${cloned.campaign_code}).`,
        );
        return;
      }

      const payload: OnsiteScheduleInput = {
        ...campaignForm,
        position_list:
          campaignModalMode === 'create'
            ? startFromTemplate
              ? [
                  ...CAMPAIGN_POSITION_TEMPLATES[
                    campaignForm.schedule_type === 'blood_draw'
                      ? 'blood_draw'
                      : 'onsite_exam'
                  ],
                ]
              : []
            : campaignForm.position_list,
      };

      const saved = await upsertCampaign(payload);
      setSelectedCampaignId(saved.id);
      setIsCampaignModalOpen(false);
      showNotice(
        campaignForm.id
          ? `Đã cập nhật thông tin đoàn "${saved.company_name}".`
          : `Đã tạo đoàn khám "${saved.company_name}" (${saved.campaign_code}).`,
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Không thể lưu đoàn khám.',
      );
    }
  };

  const handleConfirmDeleteCampaign = async () => {
    if (!campaignPendingDelete) return;
    const target = campaignPendingDelete;
    setCampaignPendingDelete(null);
    try {
      await removeCampaign(target);
      showNotice(`Đã xóa đoàn khám "${target.company_name}".`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Không thể xóa đoàn khám.',
      );
    }
  };

  // Campaign-level "Phụ cấp mỗi người" apply handler
  const handleApplyCampaignAllowance = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedCampaign) return;
    const nextAllowance = Math.max(0, Math.round(Number(allowanceDraft) || 0));
    try {
      await updateCampaignAllowance(selectedCampaign.id, nextAllowance, true);
      showNotice(
        selectedCampaignAssignments.length > 0
          ? `Đã áp dụng phụ cấp ${formatVndCurrency(nextAllowance)}/người cho toàn bộ ${selectedCampaignAssignments.length} nhân sự trong đoàn.`
          : `Đã đặt phụ cấp mặc định ${formatVndCurrency(nextAllowance)}/người cho đoàn khám.`,
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Không thể cập nhật phụ cấp mỗi người.',
      );
    }
  };

  // Position list management handlers
  const handleAddPosition = async (positionToAdd?: string) => {
    if (!selectedCampaign) return;
    const trimmed = (positionToAdd ?? newPositionName).trim();
    if (!trimmed) {
      setIsAddingPosition(false);
      return;
    }
    if (
      effectivePositions.some((p) => p.toLowerCase() === trimmed.toLowerCase())
    ) {
      setErrorMessage(`Vị trí "${trimmed}" đã có trong đoàn khám này.`);
      return;
    }
    try {
      const nextList = [...effectivePositions, trimmed];
      await updateCampaignPositions(selectedCampaign.id, nextList);
      setNewPositionName('');
      if (!positionToAdd) {
        setIsAddingPosition(false);
      }
      showNotice(`Đã thêm vị trí "${trimmed}".`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Không thể thêm vị trí.',
      );
    }
  };

  const handleApplyTemplatePositions = async () => {
    if (!selectedCampaign) return;
    const templateType =
      selectedCampaign.schedule_type === 'blood_draw'
        ? 'blood_draw'
        : 'onsite_exam';
    const merged = Array.from(
      new Set([
        ...effectivePositions,
        ...CAMPAIGN_POSITION_TEMPLATES[templateType],
      ]),
    );
    try {
      await updateCampaignPositions(selectedCampaign.id, merged);
      showNotice('Đã nạp danh sách vị trí mẫu cho đoàn khám.');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Không thể nạp vị trí mẫu.',
      );
    }
  };

  const handleSaveRenamePosition = async (oldName: string) => {
    if (!selectedCampaign) return;
    const trimmedNew = renamePositionDraft.trim();
    if (!trimmedNew || trimmedNew === oldName) {
      setRenamingPosition(null);
      return;
    }
    try {
      await renamePositionInCampaign(
        selectedCampaign.id,
        oldName,
        trimmedNew,
        effectivePositions,
      );
      setRenamingPosition(null);
      showNotice(`Đã đổi tên vị trí thành "${trimmedNew}".`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Không thể đổi tên vị trí.',
      );
    }
  };

  const requestRemovePosition = (positionName: string) => {
    setOpenPositionMenuKey(null);
    if (!selectedCampaign) return;
    const posAssigns = assignmentsByPosition.get(positionName) ?? [];
    if (posAssigns.length > 0) {
      const posCost = posAssigns.reduce(
        (sum, a) =>
          sum + Number(a.base_cost_snapshot) + Number(a.allowance_cost),
        0,
      );
      setPendingPositionRemoval({
        positionName,
        assignedCount: posAssigns.length,
        assignedCost: posCost,
      });
      return;
    }
    void executeRemovePosition(positionName);
  };

  const executeRemovePosition = async (positionName: string) => {
    if (!selectedCampaign) return;
    try {
      await removePositionFromCampaign(
        selectedCampaign.id,
        positionName,
        effectivePositions,
      );
      setPendingPositionRemoval(null);
      showNotice(`Đã xóa vị trí "${positionName}" khỏi đoàn khám.`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Không thể xóa vị trí.',
      );
    }
  };

  const handleSubmitPositionAssignment = async (
    positionName: string,
    draft: RosterAssignmentDraft,
  ): Promise<boolean> => {
    if (!selectedCampaign) return false;
    if (!draft.personnelId) {
      setErrorMessage('Vui lòng chọn nhân sự.');
      return false;
    }

    if (draft.conflictAssignment) {
      const conflictPerson = personnelMap.get(draft.personnelId);
      setErrorMessage(
        `${conflictPerson?.full_name || 'Nhân sự'} đã xếp tại ${getConflictLocationLabel(draft.conflictAssignment)} (${SHIFT_SHORT_LABELS[draft.conflictAssignment.shift_period]}).`,
      );
      return false;
    }

    const posAssigns = assignmentsByPosition.get(positionName) ?? [];

    try {
      // Ensure position is persisted in campaign's position_list
      if (!selectedCampaign.position_list.includes(positionName)) {
        await updateCampaignPositions(selectedCampaign.id, effectivePositions);
      }

      await upsertCampaignAssignment({
        id: draft.editingAssignmentId,
        schedule_id: selectedCampaign.id,
        room_id: null,
        daily_override_id: null,
        position_label: positionName,
        personnel_id: draft.personnelId,
        shift_period: draft.shiftPeriod,
        base_cost_snapshot: draft.baseCostSnapshot,
        allowance_cost: draft.allowanceCost,
        note: draft.note,
        sort_order: draft.editingAssignmentId
          ? undefined
          : posAssigns.length * 10 + 10,
      });

      const person = personnelMap.get(draft.personnelId);
      showNotice(
        draft.editingAssignmentId
          ? `Đã cập nhật ca của ${person?.full_name ?? 'nhân sự'} tại ${positionName}.`
          : `Đã xếp ${person?.full_name ?? 'nhân sự'} vào vị trí ${positionName}.`,
      );
      return true;
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Không thể lưu phân công vào đoàn khám.',
      );
      return false;
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    try {
      await removeAssignment(assignmentId);
      showNotice('Đã gỡ nhân sự khỏi vị trí khám.');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Không thể xóa phân công.',
      );
    }
  };

  return (
    <RosterShell
      activePage="roster-onsite"
      title="Đoàn khám Onsite & Lấy máu ngoại viện"
      authorizedIsAdmin={authorizedIsAdmin}
      headerActions={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={() => void reloadAll(true)}
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
      {/* Scope Bar: Month + Type Filter + Search */}
      <div className="dym-roster-scope-bar">
        <div className="dym-roster-scope-left">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-muted-foreground">
              Tháng thực hiện:
            </span>
            <MonthPicker
              value={selectedMonth}
              onChange={setSelectedMonth}
              ariaLabel="Chọn tháng thực hiện"
            />
          </div>

          <Select
            value={typeFilter}
            onValueChange={(value) =>
              setTypeFilter(value as 'all' | 'onsite_exam' | 'blood_draw')
            }
          >
            <SelectTrigger
              aria-label="Lọc loại đoàn khám"
              className="h-9 w-[240px] bg-card px-3 text-[13px] font-medium shadow-sm"
            >
              <SelectValue placeholder="Loại đoàn khám" />
            </SelectTrigger>
            <SelectContent align="start" className="w-[240px]">
              <SelectGroup>
                <SelectItem value="all" className="text-[13px]">
                  Tất cả
                </SelectItem>
                <SelectItem value="onsite_exam" className="text-[13px]">
                  Đoàn khám Onsite
                </SelectItem>
                <SelectItem value="blood_draw" className="text-[13px]">
                  Đoàn lấy máu ngoại viện
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="dym-roster-scope-right">
          <div className="relative w-full sm:w-64 lg:w-72">
            <label htmlFor={searchInputId} className="sr-only">
              Tìm kiếm đoàn khám
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id={searchInputId}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm mã đoàn, công ty, phụ trách..."
              className="dym-search-field h-9 bg-card pl-8 pr-8 text-xs shadow-sm"
            />
            {searchQuery ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSearchQuery('')}
                aria-label="Xóa từ khóa tìm kiếm"
                className="absolute right-1.5 top-1/2 size-6 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X aria-hidden="true" />
              </Button>
            ) : (
              <kbd
                className="pointer-events-none absolute right-2 top-1/2 inline-flex h-5 -translate-y-1/2 select-none items-center rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground"
                title="Phím tắt: /"
              >
                /
              </kbd>
            )}
          </div>
        </div>
      </div>

      {/* Master-Detail Split Layout */}
      <div className="dym-roster-split-layout">
        {/* Left Rail: Campaign List sorted by exam date */}
        <aside className="dym-roster-panel">
          <header className="dym-roster-panel-header">
            <div className="dym-roster-panel-title-group">
              <h2 className="dym-roster-panel-title">
                Danh sách đoàn ({formatMonthTag(selectedMonth)})
              </h2>
              <p className="dym-roster-panel-subtitle">
                {filteredCampaigns.length} đoàn · Sắp theo ngày khám
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={openCreateCampaignModal}
              className="h-8 gap-1 px-2.5 text-[13px] font-medium shadow-sm"
            >
              <PlusIcon className="size-3.5" aria-hidden="true" />
              <span>Tạo đoàn</span>
            </Button>
          </header>

          {isLoading ? (
            <div
              className="dym-roster-campaign-list"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <span className="sr-only">Đang tải danh sách đoàn khám...</span>
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="dym-roster-campaign-card pointer-events-none flex flex-col gap-2"
                  aria-hidden="true"
                >
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-5 w-24 rounded-md" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-4 w-44" />
                  <div className="flex items-center justify-between pt-0.5">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="dym-roster-empty-slot">
              <span>
                <strong>
                  Chưa có đoàn khám nào trong {formatMonthTag(selectedMonth)}.
                </strong>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openCreateCampaignModal}
                className="h-8 gap-1 px-2.5 text-xs font-medium"
              >
                <PlusIcon className="size-3.5" aria-hidden="true" />
                <span>Tạo đoàn đầu tiên</span>
              </Button>
            </div>
          ) : (
            <div className="dym-roster-campaign-list">
              {filteredCampaigns.map((camp) => {
                const campAssigns = assignments.filter(
                  (a) => a.schedule_id === camp.id,
                );
                const campTotal = campAssigns.reduce(
                  (s, a) =>
                    s +
                    Number(a.base_cost_snapshot) +
                    Number(a.allowance_cost),
                  0,
                );
                const isSelected = camp.id === selectedCampaignId;
                const isBloodDraw = camp.schedule_type === 'blood_draw';
                const branchLabel = camp.branch_code === 'q7' ? 'D7' : 'D1';

                return (
                  <button
                    key={camp.id}
                    type="button"
                    className={cn(
                      'dym-roster-campaign-card',
                      isSelected && 'is-selected',
                    )}
                    onClick={() => setSelectedCampaignId(camp.id)}
                  >
                    <div className="dym-roster-campaign-card-top">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'inline-flex items-center text-[11px] font-semibold leading-none',
                            isBloodDraw
                              ? 'text-rose-700 dark:text-rose-400'
                              : 'text-blue-700 dark:text-blue-400',
                          )}
                        >
                          {isBloodDraw ? 'Lấy máu' : 'Khám Onsite'}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold leading-none text-muted-foreground">
                          {branchLabel}
                        </span>
                      </div>
                      <span className="dym-roster-tabular text-xs font-semibold text-foreground">
                        {formatDisplayDate(camp.schedule_date)}
                      </span>
                    </div>

                    <div className="dym-roster-campaign-company">
                      {camp.company_name}
                    </div>

                    <div className="dym-roster-campaign-meta">
                      <span className="dym-roster-tabular">
                        {camp.campaign_code} · {campAssigns.length} người
                      </span>
                      <strong className="dym-roster-tabular text-[13px] text-foreground">
                        {formatVndCurrency(campTotal)}
                      </strong>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Right Detail Panel: Selected Campaign */}
        <section className="dym-roster-panel">
          {isLoading ? (
            <div
              className="flex flex-col gap-4 p-6"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <span className="sr-only">Đang tải thông tin đoàn khám...</span>
              <div
                className="flex items-center justify-between"
                aria-hidden="true"
              >
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-5 w-56" />
                  <Skeleton className="h-4 w-72" />
                </div>
                <Skeleton className="h-8 w-28 rounded-md" />
              </div>
              <Skeleton
                className="h-20 w-full rounded-lg"
                aria-hidden="true"
              />
              <Skeleton
                className="h-48 w-full rounded-lg"
                aria-hidden="true"
              />
            </div>
          ) : !selectedCampaign ? (
            <div className="dym-roster-empty-slot">
              <span>
                <strong>
                  Chọn một đoàn khám bên trái hoặc tạo đoàn khám mới
                </strong>{' '}
                để khởi tạo danh sách vị trí và phân công nhân sự.
              </span>
              <Button
                type="button"
                size="sm"
                onClick={openCreateCampaignModal}
                className="h-9 gap-1.5 px-3 text-[13px] font-medium"
              >
                <PlusIcon className="size-4" aria-hidden="true" />
                <span>Tạo đoàn khám</span>
              </Button>
            </div>
          ) : (
            <>
              {/* 1. Campaign Header & Labeled Info Boxes */}
              <header className="flex flex-col gap-3.5 border-b border-border bg-card px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold',
                        selectedCampaign.schedule_type === 'blood_draw'
                          ? 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400'
                          : 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400',
                      )}
                    >
                      {selectedCampaign.schedule_type === 'blood_draw'
                        ? 'Đoàn lấy máu'
                        : 'Khám Onsite'}
                    </span>
                    <span className="dym-roster-code-badge">
                      {selectedCampaign.campaign_code}
                    </span>
                    <h2 className="text-base font-semibold tracking-tight text-foreground">
                      {selectedCampaign.company_name}
                    </h2>
                  </div>

                  {/* Safe Action Bar: [Sửa] [Xuất Excel] [⋯] */}
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openEditCampaignModal(selectedCampaign)}
                      className="h-8 gap-1.5 bg-background px-2.5 text-[13px] font-medium shadow-xs"
                    >
                      <PencilSquareIcon
                        className="size-3.5"
                        aria-hidden="true"
                      />
                      <span>Sửa</span>
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        exportScheduleCostExcel({
                          schedule: selectedCampaign,
                          assignments: selectedCampaignAssignments,
                          personnelMap,
                          roomMap,
                        })
                      }
                      className="h-8 gap-1.5 bg-background px-2.5 text-[13px] font-medium shadow-xs"
                    >
                      <ArrowDownTrayIcon
                        className="size-3.5"
                        aria-hidden="true"
                      />
                      <span>Xuất Excel</span>
                    </Button>

                    <Popover
                      open={isCampaignMenuOpen}
                      onOpenChange={setIsCampaignMenuOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="Thao tác đoàn khám khác"
                          className="size-8 bg-background text-muted-foreground hover:text-foreground"
                        >
                          <EllipsisHorizontalIcon
                            className="size-4"
                            aria-hidden="true"
                          />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        className="w-52 p-1.5 shadow-md"
                      >
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              openCloneCampaignModal(selectedCampaign)
                            }
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
                          >
                            <DocumentDuplicateIcon
                              className="size-4 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span>Nhân bản đoàn khám</span>
                          </button>

                          <div className="my-0.5 h-px bg-border" />

                          <button
                            type="button"
                            onClick={() => {
                              setIsCampaignMenuOpen(false);
                              setCampaignPendingDelete(selectedCampaign);
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/10"
                          >
                            <TrashIcon className="size-4" aria-hidden="true" />
                            <span>Xóa đoàn khám</span>
                          </button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Labeled Metadata Strip (single divided frame instead of 4 nested cards) */}
                <div className="grid grid-cols-2 divide-y divide-border/70 rounded-md border border-border/70 bg-muted/20 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
                  <div className="flex flex-col gap-0.5 px-3 py-2">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Ngày khám
                    </span>
                    <span className="dym-roster-tabular text-[13px] font-semibold text-foreground">
                      {formatDisplayDate(selectedCampaign.schedule_date)}
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5 px-3 py-2">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Cơ sở điều phối
                    </span>
                    <span className="text-[13px] font-semibold text-foreground">
                      {ROSTER_BRANCH_LABELS[
                        selectedCampaign.branch_code as 'q1' | 'q7'
                      ] ?? selectedCampaign.branch_code.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5 px-3 py-2">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Người phụ trách
                    </span>
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {selectedCampaign.contact_person || '—'}
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5 px-3 py-2">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Địa chỉ khám
                    </span>
                    <span
                      className="truncate text-[13px] font-medium text-foreground"
                      title={selectedCampaign.company_address}
                    >
                      {selectedCampaign.company_address || '—'}
                    </span>
                  </div>
                </div>

                {selectedCampaign.notes && (
                  <div className="rounded-md border border-border/60 bg-muted/15 px-3 py-1.5 text-xs text-muted-foreground">
                    <strong className="font-medium text-foreground">
                      Ghi chú điều phối:
                    </strong>{' '}
                    {selectedCampaign.notes}
                  </div>
                )}
              </header>

              {/* 2. Top Cost Summary Strip (3 Numbers + Headcount) & Per-Person Allowance Control */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-5 py-3">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Nhân sự:
                    </span>
                    <strong className="dym-roster-tabular text-sm font-semibold text-foreground">
                      {selectedCampaignAssignments.length} người
                    </strong>
                    <span className="dym-roster-tabular text-xs text-muted-foreground">
                      ({staffedPositionsCount}/{effectivePositions.length} vị
                      trí)
                    </span>
                  </div>

                  <div className="h-4 w-px bg-border" aria-hidden="true" />

                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Cost cố định:
                    </span>
                    <span className="dym-roster-tabular text-sm font-semibold text-foreground">
                      {formatVndCurrency(campaignBaseCost)}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Phụ cấp:
                    </span>
                    <span className="dym-roster-tabular text-sm font-semibold text-foreground">
                      {formatVndCurrency(campaignAllowanceCost)}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 shadow-2xs">
                    <span className="text-xs font-medium text-muted-foreground">
                      Tổng chi phí:
                    </span>
                    <strong className="dym-roster-tabular text-sm font-bold text-foreground">
                      {formatVndCurrency(campaignTotalCost)}
                    </strong>
                  </div>
                </div>

                {/* Per-person allowance input (entered once for the whole campaign) */}
                <form
                  onSubmit={(e) => void handleApplyCampaignAllowance(e)}
                  className="flex items-center gap-2"
                >
                  <label
                    htmlFor="campaign-default-allowance"
                    className="whitespace-nowrap text-xs font-medium text-muted-foreground"
                  >
                    Phụ cấp mỗi người:
                  </label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      id="campaign-default-allowance"
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={formatCurrencyInput(allowanceDraft)}
                      onChange={(e) =>
                        setAllowanceDraft(parseCurrencyInput(e.target.value))
                      }
                      className="dym-roster-tabular h-8 w-28 bg-card text-right text-[13px] font-medium"
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      disabled={isMutating}
                      className="h-8 bg-card px-2.5 text-xs font-medium"
                    >
                      Áp dụng
                    </Button>
                  </div>
                </form>
              </div>

              {/* 3. Position-Grouped 3-Column Table (Vị trí / Bàn khám | Nhân sự trực | Chi phí vị trí) */}
              <div className="dym-roster-table-wrap">
                <table className="dym-roster-table">
                  <thead>
                    <tr>
                      <th className="w-[260px]">Vị trí / Bàn khám</th>
                      <th>Nhân sự trực</th>
                      <th className="is-right w-[160px]">Chi phí vị trí</th>
                    </tr>
                  </thead>
                  <tbody>
                    {effectivePositions.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-6">
                          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border px-4 py-3">
                            <span className="text-[13px] text-muted-foreground">
                              Đoàn khám này chưa có danh sách vị trí. Bạn có thể
                              nạp nhanh các vị trí mẫu hoặc tự thêm từng vị trí
                              bên dưới.
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                void handleApplyTemplatePositions()
                              }
                              className="h-8 gap-1.5 text-xs font-medium"
                            >
                              <SparklesIcon
                                className="size-3.5"
                                aria-hidden="true"
                              />
                              <span>Bắt đầu từ vị trí mẫu</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      effectivePositions.map((positionName) => {
                        const posAssignments =
                          assignmentsByPosition.get(positionName) ?? [];
                        const posCost = posAssignments.reduce(
                          (sum, a) =>
                            sum +
                            Number(a.base_cost_snapshot) +
                            Number(a.allowance_cost),
                          0,
                        );
                        const isPopoverOpenForPosition =
                          popoverPositionName === positionName;
                        const isRowMenuOpen =
                          openPositionMenuKey === positionName;
                        const isRenamingThis =
                          renamingPosition === positionName;

                        return (
                          <tr
                            key={positionName}
                            className={cn(
                              'group/row transition-colors',
                              posAssignments.length === 0 && 'bg-muted/10',
                            )}
                          >
                            {/* Column 1: Position Name + Left Hover ⋯ Menu */}
                            <td className="align-middle font-semibold">
                              {isRenamingThis ? (
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    void handleSaveRenamePosition(positionName);
                                  }}
                                  className="flex items-center gap-1.5"
                                >
                                  <Input
                                    type="text"
                                    value={renamePositionDraft}
                                    onChange={(e) =>
                                      setRenamePositionDraft(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Escape') {
                                        setRenamingPosition(null);
                                      }
                                    }}
                                    autoFocus
                                    className="h-8 w-44 text-[13px]"
                                  />
                                  <Button
                                    type="submit"
                                    size="sm"
                                    className="h-8 px-2.5 text-xs"
                                  >
                                    Lưu
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setRenamingPosition(null)}
                                    className="h-8 px-2 text-xs text-muted-foreground"
                                  >
                                    Hủy
                                  </Button>
                                </form>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <Popover
                                    open={isRowMenuOpen}
                                    onOpenChange={(open) =>
                                      setOpenPositionMenuKey(
                                        open ? positionName : null,
                                      )
                                    }
                                  >
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        aria-label={`Tùy chọn cho vị trí ${positionName}`}
                                        className={cn(
                                          'inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                          isRowMenuOpen
                                            ? 'bg-muted text-foreground opacity-100'
                                            : 'opacity-0 group-hover/row:opacity-100',
                                        )}
                                      >
                                        <EllipsisHorizontalIcon
                                          className="size-4"
                                          aria-hidden="true"
                                        />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent
                                      align="start"
                                      className="w-48 p-1 shadow-md"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenPositionMenuKey(null);
                                          setRenamingPosition(positionName);
                                          setRenamePositionDraft(positionName);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
                                      >
                                        <PencilSquareIcon
                                          className="size-4 text-muted-foreground"
                                          aria-hidden="true"
                                        />
                                        <span>Đổi tên vị trí</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          requestRemovePosition(positionName)
                                        }
                                        className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/10"
                                      >
                                        <TrashIcon
                                          className="size-4"
                                          aria-hidden="true"
                                        />
                                        <span>Xóa vị trí</span>
                                      </button>
                                    </PopoverContent>
                                  </Popover>

                                  <span className="text-foreground">
                                    {positionName}
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* Column 2: Personnel Chips + [+ Thêm] Popover (synchronized 1:1 with RosterInsitePage) */}
                            <td className="align-middle">
                              <RosterAssignmentCell
                                rowKey={`onsite-${positionName}`}
                                targetLabel={positionName}
                                assignments={posAssignments}
                                activePersonnel={activePersonnel}
                                personnelMap={personnelMap}
                                sameDayAssignmentsByPerson={
                                  sameDayAssignmentsByPerson
                                }
                                getConflictLocationLabel={
                                  getConflictLocationLabel
                                }
                                isOpen={isPopoverOpenForPosition}
                                onOpenChange={(nextOpen) =>
                                  setPopoverPositionName(
                                    nextOpen ? positionName : null,
                                  )
                                }
                                isMutating={isMutating}
                                defaultAllowance={Number(
                                  selectedCampaign?.default_allowance ?? 0,
                                )}
                                expandExtraOnAllowance={false}
                                deleteChipTitle="Xóa khỏi vị trí"
                                updateButtonLabel="Cập nhật"
                                formatChipTooltip={(item, person) => {
                                  const hasAllowance =
                                    Number(item.allowance_cost) > 0;
                                  return [
                                    `${person?.full_name || 'Nhân sự'} (${person?.personnel_code || '—'})`,
                                    `Ca: ${SHIFT_SHORT_LABELS[item.shift_period]}`,
                                    hasAllowance
                                      ? `Chi phí: Cố định ${formatVndCurrency(item.base_cost_snapshot)} + Phụ cấp ${formatVndCurrency(item.allowance_cost)} = ${formatVndCurrency(Number(item.base_cost_snapshot) + Number(item.allowance_cost))}`
                                      : `Chi phí: ${formatVndCurrency(item.base_cost_snapshot)}`,
                                    item.note ? `Ghi chú: ${item.note}` : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' · ');
                                }}
                                onSaveAssignment={(draft) =>
                                  handleSubmitPositionAssignment(
                                    positionName,
                                    draft,
                                  )
                                }
                                onDeleteAssignment={handleDeleteAssignment}
                              />
                            </td>

                            {/* Column 3: Position Total Cost */}
                            <td className="is-right dym-roster-tabular align-middle font-semibold">
                              <span
                                className={cn(
                                  posCost === 0
                                    ? 'font-normal text-muted-foreground'
                                    : 'text-foreground',
                                )}
                              >
                                {formatVndCurrency(posCost)}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}

                    {/* Bottom Dashed Row: + Thêm vị trí cho đoàn này */}
                    <tr className="border-t border-dashed border-border/80">
                      <td colSpan={3} className="py-2.5">
                        {isAddingPosition ? (
                          <div className="flex flex-col gap-2">
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                void handleAddPosition();
                              }}
                              className="flex flex-wrap items-center gap-2"
                            >
                              <Input
                                type="text"
                                value={newPositionName}
                                onChange={(e) =>
                                  setNewPositionName(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    setIsAddingPosition(false);
                                    setNewPositionName('');
                                  }
                                }}
                                placeholder="Tên vị trí"
                                autoFocus
                                className="h-8 w-64 text-[13px]"
                              />
                              <Button
                                type="submit"
                                size="sm"
                                disabled={isMutating || !newPositionName.trim()}
                                className="h-8 px-3 text-xs font-medium"
                              >
                                Thêm (Enter)
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setIsAddingPosition(false);
                                  setNewPositionName('');
                                }}
                                className="h-8 px-2.5 text-xs text-muted-foreground"
                              >
                                Hủy
                              </Button>
                            </form>

                            {remainingTemplateSuggestions.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[11px] font-medium text-muted-foreground">
                                  Chọn nhanh vị trí mẫu:
                                </span>
                                {remainingTemplateSuggestions.map((sug) => (
                                  <button
                                    key={sug}
                                    type="button"
                                    onClick={() => void handleAddPosition(sug)}
                                    className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                                  >
                                    <PlusIcon
                                      className="size-3 text-muted-foreground"
                                      aria-hidden="true"
                                    />
                                    <span>{sug}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setIsAddingPosition(true);
                                setNewPositionName('');
                              }}
                              className="inline-flex h-9 flex-1 items-center gap-1.5 rounded-md border border-dashed border-border px-3 pl-7 text-left text-[13px] font-medium text-muted-foreground transition-[border-color,background-color,color,transform] duration-150 ease-out-quint hover:border-ring/60 hover:bg-card hover:text-foreground active:scale-[0.99]"
                            >
                              <PlusIcon
                                className="size-4 shrink-0"
                                aria-hidden="true"
                              />
                              <span>Thêm vị trí</span>
                            </button>

                            {remainingTemplateSuggestions.length > 0 &&
                              effectivePositions.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleApplyTemplatePositions()
                                  }
                                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
                                >
                                  <span>
                                    + Bổ sung {remainingTemplateSuggestions.length}{' '}
                                    vị trí mẫu còn thiếu
                                  </span>
                                </button>
                              )}
                          </div>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Create / Edit / Clone Campaign Dialog (shadcn Dialog) */}
      <Dialog
        open={isCampaignModalOpen}
        onOpenChange={(open) => setIsCampaignModalOpen(open)}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {campaignModalMode === 'edit'
                ? 'Cập nhật thông tin đoàn khám'
                : campaignModalMode === 'clone'
                  ? 'Nhân bản đoàn khám'
                  : 'Tạo đoàn khám Onsite / Lấy máu mới'}
            </DialogTitle>
            <DialogDescription>
              {campaignModalMode === 'clone'
                ? `Sao chép thông tin từ đoàn "${cloneSourceCampaign?.company_name ?? ''}" sang ngày khám mới.`
                : 'Nhập thông tin đơn vị khám, ngày thực hiện và phụ cấp đi xa mặc định cho đoàn.'}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => void handleSaveCampaign(e)}
            className="flex flex-col gap-3.5"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="camp-code-input"
                  className="text-xs font-medium text-foreground"
                >
                  Mã đoàn khám (ID Đoàn)
                </label>
                <Input
                  id="camp-code-input"
                  type="text"
                  required
                  autoFocus
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  value={campaignForm.campaign_code}
                  onChange={(e) =>
                    setCampaignForm((prev) => ({
                      ...prev,
                      campaign_code: e.target.value.toUpperCase(),
                    }))
                  }
                  className="dym-roster-tabular h-9 text-[13px] font-medium"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="camp-type-select"
                  className="text-xs font-medium text-foreground"
                >
                  Loại đoàn ngoại viện
                </label>
                <Select
                  value={campaignForm.schedule_type}
                  onValueChange={(value) => {
                    const nextType = value as 'onsite_exam' | 'blood_draw';
                    setCampaignForm((prev) => ({
                      ...prev,
                      schedule_type: nextType,
                      position_list:
                        campaignModalMode === 'create'
                          ? [...CAMPAIGN_POSITION_TEMPLATES[nextType]]
                          : prev.position_list,
                    }));
                  }}
                >
                  <SelectTrigger
                    id="camp-type-select"
                    className="h-9 text-[13px]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="onsite_exam" className="text-[13px]">
                        Đoàn khám ngoại viện (Onsite)
                      </SelectItem>
                      <SelectItem value="blood_draw" className="text-[13px]">
                        Đoàn lấy máu ngoại viện
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="camp-branch-select"
                  className="text-xs font-medium text-foreground"
                >
                  Cơ sở điều phối
                </label>
                <Select
                  value={campaignForm.branch_code}
                  onValueChange={(value) =>
                    setCampaignForm((prev) => ({
                      ...prev,
                      branch_code: value as BranchCode,
                    }))
                  }
                >
                  <SelectTrigger
                    id="camp-branch-select"
                    className="h-9 text-[13px]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="q1" className="text-[13px]">
                        D1 — Quận 1
                      </SelectItem>
                      <SelectItem value="q7" className="text-[13px]">
                        D7 — Quận 7
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-foreground">
                  Ngày khám
                </span>
                <DatePicker
                  value={campaignForm.schedule_date}
                  onChange={(nextDate) =>
                    setCampaignForm((prev) => ({
                      ...prev,
                      schedule_date: nextDate,
                    }))
                  }
                  ariaLabel="Chọn ngày khám"
                  className="h-9 w-full justify-start text-[13px]"
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label
                  htmlFor="camp-company-input"
                  className="text-xs font-medium text-foreground"
                >
                  Tên công ty / Đơn vị khám
                </label>
                <Input
                  id="camp-company-input"
                  type="text"
                  required
                  value={campaignForm.company_name}
                  onChange={(e) =>
                    setCampaignForm((prev) => ({
                      ...prev,
                      company_name: e.target.value,
                    }))
                  }
                  className="h-9 text-[13px]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="camp-contact-input"
                  className="text-xs font-medium text-foreground"
                >
                  Người phụ trách đoàn
                </label>
                <Input
                  id="camp-contact-input"
                  type="text"
                  value={campaignForm.contact_person}
                  onChange={(e) =>
                    setCampaignForm((prev) => ({
                      ...prev,
                      contact_person: e.target.value,
                    }))
                  }
                  className="h-9 text-[13px]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="camp-allowance-input"
                  className="text-xs font-medium text-foreground"
                >
                  Phụ cấp mỗi người (VNĐ)
                </label>
                <Input
                  id="camp-allowance-input"
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={formatCurrencyInput(
                    campaignForm.default_allowance ?? 0,
                  )}
                  onChange={(e) =>
                    setCampaignForm((prev) => ({
                      ...prev,
                      default_allowance: parseCurrencyInput(e.target.value),
                    }))
                  }
                  className="dym-roster-tabular h-9 text-right text-[13px] font-medium"
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label
                  htmlFor="camp-address-input"
                  className="text-xs font-medium text-foreground"
                >
                  Địa chỉ thực hiện khám
                </label>
                <Input
                  id="camp-address-input"
                  type="text"
                  value={campaignForm.company_address}
                  onChange={(e) =>
                    setCampaignForm((prev) => ({
                      ...prev,
                      company_address: e.target.value,
                    }))
                  }
                  className="h-9 text-[13px]"
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label
                  htmlFor="camp-notes-input"
                  className="text-xs font-medium text-foreground"
                >
                  Ghi chú điều phối
                </label>
                <Input
                  id="camp-notes-input"
                  type="text"
                  value={campaignForm.notes}
                  onChange={(e) =>
                    setCampaignForm((prev) => ({
                      ...prev,
                      notes: e.target.value,
                    }))
                  }
                  className="h-9 text-[13px]"
                />
              </div>
            </div>

            {/* Template initialization toggle on Create */}
            {campaignModalMode === 'create' && (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/25 p-3">
                <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={startFromTemplate}
                    onChange={(e) => setStartFromTemplate(e.target.checked)}
                    className="size-4 rounded border-border accent-primary"
                  />
                  <span>
                    Bắt đầu từ danh sách vị trí mẫu (
                    {
                      CAMPAIGN_POSITION_TEMPLATES[
                        campaignForm.schedule_type === 'blood_draw'
                          ? 'blood_draw'
                          : 'onsite_exam'
                      ].length
                    }{' '}
                    vị trí)
                  </span>
                </label>
                {startFromTemplate && (
                  <div className="flex flex-wrap gap-1 pl-6">
                    {CAMPAIGN_POSITION_TEMPLATES[
                      campaignForm.schedule_type === 'blood_draw'
                        ? 'blood_draw'
                        : 'onsite_exam'
                    ].map((pos) => (
                      <span
                        key={pos}
                        className="rounded border border-border/80 bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                      >
                        {pos}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Copy personnel option on Clone */}
            {campaignModalMode === 'clone' && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/25 p-3">
                <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={copyAssignmentsOnClone}
                    onChange={(e) =>
                      setCopyAssignmentsOnClone(e.target.checked)
                    }
                    className="size-4 rounded border-border accent-primary"
                  />
                  <span>
                    Sao chép luôn danh sách vị trí và nhân sự từ đoàn gốc
                  </span>
                </label>
              </div>
            )}

            <DialogFooter className="pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCampaignModalOpen(false)}
                className="h-9 px-4 text-xs font-medium"
              >
                Hủy
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isMutating}
                className="h-9 px-4 text-xs font-medium"
              >
                {isMutating
                  ? 'Đang lưu...'
                  : campaignModalMode === 'clone'
                    ? 'Tạo đoàn nhân bản'
                    : 'Lưu thông tin đoàn'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Campaign Confirmation Dialog */}
      <Dialog
        open={Boolean(campaignPendingDelete)}
        onOpenChange={(open) => {
          if (!open) setCampaignPendingDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận xóa đoàn khám</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa đoàn khám{' '}
              <strong className="text-foreground">
                {campaignPendingDelete?.company_name}
              </strong>{' '}
              ({campaignPendingDelete?.campaign_code}) ngày{' '}
              <strong className="dym-roster-tabular text-foreground">
                {campaignPendingDelete
                  ? formatDisplayDate(campaignPendingDelete.schedule_date)
                  : ''}
              </strong>
              ? Toàn bộ{' '}
              <strong className="dym-roster-tabular text-foreground">
                {selectedCampaignAssignments.length} ca nhân sự
              </strong>{' '}
              đã xếp trong đoàn sẽ bị xóa.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCampaignPendingDelete(null)}
              className="h-9 px-3 text-xs font-medium"
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isMutating}
              onClick={() => void handleConfirmDeleteCampaign()}
              className="h-9 px-3 text-xs font-medium"
            >
              Xác nhận xóa đoàn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Position with Assigned Personnel Confirmation Dialog */}
      <Dialog
        open={Boolean(pendingPositionRemoval)}
        onOpenChange={(open) => {
          if (!open) setPendingPositionRemoval(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xóa vị trí khỏi đoàn khám</DialogTitle>
            <DialogDescription>
              Vị trí{' '}
              <strong className="text-foreground">
                {pendingPositionRemoval?.positionName}
              </strong>{' '}
              đang có{' '}
              <strong className="dym-roster-tabular text-foreground">
                {pendingPositionRemoval?.assignedCount} nhân sự
              </strong>{' '}
              (tổng chi phí{' '}
              <strong className="dym-roster-tabular text-foreground">
                {formatVndCurrency(pendingPositionRemoval?.assignedCost ?? 0)}
              </strong>
              ). Khi xóa vị trí này, các phân công thuộc vị trí cũng sẽ bị xóa.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPendingPositionRemoval(null)}
              className="h-9 px-3 text-xs font-medium"
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isMutating}
              onClick={() => {
                if (pendingPositionRemoval) {
                  void executeRemovePosition(
                    pendingPositionRemoval.positionName,
                  );
                }
              }}
              className="h-9 px-3 text-xs font-medium"
            >
              Xóa vị trí và ca trực
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RosterShell>
  );
}

export default RosterOnsitePage;
