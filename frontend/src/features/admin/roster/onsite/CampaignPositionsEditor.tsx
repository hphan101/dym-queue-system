import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldGroup } from '@/components/ui/field';

export function CampaignPositionsEditor({
  positions,
  onChange,
  disabled = false,
}: {
  positions: string[];
  onChange: (positions: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <FieldGroup className="min-w-0 gap-3">
      <div className="flex min-w-0 max-h-72 flex-col gap-2 overflow-y-auto overflow-x-hidden p-1">
        {positions.map((position, index) => (
          <Field key={index} orientation="horizontal" className="grid min-w-0 grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-2">
            <Input
              className="min-w-0"
              value={position}
              required
              maxLength={200}
              disabled={disabled}
              aria-label={`Tên vị trí ${index + 1}`}
              placeholder="Tên vị trí"
              onChange={(event) =>
                onChange(
                  positions.map((name, i) =>
                    i === index ? event.target.value : name,
                  ),
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label={`Xóa vị trí ${position || index + 1}`}
              title={`Xóa vị trí ${position || index + 1}`}
              onClick={() => onChange(positions.filter((_, i) => i !== index))}
            >
              <X data-icon="inline-start" />
            </Button>
          </Field>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={disabled || positions.length >= 100}
        onClick={() => onChange([...positions, ''])}
      >
        <Plus data-icon="inline-start" />
        Thêm vị trí
      </Button>
    </FieldGroup>
  );
}
