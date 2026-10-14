let adminAudioContext: AudioContext | null = null;

export function getAdminAudioContext(): AudioContext | null {
  if (adminAudioContext) return adminAudioContext;
  if (typeof window === 'undefined') return null;

  const AudioContextConstructor =
    window.AudioContext ??
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (!AudioContextConstructor) return null;
  adminAudioContext = new AudioContextConstructor();
  return adminAudioContext;
}

export async function playNotificationChime(volume = 0.1): Promise<void> {
  const audioContext = getAdminAudioContext();
  if (!audioContext) return;

  try {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const startAt = audioContext.currentTime;
    const notes = [523.25, 659.25];

    notes.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const noteStart = startAt + index * 0.12;
      const noteEnd = noteStart + 0.2;

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), noteStart + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd);
    });
  } catch (err) {
    console.warn('Audio playback not permitted or failed:', err);
  }
}

