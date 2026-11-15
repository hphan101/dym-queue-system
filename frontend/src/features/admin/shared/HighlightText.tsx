import React, { useMemo } from 'react';

export interface HighlightTextProps {
  text?: string | number | null;
  query?: string | null;
  className?: string;
  highlightClassName?: string;
}

function stripAccents(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
}

interface HighlightRange {
  start: number;
  end: number;
}

function getHighlightRanges(text: string, query: string): HighlightRange[] {
  if (!query || !query.trim() || !text) return [];
  const normText = stripAccents(text);
  const qClean = stripAccents(query.trim());
  const words = qClean.split(/\s+/).filter((w) => w.length > 0);
  const ranges: HighlightRange[] = [];

  // 1. Match each individual word token
  for (const word of words) {
    let pos = 0;
    while ((pos = normText.indexOf(word, pos)) !== -1) {
      ranges.push({ start: pos, end: pos + word.length });
      pos += word.length;
    }
  }

  // 2. Whitespace-insensitive match (e.g. phone '0785 785 637' when typing '0785785637')
  const noSpaceQuery = qClean.replace(/\s+/g, '');
  if (noSpaceQuery.length > 1 && noSpaceQuery !== qClean) {
    let matchLen = 0;
    let matchStart = -1;
    for (let i = 0; i < text.length; i++) {
      const c = normText[i];
      if (c === ' ' || c === '.' || c === '-' || c === ',') continue;
      if (c === noSpaceQuery[matchLen]) {
        if (matchLen === 0) matchStart = i;
        matchLen++;
        if (matchLen === noSpaceQuery.length) {
          ranges.push({ start: matchStart, end: i + 1 });
          matchLen = 0;
          matchStart = -1;
        }
      } else {
        if (matchLen > 0) {
          i = matchStart; // backtrack
        }
        matchLen = 0;
        matchStart = -1;
      }
    }
  }

  if (ranges.length === 0) return [];

  // Sort and merge overlapping or adjacent ranges
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: HighlightRange[] = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = ranges[i];
    if (curr.start <= prev.end) {
      prev.end = Math.max(prev.end, curr.end);
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

export const HighlightText: React.FC<HighlightTextProps> = React.memo(({
  text,
  query,
  className,
  highlightClassName = 'dym-search-highlight',
}) => {
  const stringText = text !== null && text !== undefined ? String(text) : '';
  const trimmedQuery = query?.trim() ?? '';

  const segments = useMemo(() => {
    if (!stringText) return [];
    if (!trimmedQuery) {
      return [{ text: stringText, match: false }];
    }

    const ranges = getHighlightRanges(stringText, trimmedQuery);
    if (ranges.length === 0) {
      return [{ text: stringText, match: false }];
    }

    const result: Array<{ text: string; match: boolean }> = [];
    let lastIndex = 0;

    for (const r of ranges) {
      if (r.start > lastIndex) {
        result.push({ text: stringText.slice(lastIndex, r.start), match: false });
      }
      result.push({ text: stringText.slice(r.start, r.end), match: true });
      lastIndex = r.end;
    }

    if (lastIndex < stringText.length) {
      result.push({ text: stringText.slice(lastIndex), match: false });
    }

    return result;
  }, [stringText, trimmedQuery]);

  if (text === null || text === undefined) return null;

  if (!trimmedQuery) {
    return <span className={className}>{stringText}</span>;
  }

  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark key={index} className={highlightClassName}>
            {segment.text}
          </mark>
        ) : (
          <React.Fragment key={index}>{segment.text}</React.Fragment>
        ),
      )}
    </span>
  );
});

HighlightText.displayName = 'HighlightText';
