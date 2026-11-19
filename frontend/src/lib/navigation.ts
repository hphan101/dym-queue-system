export const APP_NAVIGATION_EVENT = 'dym-app-navigation';

export function openStaffTab(href: string) {
  const destination = new URL(href, window.location.origin);
  if (destination.origin !== window.location.origin) return;
  // A same-origin blank tab inherits sessionStorage. Detach its opener before
  // navigating so the new page reuses staff auth without retaining tab control.
  const tab = window.open('about:blank', '_blank');
  if (!tab) { navigateWithinApp(destination.href); return; }
  tab.opener = null;
  tab.location.replace(destination.href);
}

interface InternalLinkEvent {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  preventDefault: () => void;
}

function navigateWithinApp(href: string) {
  const nextUrl = new URL(href, window.location.origin);
  const currentUrl = new URL(window.location.href);

  if (
    nextUrl.pathname === currentUrl.pathname &&
    nextUrl.search === currentUrl.search &&
    nextUrl.hash === currentUrl.hash
  ) {
    return;
  }

  window.history.pushState(null, '', nextUrl);
  window.dispatchEvent(new Event(APP_NAVIGATION_EVENT));
  window.scrollTo({ top: 0, behavior: 'auto' });
}

export function handleInternalLinkClick(
  event: InternalLinkEvent,
  href: string,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  event.preventDefault();
  navigateWithinApp(href);
}
