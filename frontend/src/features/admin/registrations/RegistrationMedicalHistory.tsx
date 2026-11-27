import { useId, useRef, useState } from 'react';
import { ClipboardList, Pencil } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TT25_PERSONAL_DISEASES, type TT25MedicalHistory } from '../../registration/tt25Types';
import { saveRegistrationMedicalHistory, type MedicalHistoryEdit } from './registrationEdits';

const answerLabels = { unknown: 'Chưa ghi nhận', yes: 'Có', no: 'Không' };

function answerValue(value?: boolean | null) {
  return value == null ? 'unknown' : value ? 'yes' : 'no';
}

function HistoryAnswer({ id, label, value, onChange, disabled }: {
  id: string; label: string; value?: boolean | null; onChange: (value: boolean | null) => void; disabled: boolean;
}) {
  return (
    <Field className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={answerValue(value)} disabled={disabled}
        onValueChange={(next) => onChange(next === 'unknown' ? null : next === 'yes')}>
        <SelectTrigger id={id} className="w-40 gap-2"><SelectValue /></SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            {Object.entries(answerLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

export function RegistrationMedicalHistory({ id, history, female, canEdit, onEditingChange, onSaved }: {
  id: string; history?: TT25MedicalHistory | null; female: boolean; canEdit: boolean;
  onEditingChange: (editing: boolean) => void; onSaved: (history: TT25MedicalHistory) => void;
}) {
  const prefix = useId();
  const [draft, setDraft] = useState<MedicalHistoryEdit | null>(null);
  const [saving, setSaving] = useState(false);
  const disabled = saving || !canEdit;
  const savingRef = useRef(false);
  const [error, setError] = useState('');
  const expected = useRef<TT25MedicalHistory | null>(null);
  const checked = TT25_PERSONAL_DISEASES.filter(({ id }) => history?.personalHistory?.[id] === true);
  const allAnswered = TT25_PERSONAL_DISEASES.every(({ id }) => typeof history?.personalHistory?.[id] === 'boolean');

  function start() {
    expected.current = history ?? null;
    setError('');
    setDraft({
      familyHistory: { hasDisease: history?.familyHistory?.hasDisease ?? null, diseaseDetails: history?.familyHistory?.diseaseDetails ?? '' },
      personalHistory: { ...history?.personalHistory },
      personalOtherDetails: history?.personalOtherDetails ?? '',
      currentTreatment: { isTreating: history?.currentTreatment?.isTreating ?? null, medications: history?.currentTreatment?.medications ?? '' },
      ...(female || history?.pregnancyHistory ? { pregnancyHistory: {
        hasHistory: history?.pregnancyHistory?.hasHistory ?? null, details: history?.pregnancyHistory?.details ?? '',
      } } : {}),
    });
    onEditingChange(true);
  }

  function close() {
    setDraft(null);
    setError('');
    onEditingChange(false);
  }

  async function save() {
    if (!draft || !canEdit || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      onSaved(await saveRegistrationMedicalHistory(id, draft, expected.current));
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa lưu được tiền sử.');
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }

  const renderNotes = (key: string, label: string, value: string, change: (value: string) => void) => (
    <Field>
      <FieldLabel htmlFor={`${prefix}-${key}`}>{label}</FieldLabel>
      <Input id={`${prefix}-${key}`} maxLength={300} value={value} disabled={disabled}
        onChange={(event) => change(event.target.value)} />
    </Field>
  );
  const readAnswer = (label: string, value?: boolean | null, notes?: string) => (
    <div className="dym-detail-item">
      <dt className="dym-detail-label">{label}</dt>
      <dd className="dym-detail-value break-words">{answerLabels[answerValue(value)]}{value && notes ? ` · ${notes}` : ''}</dd>
    </div>
  );

  return (
    <section className="dym-detail-section" aria-labelledby={`${prefix}-title`}>
      <div className="dym-detail-section-title justify-between gap-2">
        <h3 id={`${prefix}-title`} className="flex items-center gap-2"><ClipboardList className="size-4" aria-hidden="true" />Tiền sử bệnh</h3>
        {!draft && canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={start}>
            <Pencil data-icon="inline-start" aria-hidden="true" /> Sửa tiền sử
          </Button>
        )}
      </div>
      {draft ? (
        <FieldGroup className="gap-3">
          <HistoryAnswer id={`${prefix}-family`} label="Tiền sử gia đình" value={draft.familyHistory.hasDisease} disabled={disabled}
            onChange={(hasDisease) => setDraft({ ...draft, familyHistory: { ...draft.familyHistory, hasDisease } })} />
          {draft.familyHistory.hasDisease && renderNotes('family-notes', 'Bệnh trong gia đình', draft.familyHistory.diseaseDetails,
            (diseaseDetails) => setDraft({ ...draft, familyHistory: { ...draft.familyHistory, diseaseDetails } }))}
          <details className="rounded-md border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">Tiền sử bản thân</summary>
            <FieldGroup className="mt-2 gap-2">
              {TT25_PERSONAL_DISEASES.map(({ id, name }) => (
                <HistoryAnswer key={id} id={`${prefix}-personal-${id}`} label={name} value={draft.personalHistory[id]} disabled={disabled}
                  onChange={(answer) => {
                    const personalHistory = { ...draft.personalHistory };
                    if (answer === null) delete personalHistory[id];
                    else personalHistory[id] = answer;
                    setDraft({ ...draft, personalHistory });
                  }} />
              ))}
              {draft.personalHistory[22] && renderNotes('personal-notes', 'Mô tả bệnh khác', draft.personalOtherDetails,
                (personalOtherDetails) => setDraft({ ...draft, personalOtherDetails }))}
            </FieldGroup>
          </details>
          <HistoryAnswer id={`${prefix}-treatment`} label="Đang điều trị bệnh" value={draft.currentTreatment.isTreating} disabled={disabled}
            onChange={(isTreating) => setDraft({ ...draft, currentTreatment: { ...draft.currentTreatment, isTreating } })} />
          {draft.currentTreatment.isTreating && renderNotes('medications', 'Thuốc đang dùng và liều lượng', draft.currentTreatment.medications,
            (medications) => setDraft({ ...draft, currentTreatment: { ...draft.currentTreatment, medications } }))}
          {female && draft.pregnancyHistory && (
            <>
              <HistoryAnswer id={`${prefix}-pregnancy`} label="Tiền sử thai sản" value={draft.pregnancyHistory.hasHistory} disabled={disabled}
                onChange={(hasHistory) => setDraft({ ...draft, pregnancyHistory: { hasHistory, details: draft.pregnancyHistory?.details ?? '' } })} />
              {draft.pregnancyHistory.hasHistory && renderNotes('pregnancy-notes', 'Chi tiết tiền sử thai sản', draft.pregnancyHistory.details,
                (details) => setDraft({ ...draft, pregnancyHistory: { hasHistory: true, details } }))}
            </>
          )}
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" disabled={saving} onClick={close}>Hủy</Button>
            <Button type="button" size="sm" disabled={disabled} onClick={() => void save()}>{saving ? 'Đang lưu…' : 'Lưu tiền sử'}</Button>
          </div>
        </FieldGroup>
      ) : (
        <dl className="dym-detail-grid">
          {readAnswer('Tiền sử gia đình', history?.familyHistory?.hasDisease, history?.familyHistory?.diseaseDetails)}
          {readAnswer('Đang điều trị bệnh', history?.currentTreatment?.isTreating, history?.currentTreatment?.medications)}
          {female && readAnswer('Tiền sử thai sản', history?.pregnancyHistory?.hasHistory, history?.pregnancyHistory?.details)}
          <div className="dym-detail-item dym-detail-full-width">
            <dt className="dym-detail-label">Tiền sử bản thân</dt>
            <dd className="dym-detail-value break-words">
              {checked.length ? checked.map(({ id, name }) => id === 22 && history?.personalOtherDetails
                ? history.personalOtherDetails : name).join(' · ') : allAnswered ? 'Không ghi nhận bệnh' : 'Chưa ghi nhận đầy đủ'}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
