import { useEffect, useRef } from 'react';
import { APP_NAVIGATION_EVENT } from '../../../../lib/navigation';

export function rosterViewHref(
  page: 'roster-insite' | 'roster-onsite',
  scope: { date: string; branch: 'q1' | 'q7' },
  view: 'week' | 'day' | 'details',
  campaign?: { id: string; schedule_type: string },
) {
  const url = new URL(window.location.href);
  const params = url.searchParams;
  params.set('page', page);
  params.set('branch', scope.branch);
  params.set('date', scope.date);
  params.set('view', view);
  if (campaign) {
    params.set('campaign', campaign.id);
    params.set('type', campaign.schedule_type);
  } else {
    params.delete('campaign');
    params.delete('type');
  }
  return url.href;
}

export function readRosterDeepLink(search: string, page: string) {
  const params = new URLSearchParams(search);
  if (params.get('page') !== page) return null;
  const date = params.get('date') ?? '';
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    return null;
  const branch = params.get('branch');
  if (branch !== 'q1' && branch !== 'q7') return null;
  return {
    date,
    branch: branch as 'q1' | 'q7',
    campaign: params.get('campaign'),
    type: params.get('type'),
    view: params.get('view'),
  };
}

export function useRosterDeepLink(
  page: string,
  onOpen: (link: NonNullable<ReturnType<typeof readRosterDeepLink>>) => void,
) {
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  useEffect(() => {
    const open = () => {
      const link = readRosterDeepLink(window.location.search, page);
      if (link) onOpenRef.current(link);
    };
    open();
    window.addEventListener(APP_NAVIGATION_EVENT, open);
    window.addEventListener('popstate', open);
    return () => {
      window.removeEventListener(APP_NAVIGATION_EVENT, open);
      window.removeEventListener('popstate', open);
    };
  }, [page]);
}
