<script setup lang="ts">
import { ChartPie, ChevronLeft, ChevronRight, RefreshCw } from '@lucide/vue';
import { computed, onMounted, ref, watch } from 'vue';
import { Bar, Doughnut } from 'vue-chartjs';
import { useRoute, useRouter } from 'vue-router';
import { getBudget, getSummary, type BudgetCurrent, type Period, type Summary } from '@web/api/dashboard';
import AppAlert from '@web/components/AppAlert.vue';
import AppButton from '@web/components/AppButton.vue';
import AppSkeleton from '@web/components/AppSkeleton.vue';
import BudgetMeter from '@web/components/BudgetMeter.vue';
import EmptyState from '@web/components/EmptyState.vue';
import SegmentedControl from '@web/components/SegmentedControl.vue';
import { barOptions, bucketColor, doughnutOptions, useChartTheme } from '@web/lib/charts';
import { formatPercent, formatPeriod, formatRupiah, today } from '@web/lib/format';
import { BUCKET_LABEL, hasNext, isEmpty, PERIODS, readQuery, seriesLabels, shiftPeriod } from '@web/lib/statistik';
import { BUCKET_TONE } from '@web/lib/tones';

// Statistik (PRD D2): week / month / year in WIB, from /api/summary. The period and date live in the URL query.
// Colours come from the tokens (lib/charts.ts) and follow the theme. Savings progress is the current month's,
// from /api/budget/current (the budget engine is the only place targets are computed).

const route = useRoute();
const router = useRouter();
const theme = useChartTheme();

const view = computed(() => readQuery(route.query, today()));
const summary = ref<Summary | null>(null);
const budget = ref<BudgetCurrent | null>(null);
const failed = ref(false);
let request = 0;

async function load() {
  const id = ++request;
  failed.value = false;
  summary.value = null;
  try {
    const result = await getSummary(view.value.period, view.value.date);
    if (id === request) summary.value = result;
  } catch {
    if (id === request) failed.value = true;
  }
}

watch(view, () => void load(), { deep: true });
onMounted(() => {
  void load();
  getBudget()
    .then((b) => (budget.value = b))
    .catch(() => undefined);
});

function go(period: Period, date: string) {
  void router.replace({ query: { ...route.query, period, date } });
}
const setPeriod = (period: Period) => go(period, today());
const step = (n: number) => go(view.value.period, shiftPeriod(view.value.period, view.value.date, n));
const canGoNext = computed(() => hasNext(view.value.period, view.value.date, today()));

const spendData = computed(() => ({
  labels: summary.value ? seriesLabels(summary.value) : [],
  datasets: [
    {
      label: 'Pengeluaran',
      data: summary.value?.series.map((p) => p.expense) ?? [],
      backgroundColor: theme.value.expense,
      borderRadius: 6,
      maxBarThickness: 32,
    },
  ],
}));

const bucketData = computed(() => {
  const buckets = summary.value?.byBucket ?? [];
  return {
    labels: buckets.map((b) => BUCKET_LABEL[b.bucket]),
    datasets: [
      {
        data: buckets.map((b) => b.amount),
        backgroundColor: buckets.map((b) => bucketColor(theme.value, b.bucket)),
        borderColor: theme.value.surface,
        borderWidth: 2,
      },
    ],
  };
});

const categories = computed(() => summary.value?.byCategory.slice(0, 8) ?? []);
const categoryData = computed(() => ({
  labels: categories.value.map((c) => c.name ?? 'Tanpa kategori'),
  datasets: [
    {
      label: 'Total',
      data: categories.value.map((c) => c.amount),
      backgroundColor: categories.value.map((c) => bucketColor(theme.value, c.bucket)),
      borderRadius: 6,
      maxBarThickness: 24,
    },
  ],
}));

const spendOptions = computed(() => barOptions(theme.value));
const categoryOptions = computed(() => barOptions(theme.value, { horizontal: true }));
const bucketOptions = computed(() => doughnutOptions(theme.value));
const hasBuckets = computed(() => (summary.value?.byBucket ?? []).some((b) => b.amount > 0));
</script>

<template>
  <div class="shell-page statistik">
    <h1 class="text-h3">Statistik</h1>

    <div class="toolbar">
      <SegmentedControl :model-value="view.period" :options="PERIODS" label="Periode" @update:model-value="setPeriod" />
      <div class="toolbar__nav">
        <button type="button" class="icon-button" aria-label="Periode sebelumnya" @click="step(-1)">
          <ChevronLeft :size="20" aria-hidden="true" />
        </button>
        <span class="text-body-3-bold toolbar__label" aria-live="polite">
          {{ summary ? formatPeriod(summary.period, summary.range) : '…' }}
        </span>
        <button
          type="button"
          class="icon-button"
          aria-label="Periode berikutnya"
          :disabled="!canGoNext"
          @click="step(1)"
        >
          <ChevronRight :size="20" aria-hidden="true" />
        </button>
      </div>
    </div>

    <AppAlert v-if="failed" tone="negative" title="Gagal memuat statistik">
      Coba lagi bentar ya.
      <template #action
        ><AppButton size="small" :leading-icon="RefreshCw" @click="load">Muat ulang</AppButton></template
      >
    </AppAlert>

    <div v-else-if="!summary" class="grid">
      <AppSkeleton v-for="i in 3" :key="i" shape="rect" height="260px" />
    </div>

    <template v-else>
      <div class="totals">
        <div class="card total">
          <span class="text-caption-1 muted">Pemasukan</span>
          <span class="text-body-2-bold tabular-nums">{{ formatRupiah(summary.totals.income) }}</span>
        </div>
        <div class="card total">
          <span class="text-caption-1 muted">Pengeluaran</span>
          <span class="text-body-2-bold tabular-nums">{{ formatRupiah(summary.totals.expense) }}</span>
        </div>
        <div class="card total">
          <span class="text-caption-1 muted">Nabung</span>
          <span class="text-body-2-bold tabular-nums">{{ formatRupiah(summary.totals.saving) }}</span>
        </div>
      </div>

      <EmptyState
        v-if="isEmpty(summary)"
        :icon="ChartPie"
        title="Belum ada data di periode ini"
        description="Catat pengeluaran lewat bot, nanti grafiknya muncul di sini."
      />

      <div v-else class="grid">
        <section class="card chart-card chart-card--wide" aria-labelledby="spend-title">
          <h2 id="spend-title" class="text-body-2-bold">Pengeluaran</h2>
          <div class="chart chart--bar">
            <Bar :data="spendData" :options="spendOptions" aria-label="Grafik pengeluaran per waktu" role="img" />
          </div>
        </section>

        <section class="card chart-card" aria-labelledby="bucket-title">
          <h2 id="bucket-title" class="text-body-2-bold">Per pos</h2>
          <div v-if="hasBuckets" class="chart chart--doughnut">
            <Doughnut :data="bucketData" :options="bucketOptions" aria-label="Grafik pengeluaran per pos" role="img" />
          </div>
          <EmptyState v-else title="Belum ada pengeluaran" />
        </section>

        <section class="card chart-card" aria-labelledby="category-title">
          <h2 id="category-title" class="text-body-2-bold">Per kategori</h2>
          <div v-if="categories.length" class="chart" :style="{ height: `${Math.max(categories.length * 36, 120)}px` }">
            <Bar
              :data="categoryData"
              :options="categoryOptions"
              aria-label="Grafik pengeluaran per kategori"
              role="img"
            />
          </div>
          <EmptyState v-else title="Belum ada pengeluaran" />
        </section>

        <section class="card chart-card" aria-labelledby="savings-title">
          <h2 id="savings-title" class="text-body-2-bold">Tabungan bulan ini</h2>
          <template v-if="budget && budget.state === 'OK'">
            <p class="text-h3 tabular-nums">{{ formatRupiah(budget.savings.total) }}</p>
            <BudgetMeter
              label="Dari target"
              :value="budget.savings.total"
              :max="budget.savings.target"
              :tone="BUCKET_TONE.SAVINGS"
              :value-label="`${formatPercent(budget.savings.progressPct)} dari ${formatRupiah(budget.savings.target)}`"
            />
          </template>
          <p v-else-if="budget" class="text-body-3 muted">Target muncul setelah uang jajan bulan ini dicatat.</p>
          <AppSkeleton v-else shape="rect" height="48px" />
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.statistik {
  max-width: 1120px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-spacing-12);
}

.toolbar__nav {
  display: flex;
  align-items: center;
  gap: var(--space-spacing-8);
}

.toolbar__label {
  min-width: 140px;
  text-align: center;
  color: var(--content-primary);
}

.icon-button {
  display: inline-flex;
  padding: var(--space-spacing-8);
  border: 1px solid var(--stroke-secondary);
  border-radius: var(--radius-12);
  background: var(--background-light);
  color: var(--content-primary);
  cursor: pointer;
}

.icon-button:disabled {
  color: var(--content-disable);
  cursor: not-allowed;
}

.totals {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--space-spacing-8);
}

.total {
  gap: var(--space-spacing-4);
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-spacing-16);
}

@media (min-width: 1024px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .chart-card--wide {
    grid-column: 1 / -1;
  }
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacing-12);
  min-width: 0;
  padding: var(--space-spacing-16);
  border: 1px solid var(--stroke-primary);
  border-radius: var(--radius-16);
  background: var(--background-light);
}

.chart {
  position: relative;
  width: 100%;
}

.chart--bar {
  height: 240px;
}

.chart--doughnut {
  height: 260px;
}

.muted {
  color: var(--content-gray);
}
</style>
