import { forwardRef, useCallback, useRef, type ComponentPropsWithoutRef } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import './search-field.css';

interface SearchFieldProps extends Omit<ComponentPropsWithoutRef<typeof Input>, 'value' | 'type'> {
  value: string;
  onClear: () => void;
  shortcut?: boolean;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onClear, shortcut = false, className, disabled, ...props }, ref,
) {
  const input = useRef<HTMLInputElement | null>(null);
  const setRef = useCallback((node: HTMLInputElement | null) => {
    input.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);

  return <div className={cn('dym-search-control relative w-80 max-w-full', className)} data-disabled={disabled || undefined}>
    <Search className="dym-search-icon" aria-hidden="true" />
    <Input {...props} ref={setRef} value={value} disabled={disabled} type="search" data-slot="search-input" className="dym-search-field" />
    {value ? <button type="button" data-slot="search-clear" disabled={disabled}
      aria-label="Xóa từ khóa tìm kiếm" title="Xóa từ khóa tìm kiếm"
      onClick={() => { onClear(); input.current?.focus(); }}>
      <X aria-hidden="true" />
    </button> : shortcut && <kbd className="dym-search-shortcut" aria-hidden="true">/</kbd>}
  </div>;
});
