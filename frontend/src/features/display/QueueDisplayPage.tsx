import {
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
} from '@heroicons/react/24/outline';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dymLogoDark from '../../assets/dym-logo-dark.png';
import { BRANCH_NAMES } from '../../config/branches';
import { getTodayInVietnam } from '../../lib/date';
import { formatQueueNumber } from '../../lib/queueNumber';
import { supabase } from '../../lib/supabaseClient';
import type { BranchCode } from '../../types/domain';
import './queue-display.css';

interface QueueDisplayState {
  branch: BranchCode;
  queueNumber: string;
  calledAt: number;
  revision: number;
}

interface DisplayRecord {
  queue_date: string | null;
  queue_number: number | null;
  called_at: string | null;
  revision: number;
}

const DISPLAY_CHANNEL_NAME = 'dym-queue-display';
const DISPLAY_VOLUME_STORAGE_KEY = 'dym-display-volume';
const DEFAULT_DISPLAY_VOLUME = 0.75;
const ANNOUNCEMENT_DELAY_MS = 480;
const VIETNAMESE_DIGITS = [
  'không',
  'một',
  'hai',
  'ba',
  'bốn',
  'năm',
  'sáu',
  'bảy',
  'tám',
  'chín',
] as const;

let displayAudioContext: AudioContext | null = null;

function getBranchFromUrl(): BranchCode {
  const branch = new URLSearchParams(window.location.search)
    .get('branch')
    ?.toLowerCase();

  return branch === 'q7' || branch === 'hn' ? branch : 'q1';
}

function clampVolume(value: number) {
  return Math.min(1, Math.max(0.1, value));
}

function getStoredVolume() {
  const storedVolume = Number.parseFloat(
    window.localStorage.getItem(DISPLAY_VOLUME_STORAGE_KEY) ?? '',
  );
  return Number.isFinite(storedVolume)
    ? clampVolume(storedVolume)
    : DEFAULT_DISPLAY_VOLUME;
}

function getAudioContext() {
  if (displayAudioContext) return displayAudioContext;

  const AudioContextConstructor =
    window.AudioContext ??
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (!AudioContextConstructor) return null;
  displayAudioContext = new AudioContextConstructor();
  return displayAudioContext;
}

async function playCallChime(volume: number) {
  const audioContext = getAudioContext();
  if (!audioContext) return;

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  const startAt = audioContext.currentTime;
  const notes = [
    { frequency: 659.25, offset: 0 },
    { frequency: 783.99, offset: 0.16 },
  ];

  notes.forEach(({ frequency, offset }) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const noteStart = startAt + offset;
    const noteEnd = noteStart + 0.26;

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, volume * 0.16),
      noteStart + 0.025,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd);
  });
}

function speakQueueNumber(queueNumber: string, volume: number) {
  if (!('speechSynthesis' in window)) return;

  const spokenNumber = queueNumber
    .split('')
    .map((digit) => VIETNAMESE_DIGITS[Number(digit)] ?? digit)
    .join(' ');
  const utterance = new SpeechSynthesisUtterance(`Mời số ${spokenNumber}`);
  const vietnameseVoice = window.speechSynthesis
    .getVoices()
    .find((voice) => voice.lang.toLowerCase().startsWith('vi'));

  utterance.lang = vietnameseVoice?.lang ?? 'vi-VN';
  utterance.voice = vietnameseVoice ?? null;
  utterance.rate = 0.88;
  utterance.pitch = 1;
  utterance.volume = volume;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function QueueDisplayPage() {
  const branch = useMemo(getBranchFromUrl, []);
  const [displayState, setDisplayState] = useState<QueueDisplayState | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [isSoundEnabled, setIsSoundEnabled] = useState(false);
  const [volume, setVolume] = useState(getStoredVolume);
  const soundEnabledRef = useRef(false);
  const volumeRef = useRef(volume);
  const lastSeenRevisionRef = useRef<number | null>(null);
  const announcementTimerRef = useRef<number | null>(null);
  const announcementTokenRef = useRef(0);

  const cancelAnnouncement = useCallback(() => {
    announcementTokenRef.current += 1;
    if (announcementTimerRef.current !== null) {
      window.clearTimeout(announcementTimerRef.current);
      announcementTimerRef.current = null;
    }
    window.speechSynthesis?.cancel();
  }, []);

  const announceQueueNumber = useCallback(
    (queueNumber: string) => {
      cancelAnnouncement();
      const announcementToken = announcementTokenRef.current;
      void playCallChime(volumeRef.current);
      announcementTimerRef.current = window.setTimeout(() => {
        if (
          soundEnabledRef.current &&
          announcementToken === announcementTokenRef.current
        ) {
          speakQueueNumber(queueNumber, volumeRef.current);
        }
        announcementTimerRef.current = null;
      }, ANNOUNCEMENT_DELAY_MS);
    },
    [cancelAnnouncement],
  );

  const handleSoundToggle = async () => {
    if (soundEnabledRef.current) {
      soundEnabledRef.current = false;
      setIsSoundEnabled(false);
      cancelAnnouncement();
      return;
    }

    const audioContext = getAudioContext();
    if (audioContext?.state === 'suspended') {
      await audioContext.resume();
    }

    soundEnabledRef.current = true;
    setIsSoundEnabled(true);
    void playCallChime(volumeRef.current);
  };

  const handleVolumeChange = (nextVolume: number) => {
    const normalizedVolume = clampVolume(nextVolume);
    volumeRef.current = normalizedVolume;
    setVolume(normalizedVolume);
    window.localStorage.setItem(
      DISPLAY_VOLUME_STORAGE_KEY,
      String(normalizedVolume),
    );
  };

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `Màn hình chờ | ${BRANCH_NAMES[branch]}`;
    return () => {
      document.title = previousTitle;
    };
  }, [branch]);

  useEffect(() => {
    const clockTimer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(clockTimer);
  }, []);

  useEffect(() => {
    let isMounted = true;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    lastSeenRevisionRef.current = null;

    const applyDisplayRecord = (record: DisplayRecord | null) => {
      if (!isMounted) return;
      if (
        !record?.queue_number ||
        !record.called_at ||
        record.queue_date !== getTodayInVietnam()
      ) {
        setDisplayState(null);
        return;
      }

      setDisplayState({
        branch,
        queueNumber: formatQueueNumber(record.queue_number),
        calledAt: new Date(record.called_at).getTime(),
        revision: Number(record.revision),
      });
    };

    const connectDisplay = async () => {
      const { data: branchRecord, error: branchError } = await supabase
        .from('branches')
        .select('id')
        .eq('code', branch)
        .eq('is_active', true)
        .maybeSingle();

      if (!isMounted || branchError || !branchRecord) return;

      const { data: initialState } = await supabase
        .from('branch_display_state')
        .select('queue_date, queue_number, called_at, revision')
        .eq('branch_id', branchRecord.id)
        .maybeSingle();

      lastSeenRevisionRef.current = Number(initialState?.revision ?? 0);
      applyDisplayRecord(initialState);

      realtimeChannel = supabase
        .channel(`${DISPLAY_CHANNEL_NAME}:${branchRecord.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'branch_display_state',
            filter: `branch_id=eq.${branchRecord.id}`,
            select: [
              'branch_id',
              'queue_date',
              'queue_number',
              'called_at',
              'revision',
              'updated_at',
            ],
          },
          (payload) => {
            const nextState = payload.new as DisplayRecord;
            const nextRevision = Number(nextState.revision);
            const previousRevision =
              lastSeenRevisionRef.current ?? nextRevision;
            const shouldAnnounce =
              nextRevision > previousRevision &&
              Boolean(nextState.queue_number) &&
              Boolean(nextState.called_at) &&
              nextState.queue_date === getTodayInVietnam();

            lastSeenRevisionRef.current = Math.max(
              previousRevision,
              nextRevision,
            );
            applyDisplayRecord(nextState);

            if (shouldAnnounce && soundEnabledRef.current) {
              announceQueueNumber(formatQueueNumber(nextState.queue_number!));
            }
          },
        )
        .subscribe();
    };

    void connectDisplay();
    return () => {
      isMounted = false;
      if (realtimeChannel) {
        void supabase.removeChannel(realtimeChannel);
      }
    };
  }, [announceQueueNumber, branch]);

  useEffect(
    () => () => {
      soundEnabledRef.current = false;
      cancelAnnouncement();
    },
    [cancelAnnouncement],
  );

  const queueNumber = displayState?.queueNumber ?? '---';
  const hasActiveCall = displayState !== null;
  const formattedTime = new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);
  const formattedDate = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);

  return (
    <div className="dym-display-shell">
      <header className="dym-display-header">
        <img
          src={dymLogoDark}
          alt="DYM Medical Center Vietnam"
          className="dym-display-logo"
        />
        <div className="dym-display-header-actions">
          <div className="dym-display-status" aria-label="Màn hình đang hoạt động">
            <span aria-hidden="true" />
            Màn hình đang hoạt động
          </div>
          <button
            type="button"
            className="dym-display-sound-toggle"
            data-enabled={isSoundEnabled}
            aria-pressed={isSoundEnabled}
            onClick={() => void handleSoundToggle()}
          >
            {isSoundEnabled ? (
              <SpeakerWaveIcon aria-hidden="true" />
            ) : (
              <SpeakerXMarkIcon aria-hidden="true" />
            )}
            {isSoundEnabled ? 'Âm thanh đang bật' : 'Bật âm thanh'}
          </button>
          {isSoundEnabled && (
            <label className="dym-display-volume">
              <span>Âm lượng</span>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={volume}
                onChange={(event) =>
                  handleVolumeChange(Number(event.currentTarget.value))
                }
              />
            </label>
          )}
        </div>
      </header>

      <main className="dym-display-main">
        <p className="dym-display-label">
          {hasActiveCall ? 'Đang gọi số' : 'Chưa gọi số'}
        </p>
        <div
          key={displayState?.revision ?? 'empty'}
          className="dym-display-number"
          aria-live="polite"
          aria-label={
            hasActiveCall
              ? `Đang gọi số ${queueNumber}`
              : 'Hiện chưa có số đang được gọi'
          }
        >
          {queueNumber}
        </div>
      </main>

      <footer className="dym-display-footer">
        <div>
          <strong>{BRANCH_NAMES[branch]}</strong>
          <span>DYM Medical Center</span>
        </div>
        <div className="dym-display-clock" aria-label={`${formattedDate}, ${formattedTime}`}>
          <strong>{formattedTime}</strong>
          <span>{formattedDate}</span>
        </div>
      </footer>
    </div>
  );
}

export default QueueDisplayPage;
