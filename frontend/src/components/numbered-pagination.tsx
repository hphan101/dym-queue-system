import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import './numbered-pagination.css';

function getPaginationItems(currentPage: number, totalPages: number): Array<number | string> {
  const pages = totalPages <= 5
    ? Array.from({ length: totalPages }, (_, index) => index + 1)
    : [...new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages])]
      .filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  return pages.flatMap((page, index) => {
    const previous = pages[index - 1];
    if (!previous || page === previous + 1) return [page];
    return [`gap-${previous}`, page];
  });
}

interface NumberedPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  label?: string;
  labels?: { previous: string; next: string; page: (page: number) => string };
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
}

export function NumberedPagination({ currentPage, totalPages, onPageChange, label = 'Phân trang', labels, pageSize, onPageSizeChange }: NumberedPaginationProps) {
  const pagination = (
    <nav className="dym-numbered-pagination" aria-label={label}>
      <Button type="button" variant="outline" size="icon" aria-label={labels?.previous ?? 'Trang trước'}
        disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
        <ChevronLeft aria-hidden="true" />
      </Button>
      {getPaginationItems(currentPage, totalPages).map((page) => typeof page === 'number' ? (
        <Button key={page} type="button" variant="outline" size="icon"
          aria-label={labels?.page(page) ?? `Trang ${page}`} aria-current={page === currentPage ? 'page' : undefined}
          onClick={() => onPageChange(page)}>{page}</Button>
      ) : <span key={page} className="dym-pagination-ellipsis" aria-hidden="true">…</span>)}
      <Button type="button" variant="outline" size="icon" aria-label={labels?.next ?? 'Trang sau'}
        disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  );
  if (pageSize === undefined || !onPageSizeChange) return pagination;
  return <div className="dym-pagination-controls">
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Số dòng mỗi trang</span>
      <Select value={String(pageSize)} onValueChange={(value) => {
        onPageSizeChange(Number(value));
        onPageChange(1);
      }}>
        <SelectTrigger className="w-20" aria-label="Số dòng mỗi trang"><SelectValue /></SelectTrigger>
        <SelectContent side="top" align="end">
          <SelectGroup>{[10, 20, 30, 40, 50].map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectGroup>
        </SelectContent>
      </Select>
    </div>
    {pagination}
  </div>;
}
