import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Pencil } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentProps, type FormEvent } from 'react';
import type { SupportedLanguage } from '../../../locales/index';
import { RegistrationAccessError, requestRegistrationAccess } from '../access/registrationAccessApi';
import { loadProvinces, loadWardsForProvince, type Province, type Ward } from '../form/locationService';
import { storeCustomerEditSession, type CustomerEditSession, type EditableRegistrationDetails } from './customerRegistrationEdit';

type EditField = keyof EditableRegistrationDetails;

interface EditResponse {
  details: EditableRegistrationDetails;
  phoneRequired: boolean;
  companyRequired: boolean;
}

interface EditPanelProps {
  session: CustomerEditSession;
  lang: SupportedLanguage;
  onEdited: (details: EditableRegistrationDetails) => void;
}

const fieldLabels: Record<EditField, [string, string, string]> = {
  fullName: ['Họ và tên', 'Full name', '氏名'],
  phoneNumber: ['Số điện thoại', 'Phone number', '電話番号'],
  email: ['Email', 'Email', 'メールアドレス'],
  province: ['Tỉnh / Thành phố', 'Province / City', '省・市'],
  ward: ['Phường / Xã', 'Ward / Commune', '行政区（区・社）'],
  addressDetail: ['Địa chỉ cụ thể', 'Street address', '詳細住所'],
  workplace: ['Nơi làm việc / học tập', 'Workplace / School', '勤務先・学校'],
};

const selectClass = 'h-9 w-full rounded-md border border-input bg-card px-3 text-base focus-visible:ring-2 focus-visible:ring-ring/20 md:text-sm';

export function CustomerRegistrationEditPanel({ session, lang, onEdited }: EditPanelProps) {
  const langIndex = lang === 'ja' ? 2 : lang === 'en' ? 1 : 0;
  const label = (field: EditField) => fieldLabels[field][langIndex];
  const text = (vi: string, en: string, ja: string) => ({ vi, en, ja })[lang];
  const [editor, setEditor] = useState<EditResponse | null>(null);
  const [working, setWorking] = useState(false);
  const [locked, setLocked] = useState(() => session.expiresAt <= Date.now());
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [province, setProvince] = useState('');
  const [ward, setWard] = useState('');
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [wardList, setWardList] = useState<{ code: string; wards: Ward[] }>();
  const [locationError, setLocationError] = useState(false);
  const [locationAttempt, setLocationAttempt] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const provinceCode = provinces.find((item) => item.name_with_type === province)?.code;
  const wards = wardList?.code === provinceCode ? wardList?.wards ?? [] : [];

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      storeCustomerEditSession(null);
      setLocked(true);
      setEditor(null);
    }, Math.max(0, session.expiresAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [session.expiresAt]);

  const editorOpen = editor !== null;
  useEffect(() => {
    if (editorOpen) headingRef.current?.focus({ preventScroll: true });
  }, [editorOpen]);

  useEffect(() => {
    if (!editorOpen) return;
    let current = true;
    void loadProvinces().then(
      (items) => { if (current) setProvinces(items); },
      () => { if (current) setLocationError(true); },
    );
    return () => { current = false; };
  }, [editorOpen, locationAttempt]);

  useEffect(() => {
    if (!editorOpen || !provinceCode) return;
    let current = true;
    void loadWardsForProvince(provinceCode).then(
      (items) => { if (current) setWardList({ code: provinceCode, wards: items }); },
      () => { if (current) setLocationError(true); },
    );
    return () => { current = false; };
  }, [editorOpen, provinceCode, locationAttempt]);

  function request(changes?: Partial<EditableRegistrationDetails>) {
    return requestRegistrationAccess<EditResponse>({
      action: 'edit-registration', branch: session.receipt.branch, sessionToken: session.token, changes,
    }, AbortSignal.timeout(15_000));
  }

  function handleError(cause: unknown, form?: HTMLFormElement) {
    if (cause instanceof RegistrationAccessError) {
      if (['EDIT_SESSION_INVALID', 'EDIT_SESSION_EXPIRED', 'EDIT_LOCKED'].includes(cause.code)) {
        storeCustomerEditSession(null);
        setLocked(true);
        setEditor(null);
        return;
      }
      if (cause.code === 'INVALID_DATA' && cause.field && Object.hasOwn(fieldLabels, cause.field)) {
        const field = cause.field as EditField;
        setError({ field, message: text(
          `Vui lòng kiểm tra ${label(field).toLowerCase()}.`,
          `Please check ${label(field).toLowerCase()}.`,
          `「${label(field)}」をご確認ください。`,
        ) });
        const control = form?.elements.namedItem(field);
        if (control instanceof HTMLElement) control.focus();
        return;
      }
    }
    setError({ message: text('Chưa thể sửa thông tin. Vui lòng thử lại.', 'Could not edit your details. Please try again.', '登録内容を修正できませんでした。もう一度お試しください。') });
  }

  async function openEditor() {
    if (working || locked) return;
    setWorking(true);
    setError(null);
    setSaved(false);
    try {
      const result = await request();
      if (session.expiresAt <= Date.now()) return;
      setProvince(result.details.province);
      setWard(result.details.ward);
      setLocationError(false);
      setEditor(result);
    } catch (cause) {
      handleError(cause);
    } finally {
      setWorking(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || working || locked) return;
    const form = event.currentTarget;
    const input = new FormData(form);
    const changes: Partial<EditableRegistrationDetails> = {};
    for (const field of Object.keys(fieldLabels) as EditField[]) {
      const value = String(input.get(field) ?? '').trim();
      if (value !== editor.details[field]) changes[field] = value;
    }
    setWorking(true);
    setError(null);
    try {
      const result = await request(changes);
      onEdited(result.details);
      setEditor(null);
      setSaved(true);
    } catch (cause) {
      handleError(cause, form);
    } finally {
      setWorking(false);
    }
  }

  const fieldId = (field: EditField) => `customer-edit-${field}`;
  const fieldErrorId = (field: EditField) => error?.field === field ? `${fieldId(field)}-error` : undefined;
  const renderFieldError = (field: EditField) => error?.field === field
    ? <FieldError id={fieldErrorId(field)}>{error.message}</FieldError>
    : null;

  if (!editor || locked) return (
    <div className="flex flex-col items-center gap-2">
      {!locked && <Button type="button" variant="outline" size="lg" onClick={() => void openEditor()} disabled={working}>
        <Pencil data-icon="inline-start" aria-hidden="true" />
        {working ? text('Đang tải…', 'Loading…', '読み込み中…') : text('Sửa thông tin', 'Edit details', '登録内容を修正')}
      </Button>}
      {saved && <p role="status" className="text-sm text-foreground">{text(
        'Đã lưu thay đổi. Số thứ tự vẫn giữ nguyên.',
        'Changes saved. Your queue number stays the same.',
        '変更を保存しました。受付番号は変わりません。',
      )}</p>}
      {locked && <p role="status" className="text-sm text-muted-foreground">{text(
        'Đã hết thời gian sửa hoặc hồ sơ đã được tiếp nhận. Vui lòng liên hệ lễ tân.',
        'The edit window has closed or your registration has been processed. Please contact reception.',
        '修正できる時間が過ぎたか、受付処理が進んでいます。受付にお問い合わせください。',
      )}</p>}
      {!locked && !saved && !working && <p className="text-xs text-muted-foreground">{text(
        'Có thể sửa trong 10 phút sau khi đăng ký, trước khi hồ sơ được in hoặc gọi số.',
        'You can edit for 10 minutes after registration, until your form is printed or your number is called.',
        '登録後10分以内で、健診票の印刷や番号の呼び出しまで修正できます。',
      )}</p>}
      {error && !locked && <Alert variant="destructive"><AlertDescription>{error.message}</AlertDescription></Alert>}
    </div>
  );

  const { details, phoneRequired, companyRequired } = editor;
  const renderInput = (field: EditField, props: ComponentProps<typeof Input> = {}) => (
    <Field key={field} data-invalid={error?.field === field}>
      <FieldLabel htmlFor={fieldId(field)}>{label(field)}</FieldLabel>
      <Input id={fieldId(field)} name={field} defaultValue={details[field]} aria-invalid={error?.field === field}
        aria-describedby={fieldErrorId(field)} {...props} />
      {renderFieldError(field)}
    </Field>
  );

  return (
    <form onSubmit={(event) => void save(event)} aria-labelledby="customer-edit-title" className="flex flex-col gap-4 rounded-md border bg-card p-4 text-left">
      <div className="flex flex-col gap-1">
        <h2 ref={headingRef} id="customer-edit-title" tabIndex={-1} className="text-base font-semibold">{text(
          'Sửa thông tin đã đăng ký',
          'Edit registration details',
          '登録内容の修正',
        )}</h2>
        <p className="text-xs text-muted-foreground">{text(
          'Vui lòng liên hệ lễ tân nếu cần sửa CCCD hoặc hộ chiếu.',
          'Please contact reception to correct a citizen ID or passport number.',
          '身分証明書番号やパスポート番号の訂正は、受付にお申し出ください。',
        )}</p>
      </div>
      {error && !error.field && <Alert variant="destructive"><AlertDescription>{error.message}</AlertDescription></Alert>}
      <fieldset disabled={working}>
        <FieldGroup className="gap-3">
          {renderInput('fullName', { required: true, minLength: 2, maxLength: 100, autoComplete: 'name' })}
          {renderInput('phoneNumber', { required: phoneRequired, maxLength: 24, type: 'tel', autoComplete: 'tel' })}
          {renderInput('email', { type: 'email', maxLength: 120, autoComplete: 'email' })}
          <Field data-invalid={error?.field === 'province'}>
            <FieldLabel htmlFor={fieldId('province')}>{label('province')}</FieldLabel>
            <select id={fieldId('province')} name="province" className={selectClass} required value={province}
              aria-invalid={error?.field === 'province'} aria-describedby={fieldErrorId('province')}
              onChange={(event) => { setProvince(event.target.value); setWard(''); setLocationError(false); }}>
              {province && !provinceCode && <option value={province}>{province}</option>}
              {provinces.map((item) => <option key={item.code} value={item.name_with_type}>{item.name_with_type}</option>)}
            </select>
            {renderFieldError('province')}
          </Field>
          <Field data-invalid={error?.field === 'ward'}>
            <FieldLabel htmlFor={fieldId('ward')}>{label('ward')}</FieldLabel>
            <select id={fieldId('ward')} name="ward" className={selectClass} required value={ward}
              aria-invalid={error?.field === 'ward'} aria-describedby={fieldErrorId('ward')}
              onChange={(event) => setWard(event.target.value)}>
              <option value="">{text('Chọn phường / xã', 'Select a ward / commune', '行政区（区・社）を選択')}</option>
              {ward && !wards.some((item) => item.name_with_type === ward) && <option value={ward}>{ward}</option>}
              {wards.map((item) => <option key={item.code} value={item.name_with_type}>{item.name_with_type}</option>)}
            </select>
            {renderFieldError('ward')}
          </Field>
          {locationError && <Button type="button" variant="outline" onClick={() => {
            setLocationError(false);
            setLocationAttempt((attempt) => attempt + 1);
          }}>{text('Tải lại danh sách địa chỉ', 'Reload address options', '住所の選択肢を再読み込み')}</Button>}
          {renderInput('addressDetail', { required: true, minLength: 3, maxLength: 250, autoComplete: 'address-line1' })}
          {renderInput('workplace', { required: companyRequired, maxLength: 150, autoComplete: 'organization' })}
        </FieldGroup>
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button type="button" size="lg" variant="outline" disabled={working} onClick={() => { setEditor(null); setError(null); }}>
          {text('Hủy', 'Cancel', 'キャンセル')}
        </Button>
        <Button type="submit" size="lg" disabled={working}>{working ? text(
          'Đang lưu…',
          'Saving…',
          '保存中…',
        ) : text(
          'Lưu thay đổi',
          'Save changes',
          '変更を保存',
        )}</Button>
      </div>
    </form>
  );
}
