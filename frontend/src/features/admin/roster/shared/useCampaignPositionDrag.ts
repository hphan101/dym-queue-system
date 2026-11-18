import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from 'react';
import {
  findPositionDropTarget,
  insertCampaignPosition,
  moveCampaignPosition,
  type PositionDropTarget,
} from '../onsite/campaignPositionOrder';

export function useCampaignPositionDrag({
  campaignId,
  positions,
  disabled,
  onSave,
  onError,
}: {
  campaignId?: string;
  positions: string[];
  disabled: boolean;
  onSave: (positions: string[]) => Promise<unknown>;
  onError: (message: string) => void;
}) {
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const pointer = useRef<{
    source: string;
    startY: number;
    top: number;
    clientY: number;
    handle: HTMLButtonElement;
    pointerId: number;
  } | null>(null);
  const saving = useRef(false);
  const liveOrder = useRef<string[] | null>(null);
  const rects = useRef<Map<string, number>>(new Map());
  const [drag, setDrag] = useState<{ source: string; offset: number } | null>(
    null,
  );
  const [drop, setDrop] = useState<PositionDropTarget | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    items: string[];
  } | null>(null);
  const displayed =
    preview && preview.id === campaignId ? preview.items : positions;
  const rows = () =>
    Array.from(
      bodyRef.current?.querySelectorAll<HTMLTableRowElement>(
        'tr[data-position]',
      ) ?? [],
    );
  const layoutTop = (row: HTMLTableRowElement) => {
    const transform = bodyRef.current?.ownerDocument.defaultView?.getComputedStyle?.(row).transform;
    const offset = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).m42 : 0;
    return row.getBoundingClientRect().top - offset;
  };

  useLayoutEffect(() => {
    const source = pointer.current;
    if (source?.handle.isConnected)
      source.handle.setPointerCapture(source.pointerId);
    const movingRow = source && rows().find((row) => row.dataset.position === source.source);
    if (source && movingRow)
      setDrag({ source: source.source, offset: source.top + source.clientY - source.startY - layoutTop(movingRow) });
    if (!rects.current.size) return;
    const view = bodyRef.current?.ownerDocument.defaultView;
    if (view && !view.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const easing =
        view
          .getComputedStyle(bodyRef.current!)
          .getPropertyValue('--ease-out')
          .trim() || 'cubic-bezier(0.23, 1, 0.32, 1)';
      for (const row of rows()) {
        if (row.dataset.position === pointer.current?.source) continue;
        const oldTop = rects.current.get(row.dataset.position!);
        if (oldTop === undefined) continue;
        row.getAnimations?.().forEach((animation) => animation.cancel());
        const delta = oldTop - row.getBoundingClientRect().top;
        if (Math.abs(delta) > 1)
          row.animate?.(
            [
              { transform: `translateY(${delta}px)` },
              { transform: 'translateY(0)' },
            ],
            { duration: 150, easing },
          );
      }
    }
    rects.current.clear();
  }, [displayed]);

  const cancel = (resetPreview = true) => {
    pointer.current = null;
    liveOrder.current = null;
    if (resetPreview) rects.current.clear();
    setDrag(null);
    setDrop(null);
    if (resetPreview) setPreview(null);
  };
  const targetAt = (event: PointerEvent<HTMLButtonElement>) => {
    const bounds = bodyRef.current?.getBoundingClientRect();
    if (
      !pointer.current ||
      !bounds ||
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      return null;
    return findPositionDropTarget(
      rows().map((row) => {
        const rect = row.getBoundingClientRect();
        return {
          name: row.dataset.position!,
          top: layoutTop(row),
          height: rect.height,
        };
      }),
      pointer.current.source,
      event.clientY,
    );
  };
  const commit = async (next: string[], animate: boolean) => {
    if (
      !campaignId ||
      disabled ||
      saving.current ||
      next.every((item, index) => item === positions[index])
    ) {
      cancel();
      return;
    }
    if (animate)
      rects.current = new Map(
        rows().map((row) => [
          row.dataset.position!,
          row.getBoundingClientRect().top,
        ]),
      );
    saving.current = true;
    setPreview({ id: campaignId, items: next });
    cancel(false);
    try {
      await onSave(next);
    } catch (cause) {
      onError(
        cause instanceof Error ? cause.message : 'Không thể lưu thứ tự vị trí.',
      );
    } finally {
      saving.current = false;
      setPreview(null);
    }
  };

  const handleProps = (position: string) => ({
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (disabled || saving.current || event.button !== 0) return;
      event.preventDefault();
      for (const row of rows())
        row.getAnimations?.().forEach((animation) => animation.cancel());
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      pointer.current = {
        source: position,
        startY: event.clientY,
        top: layoutTop(rows().find((row) => row.dataset.position === position)!),
        clientY: event.clientY,
        handle: event.currentTarget,
        pointerId: event.pointerId,
      };
      liveOrder.current = [...displayed];
      setDrag({ source: position, offset: 0 });
    },
    onPointerMove(event: PointerEvent<HTMLButtonElement>) {
      if (!pointer.current) return;
      pointer.current.clientY = event.clientY;
      const view = event.currentTarget.ownerDocument.defaultView;
      if (view && event.clientY > view.innerHeight - 72) view.scrollBy(0, 16);
      else if (view && event.clientY < 72) view.scrollBy(0, -16);
      const movingRow = rows().find((row) => row.dataset.position === pointer.current!.source);
      setDrag({
        source: pointer.current.source,
        offset:
          pointer.current.top + event.clientY - pointer.current.startY -
          (movingRow ? layoutTop(movingRow) : pointer.current.top),
      });
      const target = targetAt(event);
      setDrop(target);
      if (target && campaignId && liveOrder.current) {
        const next = insertCampaignPosition(liveOrder.current, pointer.current.source, target);
        if (next.some((item, index) => item !== liveOrder.current![index])) {
          rects.current = new Map(rows().map((row) => [row.dataset.position!, row.getBoundingClientRect().top]));
          liveOrder.current = next;
          setPreview({ id: campaignId, items: next });
        }
      }
    },
    onPointerUp(event: PointerEvent<HTMLButtonElement>) {
      const target = targetAt(event);
      if (pointer.current && target)
        void commit(
          insertCampaignPosition(liveOrder.current ?? displayed, pointer.current.source, target),
          true,
        );
      else cancel();
    },
    onPointerCancel: () => cancel(),
    onLostPointerCapture(event: PointerEvent<HTMLButtonElement>) {
      if (!pointer.current) return;
      if (event.buttons === 1 && event.currentTarget.isConnected)
        event.currentTarget.setPointerCapture(event.pointerId);
      else cancel();
    },
    onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
      if (event.key === 'Escape') {
        cancel();
        return;
      }
      if (disabled || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown'))
        return;
      event.preventDefault();
      const target =
        displayed[
          displayed.indexOf(position) + (event.key === 'ArrowUp' ? -1 : 1)
        ];
      if (target)
        void commit(moveCampaignPosition(displayed, position, target), false);
    },
  });
  return { bodyRef, positions: displayed, drag, drop, handleProps };
}
