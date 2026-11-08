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
import {
  Search,
  X,
  Eye,
  EyeOff,
  GripVertical,
  ArrowDownAZ,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { BranchCode } from '../../../../types/domain';
import { formatDisplayDate } from '../../utils/adminFormatters';
import { exportScheduleCostExcel } from '../shared/exportRosterExcel';
import {
  RosterAssignmentCell,
  type RosterAssignmentDraft,
} from '../shared/RosterAssignmentCell';
import {
  CAMPAIGN_POSITION_TEMPLATES,
  formatCurrencyInput,
  formatVndCurrency,
  getProvisionalCost,
  getCountedProvisionalCost,
  isRosterDateLocked,
  parseCurrencyInput,
  ROSTER_BRANCH_LABELS,
  SHIFT_SHORT_LABELS,
  shiftIsoDate,
  summarizeAssignmentCosts,
  SCHEDULE_TYPE_LABELS,
  type OnsiteScheduleInput,
  type RosterAssignment,
  type RosterSchedule,
} from '../data/rosterService';
import { RosterShell } from '../shared/RosterShell';
import { useRosterData } from '../data/useRosterData';
import { groupCampaignsByCategory } from './campaignGroups';
import { orderCampaignPositions } from './campaignPositionOrder';
import { useCampaignPositionDrag } from '../shared/useCampaignPositionDrag';
import './onsite.css';
import '../shared/campaignColors.css';
import '../shared/positionDrag.css';
import {
  fetchCampaignTemplates,
  validatePositionList,
  type CampaignTemplates,
} from './campaignTemplates';
import { CampaignPositionsEditor } from './CampaignPositionsEditor';
import { CampaignTemplateDialog } from './CampaignTemplateDialog';
import { RosterOnsiteWeek } from './RosterOnsiteWeek';
import { buildMultiDayCampaigns } from './onsiteCalendar';
import { MultiDatePicker } from '@/components/ui/multi-date-picker';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SetupTargetPicker } from './SetupTargetPicker';
import { CampaignSetupRelations } from './CampaignSetupRelations';
import { setupCaption } from './setupLinks';
import { RosterProvisionalCost } from '../shared/RosterProvisionalCost';
import { getTodayInVietnam } from '../../../../lib/date';
import { useRosterDeepLink } from '../shared/useRosterDeepLink';

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
    canEditHistory,
    rosterToday,
    selectedBranch,
    setSelectedBranch,
    selectedDate,
    setSelectedDate,
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
    clearBanners,
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
  } = useRosterData();

  const [showCosts, setShowCosts] = useState(false);
  const [typeFilter, setTypeFilter] = useState<
    'all' | 'onsite_exam' | 'blood_draw' | 'setup'
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
    sales_person: '',
    departure_address: '',
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

  const [campaignTemplates, setCampaignTemplates] = useState<CampaignTemplates>(
    CAMPAIGN_POSITION_TEMPLATES,
  );
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [view, setView] = useState<'week' | 'details'>('week');
  const [weekDate, setWeekDate] = useState(selectedDate);
  const [weekRefresh, setWeekRefresh] = useState(0);
  const [pendingCampaignId, setPendingCampaignId] = useState<string | null>(
    null,
  );
  const [campaignDates, setCampaignDates] = useState<string[]>([selectedDate]);
  const [campaignFormError, setCampaignFormError] = useState('');
  const [dailyCategory, setDailyCategory] = useState<'onsite' | 'blood_draw'>(
    'onsite',
  );
  const [createSetupTogether, setCreateSetupTogether] = useState(false);
  const [setupDates, setSetupDates] = useState<string[]>([]);
  const [setupPositions, setSetupPositions] = useState<string[]>([]);
  useRosterDeepLink('roster-onsite', (link) => {
    setSelectedDate(link.date);
    setSelectedMonth(link.date.slice(0, 7));
    setSelectedBranch(link.branch);
    setWeekDate(link.date);
    if (link.campaign) {
      setSearchQuery('');
      setTypeFilter('all');
      setPendingCampaignId(link.campaign);
      setSelectedCampaignId(link.campaign);
      setDailyCategory(link.type === 'blood_draw' ? 'blood_draw' : 'onsite');
      setView('details');
    }
  });
  useEffect(() => {
    let current = true;
    void fetchCampaignTemplates()
      .then((templates) => {
        if (current) setCampaignTemplates(templates);
      })
      .catch((cause) => {
        if (current)
          setErrorMessage(
            cause instanceof Error
              ? cause.message
              : 'Không tải được vị trí mẫu.',
          );
      });
    return () => {
      current = false;
    };
  }, [setErrorMessage]);

  const openTemplateDialog = async () => {
    try {
      setCampaignTemplates(await fetchCampaignTemplates());
      setIsTemplateDialogOpen(true);
    } catch (cause) {
      setErrorMessage(
        cause instanceof Error ? cause.message : 'Không tải được vị trí mẫu.',
      );
    }
  };

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
      if (c.schedule_date !== selectedDate || c.branch_code !== selectedBranch)
        return false;
      if (
        dailyCategory === 'blood_draw'
          ? c.schedule_type !== 'blood_draw'
          : c.schedule_type === 'blood_draw'
      )
        return false;
      if (!q) return true;
      const hay =
        `${c.campaign_code ?? ''} ${c.company_name} ${c.contact_person} ${c.company_address} ${c.sales_person ?? ''} ${c.departure_address ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [
    allOnsiteCampaigns,
    dailyCategory,
    searchQuery,
    selectedDate,
    selectedBranch,
  ]);

  const changeDay = (date: string) => {
    setPendingCampaignId(null);
    setSelectedCampaignId(null);
    setSelectedDate(date);
    setWeekDate(date);
  };

  useEffect(() => {
    if (pendingCampaignId) {
      if (
        filteredCampaigns.some((campaign) => campaign.id === pendingCampaignId)
      ) {
        setSelectedCampaignId(pendingCampaignId);
        setPendingCampaignId(null);
      }
      return;
    }
    if (
      filteredCampaigns.length > 0 &&
      (!selectedCampaignId ||
        !filteredCampaigns.some((c) => c.id === selectedCampaignId))
    ) {
      setSelectedCampaignId(filteredCampaigns[0].id);
    } else if (filteredCampaigns.length === 0) {
      setSelectedCampaignId(null);
    }
  }, [filteredCampaigns, selectedCampaignId, pendingCampaignId]);

  const selectedCampaign = useMemo(
    () =>
      filteredCampaigns.find(
        (c) => c.id === (pendingCampaignId ?? selectedCampaignId),
      ) ?? null,
    [filteredCampaigns, selectedCampaignId, pendingCampaignId],
  );

  const today = rosterToday || getTodayInVietnam();
  const historyLocked = Boolean(
    selectedCampaign &&
    isRosterDateLocked(selectedCampaign.schedule_date, today, canEditHistory),
  );
  const formHistoryLocked =
    isRosterDateLocked(campaignForm.schedule_date, today, canEditHistory) ||
    (campaignModalMode === 'edit' && historyLocked);

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
  const defaultPositions = useMemo<string[]>(() => {
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

    return orderCampaignPositions(
      result,
      selectedCampaign.position_order_mode ?? 'alphabetical',
    );
  }, [selectedCampaign, selectedCampaignAssignments]);

  const positionDrag = useCampaignPositionDrag({
    campaignId: selectedCampaign?.id,
    positions: defaultPositions,
    disabled: isMutating || historyLocked,
    onSave: (positions) =>
      updateCampaignPositions(selectedCampaign!.id, positions, 'manual'),
    onError: setErrorMessage,
  });
  const effectivePositions = positionDrag.positions;

  // Template suggestions that are not yet in effectivePositions
  const remainingTemplateSuggestions = useMemo<string[]>(() => {
    if (!selectedCampaign) return [];
    const templateType =
      selectedCampaign.schedule_type as OnsiteScheduleInput['schedule_type'];
    const existingSet = new Set(effectivePositions.map((p) => p.toLowerCase()));
    return campaignTemplates[templateType].filter(
      (item) => !existingSet.has(item.toLowerCase()),
    );
  }, [effectivePositions, selectedCampaign, campaignTemplates]);

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
    totalCost: campaignAssignedCost,
  } = useMemo(
    () => summarizeAssignmentCosts(selectedCampaignAssignments),
    [selectedCampaignAssignments],
  );

  const campaignProvisionalCost = getProvisionalCost(selectedCampaign);
  const campaignTotalCost =
    campaignAssignedCost + getCountedProvisionalCost(selectedCampaign, today);

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

  const openCampaign = (campaign: RosterSchedule) => {
    setSearchQuery('');
    setTypeFilter('all');
    setDailyCategory(
      campaign.schedule_type === 'blood_draw' ? 'blood_draw' : 'onsite',
    );
    setPendingCampaignId(campaign.id);
    setSelectedCampaignId(campaign.id);
    if (campaign.branch_code === 'q1' || campaign.branch_code === 'q7')
      setSelectedBranch(campaign.branch_code);
    setSelectedDate(campaign.schedule_date);
    setSelectedMonth(campaign.schedule_date.slice(0, 7));
    setWeekDate(campaign.schedule_date);
    setView('details');
  };

  const openCreateCampaignModal = async (date = selectedDate) => {
    let templates: CampaignTemplates;
    try {
      templates = await fetchCampaignTemplates();
      setCampaignTemplates(templates);
    } catch (cause) {
      setErrorMessage(
        cause instanceof Error ? cause.message : 'Không tải được vị trí mẫu.',
      );
      return;
    }
    setCampaignModalMode('create');
    setCampaignFormError('');
    setCampaignDates([date]);
    setCreateSetupTogether(false);
    setSetupDates([]);
    setSetupPositions([...templates.setup]);
    setCloneSourceCampaign(null);
    setStartFromTemplate(true);
    const defaultType =
      view === 'week' && typeFilter !== 'all'
        ? typeFilter
        : dailyCategory === 'blood_draw'
          ? 'blood_draw'
          : 'onsite_exam';
    setCampaignForm({
      id: null,
      schedule_type: defaultType,
      branch_code: selectedBranch,
      schedule_date: date,
      campaign_code: buildNextCampaignCode(date),
      company_name: '',
      contact_person: '',
      company_address: '',
      sales_person: '',
      departure_address: '',
      notes: '',
      default_allowance: 0,
      position_list: [...templates[defaultType]],
    });
    setIsCampaignModalOpen(true);
  };

  const openEditCampaignModal = (campaign: RosterSchedule) => {
    setCampaignFormError('');
    setCampaignModalMode('edit');
    setCloneSourceCampaign(null);
    setCampaignForm({
      id: campaign.id,
      schedule_type:
        campaign.schedule_type as OnsiteScheduleInput['schedule_type'],
      branch_code: campaign.branch_code,
      schedule_date: campaign.schedule_date,
      campaign_code: campaign.campaign_code ?? '',
      company_name: campaign.company_name,
      contact_person: campaign.contact_person,
      company_address: campaign.company_address,
      position_order_mode: campaign.position_order_mode ?? 'alphabetical',
      sales_person: campaign.sales_person ?? '',
      departure_address: campaign.departure_address ?? '',
      notes: campaign.notes,
      default_allowance: campaign.default_allowance ?? 0,
      position_list: campaign.position_list ?? [],
      setup_onsite_ids: campaign.setup_onsite_ids ?? [],
    });
    setIsCampaignModalOpen(true);
  };

  const openCloneCampaignModal = (campaign: RosterSchedule) => {
    setCampaignFormError('');
    setIsCampaignMenuOpen(false);
    setCampaignModalMode('clone');
    setCloneSourceCampaign(campaign);
    setCopyAssignmentsOnClone(true);
    setCampaignForm({
      id: null,
      schedule_type:
        campaign.schedule_type as OnsiteScheduleInput['schedule_type'],
      branch_code: campaign.branch_code,
      schedule_date: selectedDate,
      campaign_code: buildNextCampaignCode(selectedDate),
      company_name: campaign.company_name,
      contact_person: campaign.contact_person,
      company_address: campaign.company_address,
      position_order_mode: campaign.position_order_mode ?? 'alphabetical',
      sales_person: campaign.sales_person ?? '',
      departure_address: campaign.departure_address ?? '',
      notes: campaign.notes,
      default_allowance: campaign.default_allowance ?? 0,
      setup_onsite_ids: campaign.setup_onsite_ids ?? [],
      position_list:
        effectivePositions.length > 0
          ? [...effectivePositions]
          : [
              ...campaignTemplates[
                campaign.schedule_type as OnsiteScheduleInput['schedule_type']
              ],
            ],
    });
    setIsCampaignModalOpen(true);
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setCampaignFormError('');
    if (
      !campaignForm.campaign_code.trim() ||
      !campaignForm.company_name.trim()
    ) {
      setCampaignFormError('Vui lòng nhập Mã đoàn khám và Tên công ty.');
      return;
    }

    try {
      if (
        campaignForm.schedule_type === 'setup' &&
        !campaignForm.setup_onsite_ids?.length
      ) {
        const legacySetup =
          campaignModalMode === 'edit' &&
          selectedCampaign?.schedule_type === 'setup' &&
          !selectedCampaign.setup_onsite_ids?.length;
        if (!legacySetup)
          throw new Error(
            'Vui lòng chọn đoàn Onsite HC và ít nhất một ngày khám liên quan.',
          );
      }
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
            ? validatePositionList(campaignForm.position_list ?? [])
            : campaignForm.position_list,
      };

      if (campaignModalMode === 'create') {
        const inputs = buildMultiDayCampaigns(payload, campaignDates);
        const withSetup =
          createSetupTogether && payload.schedule_type === 'onsite_exam';
        const setupInputs = withSetup
          ? buildMultiDayCampaigns(
              {
                ...payload,
                schedule_type: 'setup',
                campaign_code: `${payload.campaign_code}-SETUP`,
                position_list: validatePositionList(setupPositions),
                default_allowance: 0,
              },
              setupDates,
            )
          : undefined;
        const created = withSetup
          ? await createCampaigns(inputs, setupInputs)
          : inputs.length === 1
            ? [await upsertCampaign(inputs[0])]
            : await createCampaigns(inputs);
        const first = [...created]
          .filter((item) => !withSetup || item.schedule_type === 'onsite_exam')
          .sort((a, b) => a.schedule_date.localeCompare(b.schedule_date))[0];
        openCampaign(first);
        setIsCampaignModalOpen(false);
        setWeekRefresh((value) => value + 1);
        showNotice(
          withSetup
            ? `Đã tạo ${inputs.length} lịch HC và ${setupInputs!.length} lịch set-up cho "${payload.company_name}".`
            : `Đã tạo ${created.length} lịch cho đoàn "${payload.company_name}".`,
        );
        return;
      }

      const saved = await upsertCampaign(payload);
      setSelectedCampaignId(saved.id);
      setIsCampaignModalOpen(false);
      showNotice(
        campaignForm.id
          ? `Đã cập nhật thông tin đoàn "${saved.company_name}".`
          : `Đã tạo đoàn khám "${saved.company_name}" (${saved.campaign_code}).`,
      );
    } catch (err) {
      setCampaignFormError(
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
      selectedCampaign.schedule_type as OnsiteScheduleInput['schedule_type'];
    const merged = Array.from(
      new Set([...effectivePositions, ...campaignTemplates[templateType]]),
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
      <div className="dym-onsite-page">
        <div className="dym-onsite-view-bar">
          <Tabs
            value={view}
            onValueChange={(value) => setView(value as 'week' | 'details')}
          >
            <TabsList aria-label="Cách xem đoàn khám">
              <TabsTrigger value="week">Lịch tuần</TabsTrigger>
              <TabsTrigger value="details">Danh sách & chi tiết</TabsTrigger>
            </TabsList>
          </Tabs>
          {view === 'week' && (
            <div className="flex flex-wrap gap-2">
              {authorizedIsAdmin && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void openTemplateDialog()}
                >
                  Vị trí mẫu
                </Button>
              )}
              <Button
                type="button"
                onClick={() => void openCreateCampaignModal()}
              >
                <PlusIcon data-icon="inline-start" />
                Tạo đoàn
              </Button>
            </div>
          )}
        </div>
        {view === 'week' ? (
          <RosterOnsiteWeek
            date={weekDate}
            refreshKey={weekRefresh}
            type={typeFilter}
            onTypeChange={setTypeFilter}
            onDateChange={(date) => {
              setWeekDate(date);
              setSelectedDate(date);
            }}
            onOpenCampaign={openCampaign}
            onCreateCampaign={(date) => void openCreateCampaignModal(date)}
          />
        ) : (
          <>
            {/* Daily scope and search */}
            <div className="dym-roster-scope-bar">
              <div className="dym-roster-scope-left">
                <Tabs
                  value={selectedBranch}
                  onValueChange={(value) => {
                    setPendingCampaignId(null);
                    setSelectedCampaignId(null);
                    setSelectedBranch(value as 'q1' | 'q7');
                  }}
                >
                  <TabsList aria-label="Chọn cơ sở D1 hoặc D7">
                    <TabsTrigger value="q1">D1</TabsTrigger>
                    <TabsTrigger value="q7">D7</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Ngày hôm trước"
                    onClick={() => changeDay(shiftIsoDate(selectedDate, -1))}
                  >
                    <ChevronLeft />
                  </Button>
                  <DatePicker
                    value={selectedDate}
                    onChange={changeDay}
                    ariaLabel="Chọn ngày thực hiện đoàn"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Ngày tiếp theo"
                    onClick={() => changeDay(shiftIsoDate(selectedDate, 1))}
                  >
                    <ChevronRight />
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={selectedDate === today}
                  onClick={() => changeDay(today)}
                >
                  Hôm nay
                </Button>

                <Tabs
                  value={dailyCategory}
                  onValueChange={(value) => {
                    setPendingCampaignId(null);
                    setSelectedCampaignId(null);
                    setDailyCategory(value as 'onsite' | 'blood_draw');
                  }}
                >
                  <TabsList aria-label="Chọn nhóm đoàn">
                    <TabsTrigger value="onsite">Onsite</TabsTrigger>
                    <TabsTrigger value="blood_draw">Blood sampling</TabsTrigger>
                  </TabsList>
                </Tabs>
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
                      Đoàn ngày {formatDisplayDate(selectedDate)}
                    </h2>
                    <p className="dym-roster-panel-subtitle">
                      {filteredCampaigns.length} đoàn
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {authorizedIsAdmin && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void openTemplateDialog()}
                      >
                        Vị trí mẫu
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void openCreateCampaignModal()}
                      className="h-8 gap-1 px-2.5 text-[13px] font-medium shadow-sm"
                    >
                      <PlusIcon className="size-3.5" aria-hidden="true" />
                      <span>Tạo đoàn</span>
                    </Button>
                  </div>
                </header>

                {isLoading ? (
                  <div
                    className="dym-roster-campaign-list"
                    role="status"
                    aria-live="polite"
                    aria-busy="true"
                  >
                    <span className="sr-only">
                      Đang tải danh sách đoàn khám...
                    </span>
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
                ) : (
                  <div className="dym-roster-campaign-list">
                    {groupCampaignsByCategory(filteredCampaigns)
                      .filter((group) => group.type === dailyCategory)
                      .map((group) => (
                        <section
                          key={group.type}
                          className="flex flex-col gap-2 border-b border-border pb-3 last:border-0"
                        >
                          <h3 className="flex items-center justify-between px-1 text-sm font-semibold">
                            <span>{group.label}</span>
                            <span className="text-xs font-normal text-muted-foreground">
                              {group.items.length} đoàn
                            </span>
                          </h3>
                          <div className="flex flex-col gap-2">
                            {!group.items.length && (
                              <p className="px-1 py-2 text-sm text-muted-foreground">
                                {searchQuery
                                  ? 'Không có đoàn phù hợp.'
                                  : 'Chưa có đoàn trong ngày này.'}
                              </p>
                            )}
                            {group.items.map((camp) => {
                              const campAssigns = assignments.filter(
                                (a) => a.schedule_id === camp.id,
                              );
                              const campTotal = campAssigns.reduce(
                                (s, a) =>
                                  s +
                                  Number(a.base_cost_snapshot) +
                                  Number(a.allowance_cost),
                                getCountedProvisionalCost(camp, today),
                              );
                              const isSelected = camp.id === selectedCampaignId;
                              const branchLabel =
                                camp.branch_code === 'q7' ? 'D7' : 'D1';

                              return (
                                <button
                                  key={camp.id}
                                  type="button"
                                  data-type={camp.schedule_type}
                                  aria-pressed={isSelected}
                                  className={cn(
                                    'dym-roster-campaign-card',
                                    isSelected && 'is-selected',
                                  )}
                                  onClick={() => {
                                    setPendingCampaignId(null);
                                    setSelectedCampaignId(camp.id);
                                  }}
                                >
                                  <div className="dym-roster-campaign-card-top">
                                    <div className="flex items-center gap-1.5">
                                      <span className="dym-campaign-type-label">
                                        {
                                          SCHEDULE_TYPE_LABELS[
                                            camp.schedule_type
                                          ]
                                        }
                                      </span>
                                      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold leading-none text-muted-foreground">
                                        {branchLabel}
                                      </span>
                                    </div>
                                    <span className="dym-roster-tabular text-xs font-semibold">
                                      {formatDisplayDate(camp.schedule_date)}
                                    </span>
                                  </div>

                                  <div className="dym-roster-campaign-company">
                                    {camp.company_name}
                                  </div>
                                  {camp.schedule_type === 'setup' && (
                                    <p className="dym-campaign-reference text-xs">
                                      {setupCaption(camp)}
                                    </p>
                                  )}

                                  <div className="dym-roster-campaign-meta">
                                    <span className="dym-roster-tabular">
                                      {camp.campaign_code} ·{' '}
                                      {campAssigns.length} người
                                    </span>
                                    {showCosts && (
                                      <strong className="dym-roster-tabular text-[13px]">
                                        {formatVndCurrency(campTotal)}
                                      </strong>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      ))}
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
                    <span className="sr-only">
                      Đang tải thông tin đoàn khám...
                    </span>
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
                      onClick={() => void openCreateCampaignModal()}
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
                            className="dym-campaign-type-badge"
                            data-type={selectedCampaign.schedule_type}
                          >
                            {
                              SCHEDULE_TYPE_LABELS[
                                selectedCampaign.schedule_type
                              ]
                            }
                          </span>
                          <span className="dym-roster-code-badge">
                            {selectedCampaign.campaign_code}
                          </span>
                          <h2 className="text-base font-semibold tracking-tight text-foreground">
                            {selectedCampaign.company_name}
                          </h2>
                        </div>

                        {/* Safe Action Bar */}
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-pressed={showCosts}
                            onClick={() => {
                              clearBanners();
                              setShowCosts((value) => !value);
                            }}
                          >
                            {showCosts ? (
                              <EyeOff data-icon="inline-start" />
                            ) : (
                              <Eye data-icon="inline-start" />
                            )}
                            {showCosts ? 'Ẩn chi phí' : 'Hiện chi phí'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={historyLocked}
                            onClick={() =>
                              openEditCampaignModal(selectedCampaign)
                            }
                            className="h-8 gap-1.5 bg-background px-2.5 text-[13px] font-medium shadow-xs"
                          >
                            <PencilSquareIcon
                              className="size-3.5"
                              aria-hidden="true"
                            />
                            <span>Sửa</span>
                          </Button>

                          {showCosts && (
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
                          )}

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
                                  disabled={historyLocked}
                                  onClick={() => {
                                    setIsCampaignMenuOpen(false);
                                    if (!historyLocked)
                                      setCampaignPendingDelete(
                                        selectedCampaign,
                                      );
                                  }}
                                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/10"
                                >
                                  <TrashIcon
                                    className="size-4"
                                    aria-hidden="true"
                                  />
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
                            Cơ sở ký hợp đồng
                          </span>
                          <span className="text-[13px] font-semibold text-foreground">
                            {ROSTER_BRANCH_LABELS[
                              selectedCampaign.branch_code as 'q1' | 'q7'
                            ] ?? selectedCampaign.branch_code.toUpperCase()}
                          </span>
                        </div>

                        <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            Sales phụ trách
                          </span>
                          <span className="break-words text-[13px] font-medium text-foreground">
                            {selectedCampaign.sales_person || '—'}
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            Địa chỉ xuất phát
                          </span>
                          <span className="break-words text-[13px] font-medium text-foreground">
                            {selectedCampaign.departure_address || '—'}
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

                    {(selectedCampaign.schedule_type === 'setup' ||
                      selectedCampaign.schedule_type === 'onsite_exam') && (
                      <CampaignSetupRelations
                        campaign={{
                          id: selectedCampaign.id,
                          schedule_type: selectedCampaign.schedule_type,
                          campaign_group_id: selectedCampaign.campaign_group_id,
                          setup_onsite_ids: selectedCampaign.setup_onsite_ids,
                        }}
                        onOpen={openCampaign}
                      />
                    )}
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
                            ({staffedPositionsCount}/{effectivePositions.length}{' '}
                            vị trí)
                          </span>
                        </div>

                        {showCosts && (
                          <>
                            <div
                              className="h-4 w-px bg-border"
                              aria-hidden="true"
                            />

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

                            <div className="flex items-baseline gap-1.5">
                              <span className="text-xs font-medium text-muted-foreground">
                                {selectedCampaign.schedule_date < today
                                  ? 'Dự phòng (không tính thực tế):'
                                  : 'Dự phòng còn thiếu:'}
                              </span>
                              <span className="dym-roster-tabular text-sm font-semibold text-foreground">
                                {formatVndCurrency(campaignProvisionalCost)}
                              </span>
                            </div>

                            <div className="flex items-baseline gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 shadow-2xs">
                              <span className="text-xs font-medium text-muted-foreground">
                                {selectedCampaign.schedule_date < today
                                  ? 'Chi phí thực tế:'
                                  : 'Tổng dự kiến:'}
                              </span>
                              <strong className="dym-roster-tabular text-sm font-bold text-foreground">
                                {formatVndCurrency(campaignTotalCost)}
                              </strong>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Per-person allowance input (entered once for the whole campaign) */}
                      {showCosts && (
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
                              disabled={historyLocked}
                              type="text"
                              inputMode="numeric"
                              placeholder="0"
                              value={formatCurrencyInput(allowanceDraft)}
                              onChange={(e) =>
                                setAllowanceDraft(
                                  parseCurrencyInput(e.target.value),
                                )
                              }
                              className="dym-roster-tabular h-8 w-28 bg-card text-right text-[13px] font-medium"
                            />
                            <Button
                              type="submit"
                              variant="outline"
                              size="sm"
                              disabled={isMutating || historyLocked}
                              className="h-8 bg-card px-2.5 text-xs font-medium"
                            >
                              Áp dụng
                            </Button>
                          </div>
                        </form>
                      )}
                    </div>

                    {historyLocked && (
                      <p
                        role="status"
                        className="border-b border-border bg-muted px-5 py-3 text-sm"
                      >
                        Lịch đã khóa. Tài khoản chưa được cấp quyền sửa lịch từ
                        hôm qua trở về trước.
                      </p>
                    )}
                    <fieldset
                      disabled={historyLocked}
                      className="min-w-0 border-0 p-0"
                    >
                      <div className="dym-onsite-position-heading">
                        <div>
                          <h3>Vị trí & phân công</h3>
                          <span>{effectivePositions.length} vị trí</span>
                        </div>
                        <span
                          id="campaign-position-order-help"
                          className="sr-only"
                        >
                          Giữ tay nắm để kéo vị trí rồi thả tại vị trí mới. Có
                          thể dùng phím mũi tên lên hoặc xuống, Escape để hủy.
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isMutating}
                          onClick={() => {
                            void updateCampaignPositions(
                              selectedCampaign.id,
                              orderCampaignPositions(effectivePositions),
                              'alphabetical',
                            ).catch(() =>
                              setErrorMessage('Không thể lưu thứ tự A–Z.'),
                            );
                          }}
                        >
                          <ArrowDownAZ data-icon="inline-start" /> Sắp xếp A–Z
                        </Button>
                      </div>

                      {/* 3. Position-Grouped 3-Column Table (Vị trí / Bàn khám | Nhân sự trực | Chi phí vị trí) */}
                      <div className="dym-roster-table-wrap">
                        <table className="dym-roster-table">
                          <thead>
                            <tr>
                              <th className="dym-position-handle-cell">
                                <span className="sr-only">Sắp xếp vị trí</span>
                              </th>
                              <th className="w-[260px]">Vị trí / Bàn khám</th>
                              <th>Nhân sự trực</th>
                              {showCosts && (
                                <th className="is-right w-[160px]">
                                  Chi phí vị trí
                                </th>
                              )}
                            </tr>
                          </thead>
                          <tbody ref={positionDrag.bodyRef}>
                            {effectivePositions.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={showCosts ? 4 : 3}
                                  className="py-6"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border px-4 py-3">
                                    <span className="text-[13px] text-muted-foreground">
                                      Đoàn khám này chưa có danh sách vị trí.
                                      Bạn có thể nạp nhanh các vị trí mẫu hoặc
                                      tự thêm từng vị trí bên dưới.
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
                                    data-position={positionName}
                                    data-dragging={
                                      positionDrag.drag?.source === positionName
                                    }
                                    style={
                                      positionDrag.drag?.source === positionName
                                        ? {
                                            transform: `translate3d(0, ${positionDrag.drag.offset}px, 0)`,
                                          }
                                        : undefined
                                    }
                                    className={cn(
                                      'dym-position-row group/row',
                                      posAssignments.length === 0 &&
                                        'bg-muted/10',
                                    )}
                                  >
                                    <td className="dym-position-handle-cell">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        disabled={
                                          isMutating ||
                                          historyLocked ||
                                          isRenamingThis
                                        }
                                        className="dym-position-drag-handle"
                                        aria-label={`Đổi thứ tự vị trí ${positionName}`}
                                        aria-describedby="campaign-position-order-help"
                                        {...positionDrag.handleProps(
                                          positionName,
                                        )}
                                      >
                                        <GripVertical />
                                      </Button>
                                    </td>
                                    <td className="align-middle font-semibold">
                                      {isRenamingThis ? (
                                        <form
                                          onSubmit={(e) => {
                                            e.preventDefault();
                                            void handleSaveRenamePosition(
                                              positionName,
                                            );
                                          }}
                                          className="flex items-center gap-1.5"
                                        >
                                          <Input
                                            type="text"
                                            value={renamePositionDraft}
                                            onChange={(e) =>
                                              setRenamePositionDraft(
                                                e.target.value,
                                              )
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
                                            onClick={() =>
                                              setRenamingPosition(null)
                                            }
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
                                                  setRenamingPosition(
                                                    positionName,
                                                  );
                                                  setRenamePositionDraft(
                                                    positionName,
                                                  );
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
                                                  requestRemovePosition(
                                                    positionName,
                                                  )
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
                                        readOnly={historyLocked}
                                        showCosts={showCosts}
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
                                          selectedCampaign?.default_allowance ??
                                            0,
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
                                            item.note
                                              ? `Ghi chú: ${item.note}`
                                              : '',
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
                                        onDeleteAssignment={
                                          handleDeleteAssignment
                                        }
                                      />
                                    </td>

                                    {/* Column 3: Position Total Cost */}
                                    {showCosts && (
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
                                    )}
                                  </tr>
                                );
                              })
                            )}

                            {/* Bottom Dashed Row: + Thêm vị trí cho đoàn này */}
                            <tr className="border-t border-dashed border-border/80">
                              <td
                                colSpan={showCosts ? 4 : 3}
                                className="py-2.5"
                              >
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
                                        disabled={
                                          isMutating || !newPositionName.trim()
                                        }
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

                                    {remainingTemplateSuggestions.length >
                                      0 && (
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-[11px] font-medium text-muted-foreground">
                                          Chọn nhanh vị trí mẫu:
                                        </span>
                                        {remainingTemplateSuggestions.map(
                                          (sug) => (
                                            <button
                                              key={sug}
                                              type="button"
                                              onClick={() =>
                                                void handleAddPosition(sug)
                                              }
                                              className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                                            >
                                              <PlusIcon
                                                className="size-3 text-muted-foreground"
                                                aria-hidden="true"
                                              />
                                              <span>{sug}</span>
                                            </button>
                                          ),
                                        )}
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
                                            + Bổ sung{' '}
                                            {
                                              remainingTemplateSuggestions.length
                                            }{' '}
                                            vị trí mẫu còn thiếu
                                          </span>
                                        </button>
                                      )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          </tbody>
                          {showCosts && (
                            <tfoot>
                              <tr>
                                <td colSpan={4}>
                                  <RosterProvisionalCost
                                    key={`${selectedCampaign.id}-${campaignProvisionalCost}`}
                                    scheduleId={selectedCampaign.id}
                                    branch={
                                      selectedCampaign.branch_code as
                                        'q1' | 'q7'
                                    }
                                    date={selectedCampaign.schedule_date}
                                    amount={campaignProvisionalCost}
                                    readOnly={historyLocked}
                                    historical={
                                      selectedCampaign.schedule_date < today
                                    }
                                    disabled={
                                      isLoading || isMutating || historyLocked
                                    }
                                    onSaved={() => reloadAll(false)}
                                  />
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </fieldset>
                  </>
                )}
              </section>
            </div>

            {/* Create / Edit / Clone Campaign Dialog (shadcn Dialog) */}
          </>
        )}
        {isTemplateDialogOpen && authorizedIsAdmin && (
          <CampaignTemplateDialog
            templates={campaignTemplates}
            onClose={() => setIsTemplateDialogOpen(false)}
            onSaved={(type, positions) => {
              if (
                isCampaignModalOpen &&
                campaignModalMode === 'create' &&
                startFromTemplate &&
                campaignForm.schedule_type === type
              ) {
                const extra = (campaignForm.position_list ?? []).filter(
                  (position) => !campaignTemplates[type].includes(position),
                );
                setCampaignForm((previous) => ({
                  ...previous,
                  position_list: [...new Set([...positions, ...extra])],
                }));
              }
              setCampaignTemplates((previous) => ({
                ...previous,
                [type]: positions,
              }));
            }}
          />
        )}
        <Dialog
          open={isCampaignModalOpen}
          onOpenChange={(open) => setIsCampaignModalOpen(open)}
        >
          <DialogContent className="dym-campaign-form-dialog sm:max-w-xl">
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
                    className="dym-roster-tabular h-9"
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
                      const nextType = value as
                        'onsite_exam' | 'blood_draw' | 'setup';
                      setCampaignForm((prev) => ({
                        ...prev,
                        schedule_type: nextType,
                        setup_onsite_ids: [],
                        position_list:
                          campaignModalMode === 'create'
                            ? startFromTemplate
                              ? [...campaignTemplates[nextType]]
                              : []
                            : prev.position_list,
                      }));
                    }}
                  >
                    <SelectTrigger id="camp-type-select" className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dym-campaign-select">
                      <SelectGroup>
                        <SelectItem value="blood_draw">
                          Blood sampling
                        </SelectItem>
                        <SelectItem value="onsite_exam">Onsite HC</SelectItem>
                        <SelectItem value="setup">
                          Onsite set-up (bổ sung)
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
                    Cơ sở ký hợp đồng
                  </label>
                  <Select
                    value={campaignForm.branch_code}
                    onValueChange={(value) =>
                      setCampaignForm((prev) => ({
                        ...prev,
                        branch_code: value as BranchCode,
                        setup_onsite_ids: [],
                      }))
                    }
                  >
                    <SelectTrigger id="camp-branch-select" className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dym-campaign-select">
                      <SelectGroup>
                        <SelectItem value="q1">D1 — Quận 1</SelectItem>
                        <SelectItem value="q7">D7 — Quận 7</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-foreground">
                    {campaignForm.schedule_type === 'setup'
                      ? 'Ngày set-up'
                      : 'Ngày khám'}
                  </span>
                  {campaignModalMode === 'create' ? (
                    <MultiDatePicker
                      value={campaignDates}
                      label={
                        campaignForm.schedule_type === 'setup'
                          ? 'ngày set-up'
                          : 'ngày khám'
                      }
                      onChange={(dates) => {
                        setCampaignDates(dates);
                        if (dates.length)
                          setCampaignForm((previous) => ({
                            ...previous,
                            schedule_date: dates[0],
                          }));
                      }}
                    />
                  ) : (
                    <DatePicker
                      value={campaignForm.schedule_date}
                      onChange={(nextDate) =>
                        setCampaignForm((prev) => ({
                          ...prev,
                          schedule_date: nextDate,
                        }))
                      }
                      ariaLabel={
                        campaignForm.schedule_type === 'setup'
                          ? 'Chọn ngày set-up'
                          : 'Chọn ngày khám'
                      }
                      className="h-9 w-full justify-start"
                    />
                  )}
                  {campaignModalMode === 'create' && (
                    <p className="text-xs text-muted-foreground">
                      Chọn một hoặc nhiều ngày. Mỗi ngày có lịch phân công
                      riêng.
                    </p>
                  )}
                  {formHistoryLocked && (
                    <p className="text-xs text-destructive">
                      Ngày đã qua cần quyền sửa lịch cũ.
                    </p>
                  )}
                </div>

                {campaignForm.schedule_type === 'setup' && (
                  <SetupTargetPicker
                    branch={campaignForm.branch_code}
                    ids={campaignForm.setup_onsite_ids ?? []}
                    onChange={(targets) =>
                      setCampaignForm((previous) => ({
                        ...previous,
                        setup_onsite_ids: targets.map((item) => item.id),
                        ...(targets[0]
                          ? {
                              company_name: targets[0].company_name,
                              contact_person: targets[0].contact_person,
                              company_address: targets[0].company_address,
                              sales_person: targets[0].sales_person ?? '',
                            }
                          : {}),
                      }))
                    }
                  />
                )}
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
                    readOnly={
                      campaignForm.schedule_type === 'setup' &&
                      Boolean(campaignForm.setup_onsite_ids?.length)
                    }
                    value={campaignForm.company_name}
                    onChange={(e) =>
                      setCampaignForm((prev) => ({
                        ...prev,
                        company_name: e.target.value,
                      }))
                    }
                    className="h-9"
                  />
                </div>

                <div
                  className={cn(
                    'flex flex-col gap-1.5',
                    !showCosts && 'sm:col-span-2',
                  )}
                >
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
                    className="h-9"
                  />
                </div>

                {showCosts && (
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
                      className="dym-roster-tabular h-9 text-right"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label
                    htmlFor="camp-sales_person"
                    className="text-xs font-medium text-foreground"
                  >
                    Sales phụ trách
                  </label>
                  <Input
                    id="camp-sales_person"
                    type="text"
                    maxLength={255}
                    value={campaignForm.sales_person ?? ''}
                    onChange={(event) =>
                      setCampaignForm((previous) => ({
                        ...previous,
                        sales_person: event.target.value,
                      }))
                    }
                    className="h-9"
                  />
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label
                    htmlFor="camp-departure_address"
                    className="text-xs font-medium text-foreground"
                  >
                    Địa chỉ xuất phát
                  </label>
                  <Input
                    id="camp-departure_address"
                    type="text"
                    maxLength={1000}
                    value={campaignForm.departure_address ?? ''}
                    onChange={(event) =>
                      setCampaignForm((previous) => ({
                        ...previous,
                        departure_address: event.target.value,
                      }))
                    }
                    className="h-9"
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
                    className="h-9"
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
                    className="h-9"
                  />
                </div>
              </div>

              {/* Template initialization toggle on Create */}
              {campaignModalMode === 'create' && (
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/25 p-3">
                  <label className="flex cursor-pointer items-center gap-2 font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={startFromTemplate}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setStartFromTemplate(enabled);
                        const template =
                          campaignTemplates[campaignForm.schedule_type];
                        setCampaignForm((previous) => {
                          const extra = (previous.position_list ?? []).filter(
                            (position) => !template.includes(position),
                          );
                          return {
                            ...previous,
                            position_list: [
                              ...new Set([
                                ...(enabled ? template : []),
                                ...extra,
                              ]),
                            ],
                          };
                        });
                      }}
                      className="size-4 rounded border-border accent-primary"
                    />
                    <span>
                      Bắt đầu từ danh sách vị trí mẫu (
                      {campaignTemplates[campaignForm.schedule_type].length} vị
                      trí)
                    </span>
                  </label>
                  {authorizedIsAdmin && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="self-start"
                      onClick={() => void openTemplateDialog()}
                    >
                      Chỉnh mẫu chung
                    </Button>
                  )}
                  {(campaignForm.position_list ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1 pl-6">
                      {(campaignForm.position_list ?? []).map((pos, index) => (
                        <span
                          key={index}
                          className="rounded border border-border/80 bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                        >
                          {pos}
                        </span>
                      ))}
                    </div>
                  )}
                  <details className="flex flex-col gap-2">
                    <summary className="cursor-pointer select-none text-sm font-medium">
                      Thêm / sửa vị trí cho đoàn này
                    </summary>
                    <div className="pt-3">
                      <CampaignPositionsEditor
                        positions={campaignForm.position_list ?? []}
                        disabled={isMutating}
                        onChange={(positions) =>
                          setCampaignForm((previous) => ({
                            ...previous,
                            position_list: positions,
                          }))
                        }
                      />
                    </div>
                  </details>
                </div>
              )}

              {campaignModalMode === 'create' &&
                campaignForm.schedule_type === 'onsite_exam' && (
                  <section className="flex flex-col gap-3 rounded-lg border border-border p-3">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={createSetupTogether}
                        disabled={isMutating}
                        onChange={(event) =>
                          setCreateSetupTogether(event.target.checked)
                        }
                      />
                      <span>Tạo kèm lịch set-up</span>
                    </label>
                    {createSetupTogether && (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <span className="text-sm font-medium">
                            Ngày set-up
                          </span>
                          <MultiDatePicker
                            value={setupDates}
                            onChange={setSetupDates}
                            label="ngày set-up"
                          />
                          <p className="text-xs text-muted-foreground">
                            Tự liên kết với toàn bộ ngày HC đang tạo. Công ty và
                            thông tin liên hệ được dùng chung.
                          </p>
                          {setupDates.some((date) =>
                            isRosterDateLocked(date, today, canEditHistory),
                          ) && (
                            <p className="text-xs text-destructive">
                              Ngày set-up đã qua cần quyền sửa lịch cũ.
                            </p>
                          )}
                        </div>
                        <details>
                          <summary className="cursor-pointer select-none text-sm font-medium">
                            Vị trí set-up ({setupPositions.length})
                          </summary>
                          <div className="pt-3">
                            <CampaignPositionsEditor
                              positions={setupPositions}
                              onChange={setSetupPositions}
                              disabled={isMutating}
                            />
                          </div>
                        </details>
                      </>
                    )}
                  </section>
                )}
              {/* Copy personnel option on Clone */}
              {campaignModalMode === 'clone' && (
                <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/25 p-3">
                  <label className="flex cursor-pointer items-center gap-2 font-medium text-foreground">
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

              {campaignFormError && (
                <p role="alert" className="text-sm text-destructive">
                  {campaignFormError}
                </p>
              )}
              <DialogFooter className="pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCampaignModalOpen(false)}
                  className="h-9 px-4"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    isMutating ||
                    formHistoryLocked ||
                    (campaignModalMode === 'create' &&
                      (!campaignDates.length ||
                        (campaignForm.schedule_type === 'onsite_exam' &&
                          createSetupTogether &&
                          (!setupDates.length ||
                            setupDates.some((date) =>
                              isRosterDateLocked(date, today, canEditHistory),
                            )))))
                  }
                  className="h-9 px-4"
                >
                  {isMutating
                    ? 'Đang lưu...'
                    : campaignModalMode === 'clone'
                      ? 'Tạo đoàn nhân bản'
                      : campaignModalMode === 'create' &&
                          campaignForm.schedule_type === 'onsite_exam' &&
                          createSetupTogether
                        ? 'Tạo HC và set-up'
                        : campaignModalMode === 'create' &&
                            campaignDates.length > 1
                          ? `Tạo đoàn cho ${campaignDates.length} ngày`
                          : 'Lưu thông tin đoàn'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Campaign Confirmation Dialog */}
        <Dialog
          open={Boolean(campaignPendingDelete) && !historyLocked}
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
                disabled={isMutating || historyLocked}
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
                {showCosts && (
                  <>
                    (tổng chi phí{' '}
                    <strong className="dym-roster-tabular text-foreground">
                      {formatVndCurrency(
                        pendingPositionRemoval?.assignedCost ?? 0,
                      )}
                    </strong>
                    ).
                  </>
                )}{' '}
                Khi xóa vị trí này, các phân công thuộc vị trí cũng sẽ bị xóa.
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
                disabled={isMutating || historyLocked}
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
      </div>
    </RosterShell>
  );
}

export default RosterOnsitePage;
