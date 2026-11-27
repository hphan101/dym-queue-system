import { createClient } from '@supabase/supabase-js';
import { isBranchCode } from '../config/branches';

type PreviewUser = { id: string };
type PreviewSession = { user: PreviewUser; access_token: string };

async function getUser() {
  const response = await fetch('/functions/v1/preview-session', { cache: 'no-store' });
  const user: PreviewUser | null = response.ok ? (await response.json()).user : null;
  return { data: { user }, error: null };
}

async function getSession() {
  const { data: { user } } = await getUser();
  return { data: { session: user ? { user, access_token: 'preview' } : null }, error: null };
}
const rest = createClient(window.location.origin, 'preview', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: {
    fetch: (input, init) => {
      const request = new Request(input, init);
      const headers = new Headers(request.headers);
      headers.delete('Authorization');
      return fetch(new Request(request, { headers, credentials: 'same-origin' }));
    },
  },
});

type PreviewPayload = { eventType: 'INSERT' | 'UPDATE'; new: Record<string, unknown> };
type PreviewStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR';

class PreviewChannel {
  private readonly branch: string;
  private readonly listeners: { table: string; event: string; notify: (payload: PreviewPayload) => void }[] = [];
  private socket: WebSocket | undefined;
  private reconnectTimer: number | undefined;
  private closed = false;
  private refreshCount = 0;

  constructor(branch: string) {
    this.branch = branch;
  }

  on(_event: string, rule: { table: string; event: string }, notify: (payload: PreviewPayload) => void) {
    this.listeners.push({ ...rule, notify });
    return this;
  }

  private emit(table: string, payload: PreviewPayload) {
    if (this.closed) return;
    for (const listener of this.listeners) {
      if (listener.table === table && (listener.event === '*' || listener.event === payload.eventType)) listener.notify(payload);
    }
  }

  subscribe(onStatus?: (status: PreviewStatus) => void) {
    if (!isBranchCode(this.branch)) return this;
    const observesRegistrations = this.listeners.some(({ table }) => table === 'registrations');
    const observesDisplay = this.listeners.some(({ table }) => table === 'branch_display_state');
    const refreshDisplay = async () => {
      if (!observesDisplay) return;
      const count = ++this.refreshCount;
      const { data, error } = await rest.from('branch_display_state').select('*').eq('branch_id', this.branch).maybeSingle();
      if (!error && count === this.refreshCount) this.emit('branch_display_state', { eventType: 'UPDATE', new: data ?? { revision: 0 } });
    };
    const refreshRegistrations = async (registrationId?: string) => {
      if (!observesRegistrations) return;
      if (registrationId) {
        try {
          const query = new URLSearchParams({ id: registrationId });
          const response = await fetch(`/api/${this.branch}/registration-notice?${query}`, { cache: 'no-store' });
          if (response.ok) {
            this.emit('registrations', { eventType: 'INSERT', new: await response.json() });
            return;
          }
        } catch {
          // The regular list refresh still works if the notice fetch fails.
        }
      }
      this.emit('registrations', { eventType: 'UPDATE', new: {} });
    };
    const connect = () => {
      const url = new URL(`/api/${this.branch}/events`, window.location.href);
      if (observesRegistrations) url.searchParams.set('staff', '1');
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(url);
      this.socket = socket;
      socket.addEventListener('open', () => {
        onStatus?.('SUBSCRIBED');
        void refreshDisplay();
        void refreshRegistrations();
      });
      socket.addEventListener('message', ({ data }) => {
        if (typeof data !== 'string') return;
        const registrationId = /^registered:([0-9a-f-]{36})$/.exec(data)?.[1];
        if (data !== 'changed' && !registrationId) return;
        void refreshDisplay();
        void refreshRegistrations(registrationId);
      });
      socket.addEventListener('close', () => {
        if (this.closed) return;
        onStatus?.('CHANNEL_ERROR');
        this.reconnectTimer = window.setTimeout(connect, 2000);
      });
      socket.addEventListener('error', () => socket.close());
    };
    connect();
    return this;
  }

  unsubscribe() {
    this.closed = true;
    window.clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }
}

export const supabase = {
  from: rest.from.bind(rest),
  rpc: rest.rpc.bind(rest),
  storage: rest.storage,
  channel: (name: string) => new PreviewChannel(name.split(':')[1] ?? ''),
  removeChannel: (channel: PreviewChannel) => channel.unsubscribe(),
  auth: {
    getUser,
    getSession,
    refreshSession: getSession,
    setSession: async () => {
      const { data: { session } } = await getSession();
      return { data: { session, user: session?.user ?? null }, error: null };
    },
    onAuthStateChange: (listener: (event: string, currentSession: PreviewSession | null) => void) => {
      let active = true;
      void getSession().then(({ data }) => { if (active) listener('INITIAL_SESSION', data.session); })
        .catch(() => { if (active) listener('INITIAL_SESSION', null); });
      return { data: { subscription: { unsubscribe: () => { active = false; } } } };
    },
    signOut: async () => {
      const response = await fetch('/functions/v1/preview-logout', { method: 'POST' });
      if (response.ok) window.location.assign('/login');
      return { error: response.ok ? null : new Error('Không đăng xuất được.') };
    },
  },
};
