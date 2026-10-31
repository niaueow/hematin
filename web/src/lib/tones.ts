/** DESIGN.md §4.3: the tones of Chip, Alert and Toast. Each picks a background + text colour pair. */
export type Tone = 'positive' | 'warning' | 'negative' | 'info' | 'neutral';

/** The one bucket → tone mapping, for chips, chart colours and meters. */
export const BUCKET_TONE = {
  NEEDS: 'info',
  WANTS: 'warning',
  SAVINGS: 'positive',
  INCOME: 'neutral',
} as const satisfies Record<'NEEDS' | 'WANTS' | 'SAVINGS' | 'INCOME', Tone>;
