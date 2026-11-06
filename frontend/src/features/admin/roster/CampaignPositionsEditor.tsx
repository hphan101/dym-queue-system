import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CampaignPositionsEditor({ positions, onChange, disabled = false }: {
  positions: string[]; onChange: (positions: string[]) => void; disabled?: boolean;
}) {
  return <div className="flex flex-col gap-2">
    <div className="flex max-h-60 flex-col gap-2 overflow-y-auto">
      {positions.map((position, index) => <div key={index} className="flex items-center gap-2">
        <Input value={position} required maxLength={200} disabled={disabled}
          aria-label={`Tên vị trí ${index + 1}`} placeholder="Tên vị trí"
          onChange={(event) => onChange(positions.map((name, i) => i === index ? event.target.value : name))} />
        <Button type="button" variant="ghost" size="icon" disabled={disabled}
          aria-label={`Xóa vị trí ${position || index + 1}`} onClick={() => onChange(positions.filter((_, i) => i !== index))}>
          <X data-icon="inline-start" />
        </Button>
      </div>)}
    </div>
    <Button type="button" variant="outline" size="sm" className="self-start" disabled={disabled || positions.length >= 100}
      onClick={() => onChange([...positions, ''])}><Plus data-icon="inline-start" />Thêm vị trí</Button>
  </div>;
}
