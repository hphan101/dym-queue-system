import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PermissionButton as Button } from '@/features/admin/shared/PermissionButton';
import { cn } from '@/lib/utils';
import {
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import {
  formatCurrencyInput,
  parseCurrencyInput,
  ROLE_SHORT_LABELS,
  type MedicalPersonnel,
  type MedicalPersonnelInput,
  type PersonnelRoleType
} from '../data/rosterService';
import { DOCTOR_SPECIALTIES } from './doctorSpecialties';
import './personnel.css';

interface PersonnelFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: MedicalPersonnelInput;
  onFormChange: Dispatch<SetStateAction<MedicalPersonnelInput>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onRoleChange: (role: PersonnelRoleType) => void;
  error: string | null;
  isSaving: boolean;
  duplicateCodePerson: MedicalPersonnel | null;
  duplicateNamePerson: MedicalPersonnel | null;
  duplicatePhonePerson: MedicalPersonnel | null;
}

export function PersonnelFormDialog({
  open: isModalOpen, onOpenChange: setIsModalOpen, form, onFormChange: setForm,
  onSubmit: handleSave, onRoleChange: handleRoleChangeInModal, error: formError,
  isSaving: isMutating, duplicateCodePerson, duplicateNamePerson, duplicatePhonePerson,
}: PersonnelFormDialogProps) {
  return (<Dialog open={isModalOpen} onOpenChange={(open) => { if (!isMutating) setIsModalOpen(open); }}>
    <DialogContent aria-describedby={undefined} className="personnel-form-dialog flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[680px] flex-col gap-0 overflow-hidden p-0">
      <DialogHeader className="personnel-form-header">
        <DialogTitle>
          {form.id
            ? 'Chỉnh sửa nhân sự' : 'Thêm nhân sự'}
        </DialogTitle>
      </DialogHeader>

      <form
        onSubmit={(e) => void handleSave(e)}
        className="personnel-form" aria-busy={isMutating}
      >
        <div className="personnel-form-body">
          {formError && (
            <Alert variant="destructive"><AlertDescription>
              {formError}
            </AlertDescription></Alert>
          )}

          <fieldset disabled={isMutating} className="min-w-0 border-0 p-0">
            <FieldGroup className="personnel-form-grid">
              <Field>
                <FieldLabel htmlFor="person-role-select">
                  Phân loại nhân sự
                </FieldLabel>
                <Select
                  value={form.role_type}
                  onValueChange={(val) =>
                    handleRoleChangeInModal(val as PersonnelRoleType)
                  }
                >
                  <SelectTrigger
                    id="person-role-select"

                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="doctor" >
                        Bác sĩ (BS-)
                      </SelectItem>
                      <SelectItem value="nurse" >
                        Điều dưỡng / Nurse (DD-)
                      </SelectItem>
                      <SelectItem value="technician" >
                        Kỹ thuật viên / Khác (KTV-)
                      </SelectItem>
                      <SelectItem value="ctv" >
                        Cộng tác viên (CTV-)
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field data-invalid={Boolean(duplicateCodePerson)}>
                <FieldLabel htmlFor="person-code-input">
                  Staff ID
                </FieldLabel>
                <Input
                  id="person-code-input"
                  type="text"
                  required
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-invalid={Boolean(duplicateCodePerson)}
                  value={form.personnel_code}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      personnel_code: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="VD: BS-001, DD-001, KTV-001"
                  className={cn(
                    'tabular-nums',
                    duplicateCodePerson &&
                    'border-destructive focus-visible:ring-destructive',
                  )}
                />
                {duplicateCodePerson && (
                  <span className="animate-fade-in text-[11px] font-medium text-destructive">
                    Trùng mã với {duplicateCodePerson.full_name} (
                    {ROLE_SHORT_LABELS[duplicateCodePerson.role_type]}).
                  </span>
                )}
              </Field>

              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="person-name-input">
                  Họ và tên nhân sự
                </FieldLabel>
                <Input
                  id="person-name-input"
                  type="text"
                  required
                  autoFocus
                  value={form.full_name}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      full_name: e.target.value,
                    }))
                  }
                  placeholder="VD: Nguyễn Văn An"

                />
                {duplicateNamePerson && (
                  <span className="animate-fade-in inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    <ExclamationTriangleIcon className="size-3.5 shrink-0" />
                    <span>
                      Tên này đang trùng với {duplicateNamePerson.full_name} (
                      {duplicateNamePerson.personnel_code} ·{' '}
                      {ROLE_SHORT_LABELS[duplicateNamePerson.role_type]}).
                    </span>
                  </span>
                )}
              </Field>

              {form.role_type === 'doctor' && (
                <FieldSet className="personnel-specialties sm:col-span-2">
                  <FieldLegend variant="label">
                    Chuyên môn bác sĩ
                  </FieldLegend>
                  <FieldGroup className="personnel-specialty-grid">
                    {DOCTOR_SPECIALTIES.map((option) => (
                      <Field orientation="horizontal" key={option.value} className="personnel-specialty">
                        <Checkbox
                          id={`person-specialty-${option.value}`}
                          checked={(form.specialties ?? []).includes(
                            option.value,
                          )}
                          onCheckedChange={(checked) =>
                            setForm((previous) => ({
                              ...previous,
                              specialties: checked === true
                                ? [
                                  ...(previous.specialties ?? []),
                                  option.value,
                                ]
                                : (previous.specialties ?? []).filter(
                                  (value) => value !== option.value,
                                ),
                            }))
                          }
                        />
                        <FieldLabel htmlFor={`person-specialty-${option.value}`}>{option.label}</FieldLabel>
                      </Field>
                    ))}
                  </FieldGroup>
                </FieldSet>
              )}

              <Field>
                <FieldLabel htmlFor="person-identity_number">
                  CCCD
                </FieldLabel>
                <Input
                  id="person-identity_number"
                  type="text"
                  maxLength={12}
                  value={form.identity_number ?? ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      identity_number: e.target.value,
                    }))
                  }
                  className="tabular-nums"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="person-practicing_certificate">
                  Số chứng chỉ hành nghề
                </FieldLabel>
                <Input
                  id="person-practicing_certificate"
                  type="text"
                  maxLength={100}
                  value={form.practicing_certificate ?? ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      practicing_certificate: e.target.value,
                    }))
                  }
                  className="tabular-nums"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="person-phone-input">
                  Số điện thoại
                </FieldLabel>
                <Input
                  id="person-phone-input"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={form.phone_number}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      phone_number: e.target.value,
                    }))
                  }
                  placeholder="VD: 0901234567"
                  className="tabular-nums"
                />
                {duplicatePhonePerson && (
                  <span className="animate-fade-in inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    <ExclamationTriangleIcon className="size-3.5 shrink-0" />
                    <span>
                      SĐT trùng với {duplicatePhonePerson.full_name} (
                      {duplicatePhonePerson.personnel_code}).
                    </span>
                  </span>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="person-email-input">
                  Email
                </FieldLabel>
                <Input
                  id="person-email-input"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={form.email}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                  placeholder="VD: bacsi@dymmedical.vn"

                />
              </Field>

              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="person-cost-input">
                  Lương / ngày (VNĐ) <span className="text-destructive">*</span>
                </FieldLabel>
                <Input
                  id="person-cost-input"

                  type="text"
                  inputMode="numeric"
                  required
                  placeholder="VD: 1.500.000"
                  value={formatCurrencyInput(form.fixed_cost)}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      fixed_cost: parseCurrencyInput(e.target.value),
                    }))
                  }
                  className="text-right tabular-nums"
                />
              </Field>
            </FieldGroup>
          </fieldset>
        </div>

        <DialogFooter className="personnel-form-footer">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsModalOpen(false)}
            disabled={isMutating}

          >
            Hủy
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={isMutating || Boolean(duplicateCodePerson)}

          >
            {isMutating
              ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>);
}
