import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  type ChartOptions,
  type TooltipItem,
} from 'chart.js';
import { onBeforeUnmount, ref } from 'vue';
import { formatRupiah, formatRupiahShort } from '@web/lib/format';
import { BUCKET_TONE, type Tone } from '@web/lib/tones';

// Chart.js for the Statistik page (vue-chartjs). Only the pieces we use are registered (tree-shaking).
// Colours and the font are read from the CSS tokens at runtime (DESIGN §3 rule 1: no colours in code), and
// re-read when the theme changes, so charts follow light/dark like everything else.

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export type ChartTheme = {
  text: string;
  grid: string;
  font: string;
  surface: string;
  tone: Record<Tone, string>;
  expense: string;
};

/** The tokens behind each tone's colour (the same pairs as AppChip's text colour). */
const TONE_TOKEN: Readonly<Record<Tone, string>> = {
  positive: '--content-system-default-positive',
  warning: '--content-system-default-warning',
  negative: '--content-system-default-negative',
  info: '--content-system-default-info',
  neutral: '--content-gray',
};

export function readChartTheme(root: HTMLElement = document.documentElement): ChartTheme {
  const css = getComputedStyle(root);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    text: token('--content-gray'),
    grid: token('--stroke-primary'),
    font: token('--font-family-base') || 'sans-serif',
    surface: token('--background-light'),
    tone: Object.fromEntries(Object.entries(TONE_TOKEN).map(([tone, name]) => [tone, token(name)])) as Record<
      Tone,
      string
    >,
    expense: token('--content-brand-active'),
  };
}

/** The theme as a ref, re-read when <html data-semantic-mode> or the device's colour scheme changes. */
export function useChartTheme() {
  const theme = ref(readChartTheme());
  const refresh = () => (theme.value = readChartTheme());
  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-semantic-mode', 'class', 'style'],
  });
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', refresh);
  onBeforeUnmount(() => {
    observer.disconnect();
    media.removeEventListener('change', refresh);
  });
  return theme;
}

export const bucketColor = (theme: ChartTheme, bucket: keyof typeof BUCKET_TONE | null) =>
  theme.tone[bucket ? BUCKET_TONE[bucket] : 'neutral'];

/** A bar chart in rupiah: short amounts on the value axis (35rb, 1,2jt), full ones in the tooltip. */
export function barOptions(theme: ChartTheme, options: { horizontal?: boolean } = {}): ChartOptions<'bar'> {
  const valueAxis = options.horizontal ? 'x' : 'y';
  const font = { family: theme.font, size: 12 };
  return {
    indexAxis: options.horizontal ? 'y' : 'x',
    responsive: true,
    maintainAspectRatio: false,
    animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 200 },
    plugins: {
      legend: { display: false },
      tooltip: {
        titleFont: font,
        bodyFont: font,
        callbacks: { label: (item: TooltipItem<'bar'>) => formatRupiah(Number(item.raw)) },
      },
    },
    scales: {
      [valueAxis]: {
        beginAtZero: true,
        grid: { color: theme.grid },
        border: { display: false },
        ticks: {
          color: theme.text,
          font,
          callback: (value: string | number) => formatRupiahShort(Math.round(Number(value))),
        },
      },
      [valueAxis === 'x' ? 'y' : 'x']: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: theme.text, font },
      },
    },
  };
}

export function doughnutOptions(theme: ChartTheme): ChartOptions<'doughnut'> {
  const font = { family: theme.font, size: 12 };
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 200 },
    plugins: {
      legend: { position: 'bottom', labels: { color: theme.text, font, usePointStyle: true, boxWidth: 8 } },
      tooltip: {
        titleFont: font,
        bodyFont: font,
        callbacks: { label: (item: TooltipItem<'doughnut'>) => ` ${item.label}: ${formatRupiah(Number(item.raw))}` },
      },
    },
  };
}
