export type PositionOrderMode = 'alphabetical' | 'manual';
const alphabet = new Intl.Collator('vi', {
  sensitivity: 'base',
  numeric: true,
});

export function orderCampaignPositions(
  positions: readonly string[],
  mode: PositionOrderMode = 'alphabetical',
): string[] {
  const clean = [
    ...new Set(positions.map((position) => position.trim()).filter(Boolean)),
  ];
  return mode === 'manual' ? clean : clean.sort(alphabet.compare);
}

export function moveCampaignPosition(
  positions: readonly string[],
  source: string,
  target: string,
): string[] {
  const next = [...positions];
  const from = next.indexOf(source);
  const to = next.indexOf(target);
  if (from < 0 || to < 0 || from === to) return next;
  next.splice(from, 1);
  next.splice(to, 0, source);
  return next;
}

export type PositionDropTarget = { target: string; edge: 'before' | 'after' };
export function findPositionDropTarget(
  rows: Array<{ name: string; top: number; height: number }>,
  source: string,
  y: number,
): PositionDropTarget | null {
  const targets = rows.filter((row) => row.name !== source);
  const next = targets.find((row) => y < row.top + row.height / 2);
  if (next) return { target: next.name, edge: 'before' };
  return targets.length
    ? { target: targets[targets.length - 1].name, edge: 'after' }
    : null;
}
export function insertCampaignPosition(
  positions: readonly string[],
  source: string,
  drop: PositionDropTarget,
): string[] {
  if (
    !positions.includes(source) ||
    !positions.includes(drop.target) ||
    source === drop.target
  )
    return [...positions];
  const next = positions.filter((position) => position !== source);
  const index = next.indexOf(drop.target) + (drop.edge === 'after' ? 1 : 0);
  next.splice(index, 0, source);
  return next;
}
export function applySavedPositionOrder(
  keys: string[],
  saved: string[] = [],
): string[] {
  const available = new Set(keys);
  return [...new Set([...saved.filter((key) => available.has(key)), ...keys])];
}
