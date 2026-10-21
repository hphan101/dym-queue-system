import { useEffect, useState, useCallback } from 'react';
import type { BranchCode } from '../../../types/domain';
import { isBranchCode } from '../../../config/branches';
import { getTodayInVietnam } from '../../../lib/date';

const STORAGE_KEY_DATE = 'dym_admin_filter_date';
const STORAGE_KEY_BRANCH = 'dym_admin_filter_branch';

type ScopeListener = (scope: { branch: BranchCode; date: string }) => void;
const listeners = new Set<ScopeListener>();

function getInitialScope(): { branch: BranchCode; date: string } {
  let initialBranch: BranchCode = 'q1';
  let initialDate = getTodayInVietnam();

  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const urlBranch = params.get('branch')?.toLowerCase();
    const urlDate = params.get('date');

    if (urlBranch && isBranchCode(urlBranch)) {
      initialBranch = urlBranch;
    } else {
      const storedBranch = window.sessionStorage.getItem(STORAGE_KEY_BRANCH)?.toLowerCase();
      if (storedBranch && isBranchCode(storedBranch)) {
        initialBranch = storedBranch;
      }
    }

    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
      initialDate = urlDate;
    } else {
      const storedDate = window.sessionStorage.getItem(STORAGE_KEY_DATE);
      if (storedDate && /^\d{4}-\d{2}-\d{2}$/.test(storedDate)) {
        initialDate = storedDate;
      }
    }
  }

  return { branch: initialBranch, date: initialDate };
}

let currentScope = getInitialScope();

function broadcastScope(nextScope: { branch: BranchCode; date: string }) {
  currentScope = nextScope;
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(STORAGE_KEY_BRANCH, nextScope.branch);
      window.sessionStorage.setItem(STORAGE_KEY_DATE, nextScope.date);

      // Keep URL search params in sync without reloading the page
      const url = new URL(window.location.href);
      const isParamChanged =
        url.searchParams.get('branch') !== nextScope.branch ||
        url.searchParams.get('date') !== nextScope.date;

      if (isParamChanged) {
        url.searchParams.set('branch', nextScope.branch);
        url.searchParams.set('date', nextScope.date);
        window.history.replaceState(null, '', url);
      }
    } catch {
      // Storage or history update fail-safe
    }
  }

  listeners.forEach((listener) => listener(currentScope));
}

export function useAdminScope() {
  const [scope, setScope] = useState(currentScope);

  useEffect(() => {
    const handler: ScopeListener = (newScope) => {
      setScope(newScope);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const setBranch = useCallback((nextBranch: BranchCode) => {
    broadcastScope({ ...currentScope, branch: nextBranch });
  }, []);

  const setDate = useCallback((nextDate: string) => {
    broadcastScope({ ...currentScope, date: nextDate });
  }, []);

  return {
    branch: scope.branch,
    setBranch,
    date: scope.date,
    setDate,
  };
}
