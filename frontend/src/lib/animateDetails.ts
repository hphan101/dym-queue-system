import type { MouseEvent } from 'react';

export function animateDetails(event: MouseEvent<HTMLElement>) {
  const summary = event.currentTarget;
  const details = summary.parentElement as HTMLDetailsElement;
  const content = summary.nextElementSibling as HTMLElement | null;
  if (!content) return;
  event.preventDefault();
  const opening = details.dataset.motionTarget
    ? details.dataset.motionTarget !== 'open'
    : !details.open;
  const from = details.getBoundingClientRect().height;
  details.getAnimations().filter((animation) => animation.id === 'details-toggle').forEach((animation) => animation.cancel());
  delete details.dataset.motionTarget;
  if (event.detail === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    details.open = opening;
    return;
  }
  details.open = false;
  const collapsed = details.getBoundingClientRect().height;
  details.open = true;
  const expanded = details.getBoundingClientRect().height;
  details.dataset.motionTarget = opening ? 'open' : 'closed';
  const animation = details.animate(
    [{ height: `${from}px` }, { height: `${opening ? expanded : collapsed}px` }],
    { id: 'details-toggle', duration: 200, easing: getComputedStyle(details).getPropertyValue('--ease-out').trim() || 'ease-out' },
  );
  animation.onfinish = () => {
    details.open = opening;
    delete details.dataset.motionTarget;
  };
}
