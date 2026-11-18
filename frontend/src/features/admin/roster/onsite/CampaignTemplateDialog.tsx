import { Alert, AlertDescription } from '@/components/ui/alert';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '@/components/ui/select';
import { CampaignPositionsEditor } from './CampaignPositionsEditor';
import {
  saveCampaignTemplate,
  type CampaignTemplates,
  type CampaignType,
} from './campaignTemplates';
import { SCHEDULE_TYPE_LABELS } from '../data/rosterService';

export function CampaignTemplateDialog({
  templates,
  onClose,
  onSaved,
}: {
  templates: CampaignTemplates;
  onClose: () => void;
  onSaved: (type: CampaignType, positions: string[]) => void;
}) {
  const typeId = useId();
  const [type, setType] = useState<CampaignType>('onsite_exam');
  const [positions, setPositions] = useState(templates.onsite_exam);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onSaved(type, await saveCampaignTemplate(type, positions));
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Không lưu được vị trí mẫu.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="dym-campaign-form-dialog dym-campaign-template-dialog">
        <DialogHeader className="dym-campaign-form-header">
          <DialogTitle>Vị trí mẫu chung</DialogTitle>
          <DialogDescription>
            Dùng cho các đoàn tạo sau. Danh sách của đoàn đã lưu không thay đổi.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => void save(event)}
          className="dym-campaign-form"
        >
          <FieldGroup className="dym-campaign-template-body">
          <Field>
          <FieldLabel htmlFor={typeId}>Loại đoàn áp dụng mẫu</FieldLabel>
          <Select
            value={type}
            disabled={busy}
            onValueChange={(value) => {
              const next = value as CampaignType;
              setType(next);
              setPositions(templates[next]);
              setError('');
            }}
          >
            <SelectTrigger id={typeId} aria-label="Loại đoàn áp dụng mẫu">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {(['blood_draw', 'onsite_exam', 'setup'] as const).map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {SCHEDULE_TYPE_LABELS[value]}
                    </SelectItem>
                  ),
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
          </Field>
          <div className="dym-campaign-position-count">
            <span>Danh sách vị trí</span>
            <Badge variant="secondary">{positions.length} vị trí</Badge>
          </div>
          <CampaignPositionsEditor
            positions={positions}
            onChange={setPositions}
            disabled={busy}
          />
          {error && (
            <Alert variant="destructive"><AlertDescription>
              {error}
            </AlertDescription></Alert>
          )}
          </FieldGroup>
          <DialogFooter className="dym-campaign-form-footer">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Đang lưu…' : 'Lưu mẫu chung'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
