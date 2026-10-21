import { defineTheme } from '@astryxdesign/core/theme';

export const dymAdminTheme = defineTheme({
  name: 'dym-admin',
  radius: { base: 3, multiplier: 1 },
  motion: { fast: 120, medium: 220, slow: 420, ratio: 0.75 },
  tokens: {
    '--color-accent': [
      'var(--color-brand-accent)',
      'var(--color-brand-accent)',
    ],
    '--color-accent-muted': [
      'var(--color-brand-accent-muted)',
      'var(--color-brand-accent-muted)',
    ],
    '--color-on-accent': [
      'var(--color-brand-accent-ink)',
      'var(--color-brand-accent-ink)',
    ],
    '--color-background-body': ['var(--color-paper)', 'var(--color-paper)'],
    '--color-background-surface': [
      'var(--color-paper-2)',
      'var(--color-paper-2)',
    ],
    '--color-background-card': [
      'var(--color-paper-2)',
      'var(--color-paper-2)',
    ],
    '--color-background-muted': [
      'var(--color-paper-3)',
      'var(--color-paper-3)',
    ],
    '--color-background-popover': [
      'var(--color-paper-raised)',
      'var(--color-paper-raised)',
    ],
    '--color-text-primary': ['var(--color-ink)', 'var(--color-ink)'],
    '--color-text-secondary': ['var(--color-muted)', 'var(--color-muted)'],
    '--color-text-accent': ['var(--color-accent)', 'var(--color-accent)'],
    '--color-icon-primary': ['var(--color-ink)', 'var(--color-ink)'],
    '--color-icon-secondary': ['var(--color-muted)', 'var(--color-muted)'],
    '--color-icon-accent': ['var(--color-accent)', 'var(--color-accent)'],
    '--color-border': ['var(--color-rule)', 'var(--color-rule)'],
    '--color-border-emphasized': [
      'var(--color-rule-2)',
      'var(--color-rule-2)',
    ],
    '--color-shadow': [
      'var(--color-shadow-deep)',
      'var(--color-shadow-deep)',
    ],
    '--color-overlay-hover': [
      'var(--color-overlay-hover-soft)',
      'var(--color-overlay-hover-soft)',
    ],
    '--color-overlay-pressed': [
      'var(--color-overlay-pressed-soft)',
      'var(--color-overlay-pressed-soft)',
    ],
  },
});
