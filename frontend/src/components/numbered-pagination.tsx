import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
}

export function NumberedPagination({ currentPage, totalPages, onPageChange, label = 'Phân trang' }: NumberedPaginationProps) {
  return (
    <nav className="dym-numbered-pagination" aria-label={label}>
      <Button type="button" variant="outline" size="icon" aria-label="Trang trước"
        disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
        <ChevronLeft aria-hidden="true" />
      </Button>
      {getPaginationItems(currentPage, totalPages).map((page) => typeof page === 'number' ? (
        <Button key={page} type="button" variant="outline" size="icon"
          aria-label={`Trang ${page}`} aria-current={page === currentPage ? 'page' : undefined}
          onClick={() => onPageChange(page)}>{page}</Button>
      ) : <span key={page} className="dym-pagination-ellipsis" aria-hidden="true">…</span>)}
      <Button type="button" variant="outline" size="icon" aria-label="Trang sau"
        disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  );
}
