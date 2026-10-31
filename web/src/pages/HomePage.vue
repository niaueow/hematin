<script setup lang="ts">
import { ArrowRight, PiggyBank, RefreshCw } from '@lucide/vue';
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { getBudget, listTransactions, type BudgetCurrent, type Transaction } from '@web/api/dashboard';
import AppAlert from '@web/components/AppAlert.vue';
import AppButton from '@web/components/AppButton.vue';
import AppChip from '@web/components/AppChip.vue';
import AppSkeleton from '@web/components/AppSkeleton.vue';
import BudgetMeter from '@web/components/BudgetMeter.vue';
import EmptyState from '@web/components/EmptyState.vue';
import TxRow from '@web/components/TxRow.vue';
import { formatPercent, formatRupiah } from '@web/lib/format';
import { BUCKET_TONE } from '@web/lib/tones';
import { me } from '@web/session';

// Home (PRD D4): the /sisa numbers, from the same /api/budget/current (one source, so they always match the bot),
// plus the 5 latest transactions. Nothing here computes budget numbers.

const budget = ref<BudgetCurrent | null>(null);
const recent = ref<Transaction[] | null>(null);
const failed = ref(false);

async function load() {
  failed.value = false;
  try {
    const [b, page] = await Promise.all([getBudget(), listTransactions({ limit: 5 })]);
    budget.value = b;
    recent.value = page.items;
  } catch {
    failed.value = true;
  }
}
onMounted(load);

const name = computed(() => me.value?.firstName?.trim() || 'kamu');
const noBudget = computed(() => budget.value?.state === 'NO_BUDGET');
const wants = computed(() => budget.value?.wants);
const needs = computed(() => budget.value?.needs);
const savings = computed(() => budget.value?.savings);
</script>

<template>
  <div class="shell-page home">
    <h1 class="text-h3">Hai {{ name }} 👋</h1>

    <AppAlert v-if="failed" tone="negative" title="Gagal memuat">
      Coba lagi bentar ya.
      <template #action
        ><AppButton size="small" :leading-icon="RefreshCw" @click="load">Muat ulang</AppButton></template
      >
    </AppAlert>

    <AppAlert v-if="noBudget" tone="warning" title="Uang jajan bulan ini belum dicatat">
      Ketik misal "uang jajan 2jt" di bot. Sisa budget-mu muncul setelah itu.
    </AppAlert>

    <!-- Wants: the hero (BOT_SPEC /sisa lines 2–3) -->
    <section class="card hero" aria-labelledby="hero-title">
      <h2 id="hero-title" class="text-body-3-bold muted">Sisa jajan minggu ini</h2>
      <template v-if="wants && !noBudget">
        <p class="text-h1 tabular-nums" :class="{ negative: wants.week.remaining < 0 }">
          {{ formatRupiah(wants.week.remaining) }}
        </p>
        <p v-if="wants.week.remaining > 0" class="text-body-3">
          {{ formatRupiah(wants.dailyPace) }}/hari buat {{ budget?.segment.remainingDays }} hari lagi
        </p>
        <AppChip v-else-if="wants.week.remaining < 0" tone="negative">
          Lewat {{ formatRupiah(-wants.week.remaining) }}, jatah minggu depan kepotong
        </AppChip>
        <AppChip v-else tone="warning">Jatah jajan minggu ini udah abis</AppChip>
        <BudgetMeter
          label="Terpakai minggu ini"
          :value="wants.week.spent"
          :max="wants.week.allocation"
          :tone="BUCKET_TONE.WANTS"
        />
        <p class="text-caption-1 muted">
          Bulan ini: <span class="tabular-nums">{{ formatRupiah(wants.month.remaining) }}</span>
          <template v-if="wants.week.debtIn > 0">
            · udah dipotong utang <span class="tabular-nums">{{ formatRupiah(wants.week.debtIn) }}</span>
          </template>
        </p>
      </template>
      <template v-else-if="!budget && !failed">
        <AppSkeleton text-class="text-h1" width="60%" />
        <AppSkeleton width="50%" />
        <AppSkeleton shape="rect" height="8px" />
      </template>
      <p v-else-if="noBudget" class="text-body-3 muted">Belum bisa dihitung.</p>
    </section>

    <div class="cards">
      <!-- Needs (/sisa line 4) -->
      <section class="card" aria-labelledby="needs-title">
        <h2 id="needs-title" class="text-body-3-bold muted">Sisa pokok minggu ini</h2>
        <template v-if="needs && !noBudget">
          <p class="text-h3 tabular-nums" :class="{ negative: needs.week.remaining < 0 }">
            {{ formatRupiah(needs.week.remaining) }}
          </p>
          <BudgetMeter
            label="Terpakai bulan ini"
            :value="needs.month.spent"
            :max="needs.month.allocation"
            :tone="BUCKET_TONE.NEEDS"
          />
          <p class="text-caption-1 muted">
            Bulan ini: <span class="tabular-nums">{{ formatRupiah(needs.month.remaining) }}</span>
          </p>
        </template>
        <template v-else-if="!budget && !failed">
          <AppSkeleton text-class="text-h3" width="60%" />
          <AppSkeleton shape="rect" height="8px" />
        </template>
        <p v-else-if="noBudget" class="text-body-3 muted">Belum bisa dihitung.</p>
      </section>

      <!-- Savings (/sisa line 5) -->
      <section class="card" aria-labelledby="savings-title">
        <h2 id="savings-title" class="text-body-3-bold muted">Tabungan bulan ini</h2>
        <template v-if="savings && !noBudget">
          <p class="text-h3 tabular-nums">{{ formatRupiah(savings.total) }}</p>
          <BudgetMeter
            label="Dari target"
            :value="savings.total"
            :max="savings.target"
            :tone="BUCKET_TONE.SAVINGS"
            :value-label="`${formatPercent(savings.progressPct)} dari ${formatRupiah(savings.target)}`"
          />
          <AppChip v-if="savings.bonus > 0" tone="positive" :leading-icon="PiggyBank">
            Bonus nabung {{ formatRupiah(savings.bonus) }}
          </AppChip>
        </template>
        <template v-else-if="!budget && !failed">
          <AppSkeleton text-class="text-h3" width="60%" />
          <AppSkeleton shape="rect" height="8px" />
        </template>
        <p v-else-if="noBudget" class="text-body-3 muted">Target muncul setelah uang jajan dicatat.</p>
      </section>
    </div>

    <section class="card" aria-labelledby="recent-title">
      <div class="card__head">
        <h2 id="recent-title" class="text-body-2-bold">Transaksi terakhir</h2>
        <RouterLink to="/transaksi" class="text-body-3-bold link">
          Lihat semua <ArrowRight :size="16" aria-hidden="true" />
        </RouterLink>
      </div>
      <template v-if="recent">
        <TxRow v-for="tx in recent" :key="tx.id" :tx="tx" />
        <EmptyState
          v-if="recent.length === 0"
          title="Belum ada transaksi"
          description="Catat lewat bot, misal “warteg 10k”, atau tambah di halaman Transaksi."
        />
      </template>
      <template v-else-if="!failed">
        <AppSkeleton v-for="i in 5" :key="i" shape="rect" height="44px" />
      </template>
    </section>

    <RouterLink v-if="me?.role === 'OWNER'" to="/playground" class="text-caption-1 link"
      >Playground komponen</RouterLink
    >
  </div>
</template>

<style scoped>
.home {
  max-width: 960px;
}

.cards {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-spacing-16);
}

@media (min-width: 640px) {
  .cards {
    grid-template-columns: 1fr 1fr;
  }
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacing-8);
  padding: var(--space-spacing-16);
  border: 1px solid var(--stroke-primary);
  border-radius: var(--radius-16);
  background: var(--background-light);
}

.hero {
  gap: var(--space-spacing-12);
  padding: var(--space-spacing-24);
}

.card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-spacing-8);
}

.muted {
  color: var(--content-gray);
}

.negative {
  color: var(--content-system-default-negative);
}

.link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-spacing-4);
  color: var(--content-brand-active);
  text-decoration: none;
}
</style>
