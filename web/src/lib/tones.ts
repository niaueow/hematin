import { CircleCheck, CircleX, Info, TriangleAlert } from '@lucide/vue';
import type { Component } from 'vue';

/** DESIGN.md §4.3: the tones of Chip, Alert and Toast. Each picks a background + text colour pair. */
export type Tone = 'positive' | 'warning' | 'negative' | 'info' | 'neutral';

/** The one bucket → tone mapping, for chips, chart colours and meters. */
export const BUCKET_TONE = {
  NEEDS: 'info',
  WANTS: 'warning',
  SAVINGS: 'positive',
  INCOME: 'neutral',
} as const satisfies Record<'NEEDS' | 'WANTS' | 'SAVINGS' | 'INCOME', Tone>;

/** The default icon per tone (Alert, Toast). */
export const TONE_ICON: Readonly<Record<Tone, Component>> = {
  positive: CircleCheck,
  warning: TriangleAlert,
  negative: CircleX,
  info: Info,
  neutral: Info,
};
