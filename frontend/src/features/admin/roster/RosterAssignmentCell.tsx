import { useMemo, useState } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  doShiftsOverlap,
  formatCurrencyInput,
  formatNumberPlain,
  formatVndCurrency,
  parseCurrencyInput,
  ROLE_DOT_CLASS,
  ROLE_FILTER_OPTIONS,
  ROLE_SHORT_LABELS,
  SHIFT_OPTIONS,
  SHIFT_SHORT_LABELS,
  type MedicalPersonnel,
  type PersonnelRoleType,
  type RosterAssignment,
  type ShiftPeriod,
} from './rosterService';

export interface RosterAssignmentDraft {
  editingAssignmentId: string | null;
  personnelId: string;
  shiftPeriod: ShiftPeriod;
  baseCostSnapshot: number;
  allowanceCost: number;
  note: string;
  conflictAssignment: RosterAssignment | null;
}

interface RosterAssignmentCellProps {
  showCosts?: boolean;
  readOnly?: boolean;
  rowKey: string;
  targetLabel: string;
  assignments: RosterAssignment[];
  activePersonnel: MedicalPersonnel[];
  personnelMap: Map<string, MedicalPersonnel>;
  sameDayAssignmentsByPerson: Map<string, RosterAssignment[]>;
  getConflictLocationLabel: (assign: RosterAssignment) => string;
  isOpen: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  isMutating: boolean;
  defaultAllowance?: number;
  expandExtraOnAllowance?: boolean;
  autoSelectFirstAvailableOnSubmit?: boolean;
  deleteChipTitle?: string;
  updateButtonLabel?: string;
  formatChipTooltip?: (
    assign: RosterAssignment,
    person?: MedicalPersonnel,
  ) => string;
  onSaveAssignment: (draft: RosterAssignmentDraft) => Promise<boolean>;
  onDeleteAssignment: (assignmentId: string) => Promise<void> | void;
}

export function RosterAssignmentCell({
  showCosts = true,
  readOnly = false,
  rowKey,
  targetLabel,
  assignments,
  activePersonnel,
  personnelMap,
  sameDayAssignmentsByPerson,
  getConflictLocationLabel,
  isOpen,
  onOpenChange,
  isMutating,
  defaultAllowance = 0,
  expandExtraOnAllowance = true,
  autoSelectFirstAvailableOnSubmit = false,
  deleteChipTitle = 'Xóa khỏi phòng',
  updateButtonLabel = 'Cập nhật (Enter)',
  formatChipTooltip,
  onSaveAssignment,
  onDeleteAssignment,
}: RosterAssignmentCellProps) {
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(
    null,
  );
  const [personSearchQuery, setPersonSearchQuery] = useState('');
  const [personRoleFilter, setPersonRoleFilter] = useState<
    'all' | PersonnelRoleType
  >('all');
  const [assignPersonId, setAssignPersonId] = useState<string>('');
  const [assignShift, setAssignShift] = useState<ShiftPeriod>('FULL');
  const [assignBaseCost, setAssignBaseCost] = useState<number>(0);
  const [assignAllowance, setAssignAllowance] = useState<number>(0);
  const [assignNote, setAssignNote] = useState<string>('');
  const [isExtraExpanded, setIsExtraExpanded] = useState(false);

  const getOtherSameDayAssignments = (personId: string): RosterAssignment[] => {
    const list = sameDayAssignmentsByPerson.get(personId);
    if (!list || list.length === 0) return [];
    if (!editingAssignmentId) return list;
    return list.filter((item) => item.id !== editingAssignmentId);
  };

  const getPersonConflictForShift = (
    personId: string,
    targetShift: ShiftPeriod,
  ): RosterAssignment | null => {
    const personAssigns = getOtherSameDayAssignments(personId);
    if (personAssigns.length === 0) return null;
    return (
      personAssigns.find((existing) =>
        doShiftsOverlap(existing.shift_period, targetShift),
      ) ?? null
    );
  };

  const filteredPersonnel = useMemo(() => {
    const query = personSearchQuery.trim().toLowerCase();
    return activePersonnel.filter((person) => {
      const personAssigns = (
        sameDayAssignmentsByPerson.get(person.id) ?? []
      ).filter((item) => item.id !== editingAssignmentId);
      const hasConflict = personAssigns.some((existing) =>
        doShiftsOverlap(existing.shift_period, assignShift),
      );
      if (hasConflict) {
        return false;
      }
      if (
        personRoleFilter !== 'all' &&
        person.role_type !== personRoleFilter
      ) {
        return false;
      }
      if (!query) return true;
      const roleLabel = ROLE_SHORT_LABELS[person.role_type].toLowerCase();
      return (
        person.full_name.toLowerCase().includes(query) ||
        person.personnel_code.toLowerCase().includes(query) ||
        roleLabel.includes(query)
      );
    });
  }, [
    activePersonnel,
    assignShift,
    editingAssignmentId,
    personRoleFilter,
    personSearchQuery,
    sameDayAssignmentsByPerson,
  ]);

  const openAddPopover = () => {
    setEditingAssignmentId(null);
    setPersonSearchQuery('');
    setPersonRoleFilter('all');
    setAssignPersonId('');
    setAssignShift('FULL');
    setAssignBaseCost(0);
    setAssignAllowance(defaultAllowance);
    setAssignNote('');
    setIsExtraExpanded(false);
    onOpenChange(true);
  };

  const openEditPopover = (item: RosterAssignment) => {
    setEditingAssignmentId(item.id);
    setPersonSearchQuery('');
    setPersonRoleFilter('all');
    setAssignPersonId(item.personnel_id);
    setAssignShift(item.shift_period);
    setAssignBaseCost(item.base_cost_snapshot);
    setAssignAllowance(item.allowance_cost);
    setAssignNote(item.note || '');
    setIsExtraExpanded(
      (expandExtraOnAllowance && Number(item.allowance_cost) > 0) ||
        Boolean(item.note?.trim()),
    );
    onOpenChange(true);
  };

  const closePopover = () => {
    setEditingAssignmentId(null);
    onOpenChange(false);
  };

  const handleSelectPerson = (personId: string) => {
    const conflict = getPersonConflictForShift(personId, assignShift);
    if (conflict) return;
    setAssignPersonId(personId);
    const person = personnelMap.get(personId);
    if (person) {
      setAssignBaseCost(person.fixed_cost);
    }
  };

  const handleSelectShift = (nextShift: ShiftPeriod) => {
    setAssignShift(nextShift);
    if (assignPersonId) {
      const conflict = getPersonConflictForShift(assignPersonId, nextShift);
      if (conflict) {
        setAssignPersonId('');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let targetPersonId = assignPersonId;
    let targetBaseCost = assignBaseCost;

    if (!targetPersonId && autoSelectFirstAvailableOnSubmit) {
      const firstAvailable = filteredPersonnel.find(
        (p) => !getPersonConflictForShift(p.id, assignShift),
      );
      if (firstAvailable) {
        targetPersonId = firstAvailable.id;
        targetBaseCost = firstAvailable.fixed_cost;
        setAssignPersonId(firstAvailable.id);
        setAssignBaseCost(firstAvailable.fixed_cost);
      }
    }

    const conflictAssignment = targetPersonId
      ? getPersonConflictForShift(targetPersonId, assignShift)
      : null;

    const didClose = await onSaveAssignment({
      editingAssignmentId,
      personnelId: targetPersonId,
      shiftPeriod: assignShift,
      baseCostSnapshot: targetBaseCost,
      allowanceCost: assignAllowance,
      note: assignNote,
      conflictAssignment,
    });

    if (didClose) {
      closePopover();
    }
  };

  const handleDeleteClick = (assignmentId: string) => {
    if (editingAssignmentId === assignmentId) {
      closePopover();
    }
    void onDeleteAssignment(assignmentId);
  };

  const hasStaff = assignments.length > 0;
  const selectedPerson = assignPersonId
    ? personnelMap.get(assignPersonId)
    : undefined;

  const isSubmitDisabled =
    isMutating ||
    (!assignPersonId &&
      (!autoSelectFirstAvailableOnSubmit ||
        !filteredPersonnel.some(
          (p) => !getPersonConflictForShift(p.id, assignShift),
        )));

  if (readOnly) return <div className="flex flex-wrap items-center gap-2">
    {assignments.length ? assignments.map((assignment) => <span key={assignment.id} className="rounded-md border border-border px-2 py-1 text-sm">
      {personnelMap.get(assignment.personnel_id)?.full_name ?? 'Nhân sự'} · {SHIFT_SHORT_LABELS[assignment.shift_period]}
      {showCosts && <span className="ml-2 text-xs text-muted-foreground">{formatVndCurrency(Number(assignment.base_cost_snapshot) + Number(assignment.allowance_cost))}</span>}
    </span>) : <span className="text-sm text-muted-foreground">Chưa có người</span>}
  </div>;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!hasStaff ? (
        <span className="mr-1 text-[13px] text-muted-foreground">
          Chưa có người
        </span>
      ) : (
        assignments.map((assign) => {
          const person = personnelMap.get(assign.personnel_id);
          const isEditingThisChip =
            isOpen && editingAssignmentId === assign.id;
          const hasAllowance = Number(assign.allowance_cost) > 0;
          const chipTooltip = !showCosts ? `${person?.full_name ?? 'Nhân sự'} · ${SHIFT_SHORT_LABELS[assign.shift_period]}` : formatChipTooltip
            ? formatChipTooltip(assign, person)
            : `Cố định ${formatVndCurrency(assign.base_cost_snapshot)} + Phụ cấp ${formatVndCurrency(assign.allowance_cost)}${assign.note ? ` · Ghi chú: ${assign.note}` : ''}`;

          return (
            <div
              key={assign.id}
              className={cn(
                'group inline-flex h-8 items-center rounded-md border bg-card text-[13px] shadow-2xs transition-colors',
                isEditingThisChip
                  ? 'border-primary ring-2 ring-primary/20'
                  : 'border-border hover:border-ring/60',
              )}
            >
              <button
                type="button"
                onClick={() => openEditPopover(assign)}
                className="inline-flex h-full items-center gap-1.5 px-3 text-left transition-transform duration-150 ease-out-quint active:scale-[0.98]"
                title={chipTooltip}
              >
                {person && (
                  <span
                    className={cn(
                      'size-2 shrink-0 rounded-full',
                      ROLE_DOT_CLASS[person.role_type],
                    )}
                    aria-hidden="true"
                  />
                )}
                <span className="font-medium text-foreground">
                  {person?.full_name || 'Nhân sự'}
                </span>
                {person?.personnel_code && (
                  <span className="dym-roster-tabular text-xs text-muted-foreground">
                    {person.personnel_code}
                  </span>
                )}
                <span className="text-muted-foreground/60">·</span>
                <span className="font-medium text-muted-foreground">
                  {SHIFT_SHORT_LABELS[assign.shift_period]}
                </span>
                {showCosts && hasAllowance && (
                  <span
                    className="inline-flex size-4 items-center justify-center rounded-full bg-amber-500/15 text-xs font-bold leading-none text-amber-600 dark:text-amber-400"
                    aria-label={`Có phụ cấp ${formatVndCurrency(assign.allowance_cost)}`}
                  >
                    +
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteClick(assign.id);
                }}
                className="inline-flex h-full w-7 items-center justify-center overflow-hidden rounded-r-md text-muted-foreground opacity-0 transition-[opacity,transform,background-color,color] duration-150 ease-out-quint hover:bg-destructive/15 hover:text-destructive active:scale-95 group-focus-within:border-l group-focus-within:border-border group-focus-within:opacity-100 group-hover:border-l group-hover:border-border group-hover:opacity-100"
                title={deleteChipTitle}
                aria-label={`${deleteChipTitle} ${person?.full_name || ''}`.trim()}
              >
                <XMarkIcon className="size-4 shrink-0" />
              </button>
            </div>
          );
        })
      )}

      <Popover
        open={isOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            openAddPopover();
          } else {
            closePopover();
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              'h-8 gap-1 px-3 text-[13px] font-medium',
              !hasStaff
                ? 'border-dashed text-muted-foreground hover:border-solid hover:text-foreground'
                : 'bg-card',
            )}
          >
            <PlusIcon className="size-3.5" />
            <span>Thêm</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-80 p-4 sm:w-[23.5rem]"
        >
          <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-foreground">
                {editingAssignmentId
                  ? `Sửa ca trực — ${targetLabel}`
                  : `Thêm nhân sự — ${targetLabel}`}
              </span>
              {selectedPerson && (
                <Badge
                  variant="outline"
                  className="max-w-[10rem] truncate text-xs"
                >
                  {selectedPerson.full_name}
                </Badge>
              )}
            </div>

            {/* Searchable Personnel Combobox with Double-Booking Lock */}
            <div className="flex flex-col gap-2">
              <div className="relative">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  autoFocus
                  value={personSearchQuery}
                  onChange={(e) => setPersonSearchQuery(e.target.value)}
                  placeholder="Gõ tìm bác sĩ, nurse, CTV..."
                  className="h-9 pl-8 text-[13px]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {ROLE_FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPersonRoleFilter(opt.value)}
                    className={cn(
                      'rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors',
                      personRoleFilter === opt.value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-background p-1">
                {filteredPersonnel.length === 0 ? (
                  <div className="px-2 py-3 text-center text-[13px] text-muted-foreground">
                    Không tìm thấy nhân sự phù hợp.
                  </div>
                ) : (
                  filteredPersonnel.map((person) => {
                    const isSelected = assignPersonId === person.id;
                    const conflictAssign = getPersonConflictForShift(
                      person.id,
                      assignShift,
                    );
                    const isLocked = Boolean(conflictAssign);
                    const conflictRoomName = conflictAssign
                      ? getConflictLocationLabel(conflictAssign)
                      : '';

                    const otherAssign = !conflictAssign
                      ? getOtherSameDayAssignments(person.id)[0]
                      : undefined;
                    const otherRoomName = otherAssign
                      ? getConflictLocationLabel(otherAssign)
                      : '';

                    return (
                      <button
                        key={person.id}
                        type="button"
                        disabled={isLocked}
                        onClick={() => handleSelectPerson(person.id)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-left text-[13px] transition-colors',
                          isLocked
                            ? 'cursor-not-allowed opacity-55'
                            : isSelected
                              ? 'bg-accent text-accent-foreground'
                              : 'hover:bg-accent/60',
                        )}
                      >
                        <div className="flex min-w-0 flex-col leading-tight">
                          <span
                            className={cn(
                              'truncate font-medium',
                              isLocked
                                ? 'text-muted-foreground'
                                : 'text-foreground',
                            )}
                          >
                            {person.full_name}
                          </span>
                          <span className="dym-roster-tabular text-[11px] text-muted-foreground">
                            {person.personnel_code} ·{' '}
                            {ROLE_SHORT_LABELS[person.role_type]}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {isLocked && conflictAssign ? (
                            <Badge
                              variant="secondary"
                              className="h-5 px-1.5 text-[11px] font-medium text-muted-foreground"
                            >
                              Đã xếp {conflictRoomName} ·{' '}
                              {SHIFT_SHORT_LABELS[conflictAssign.shift_period]}
                            </Badge>
                          ) : (
                            <>
                              {otherAssign && (
                                <Badge
                                  variant="outline"
                                  className="h-5 px-1.5 text-[11px] font-normal text-muted-foreground"
                                >
                                  {otherRoomName} ·{' '}
                                  {SHIFT_SHORT_LABELS[otherAssign.shift_period]}
                                </Badge>
                              )}
{showCosts && (                              <span className="dym-roster-tabular text-[13px] font-medium text-muted-foreground">
                                {formatNumberPlain(person.fixed_cost)} ₫
                              </span>)}
                              {isSelected && (
                                <CheckIcon className="size-4 text-primary" />
                              )}
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Separate rows for Ca trực and Cost cố định */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Ca trực
              </span>
              <div className="grid grid-cols-3 gap-1 rounded-md border border-border bg-muted/50 p-1">
                {SHIFT_OPTIONS.map((shift) => {
                  const shiftConflict = assignPersonId
                    ? getPersonConflictForShift(assignPersonId, shift.value)
                    : null;
                  return (
                    <button
                      key={shift.value}
                      type="button"
                      onClick={() => handleSelectShift(shift.value)}
                      title={
                        shiftConflict
                          ? `Nhân sự đang chọn đã xếp ca ${SHIFT_SHORT_LABELS[shiftConflict.shift_period]}`
                          : undefined
                      }
                      className={cn(
                        'whitespace-nowrap rounded px-2.5 py-1 text-[13px] font-medium transition-colors',
                        assignShift === shift.value
                          ? 'bg-card text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {shift.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {showCosts && <div className="flex items-center justify-between gap-3">
              <label
                htmlFor={`base-cost-${rowKey}`}
                className="text-[13px] font-medium text-muted-foreground"
              >
                Cost cố định (VNĐ)
              </label>
              <Input
                id={`base-cost-${rowKey}`}
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={formatCurrencyInput(assignBaseCost)}
                onChange={(e) =>
                  setAssignBaseCost(parseCurrencyInput(e.target.value))
                }
                className="dym-roster-tabular h-8 w-40 text-right text-[13px]"
              />
            </div>}

            {/* Collapsible Allowance & Notes */}
            <div className="flex flex-col gap-2 border-t border-border pt-2">
              <button
                type="button"
                onClick={() => setIsExtraExpanded((prev) => !prev)}
                className="flex items-center justify-between text-left text-[13px] font-medium text-muted-foreground transition-colors duration-150 ease-out-quint hover:text-foreground"
              >
                <span>{showCosts ? 'Phụ cấp và ghi chú' : 'Ghi chú'}</span>
                <ChevronDownIcon
                  className={cn(
                    'size-4 transition-transform duration-150 ease-out-quint',
                    isExtraExpanded && 'rotate-180',
                  )}
                />
              </button>

              {isExtraExpanded && (
                <div className="dym-roster-collapsible-enter grid grid-cols-2 gap-2 pt-1">
                  {showCosts && <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`allowance-${rowKey}`}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Phụ cấp (VNĐ)
                    </label>
                    <Input
                      id={`allowance-${rowKey}`}
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={formatCurrencyInput(assignAllowance)}
                      onChange={(e) =>
                        setAssignAllowance(parseCurrencyInput(e.target.value))
                      }
                      className="dym-roster-tabular h-8 text-right text-[13px]"
                    />
                  </div>}

                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`note-${rowKey}`}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Ghi chú
                    </label>
                    <Input
                      id={`note-${rowKey}`}
                      type="text"
                      value={assignNote}
                      onChange={(e) => setAssignNote(e.target.value)}
                      className="h-8 text-[13px]"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-1.5 pt-1">
              {editingAssignmentId ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteClick(editingAssignmentId)}
                  className="h-8 px-2.5 text-[13px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  Xóa ca
                </Button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={closePopover}
                  className="h-8 px-3 text-[13px]"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitDisabled}
                  className="h-8 px-3.5 text-[13px] font-medium"
                >
                  {editingAssignmentId ? updateButtonLabel : 'Lưu (Enter)'}
                </Button>
              </div>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
