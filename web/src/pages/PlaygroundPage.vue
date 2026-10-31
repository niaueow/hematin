<script setup lang="ts">
import {
  ArrowRight,
  CircleCheck,
  Calendar,
  Info,
  Inbox,
  PiggyBank,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from '@lucide/vue';
import { ref } from 'vue';
import AmountInput from '@web/components/AmountInput.vue';
import AppButton from '@web/components/AppButton.vue';
import AppChip from '@web/components/AppChip.vue';
import AppInput from '@web/components/AppInput.vue';
import AppAlert from '@web/components/AppAlert.vue';
import AppSkeleton from '@web/components/AppSkeleton.vue';
import AppToast from '@web/components/AppToast.vue';
import AppSheet from '@web/components/AppSheet.vue';
import BudgetMeter from '@web/components/BudgetMeter.vue';
import ChipButton from '@web/components/ChipButton.vue';
import SegmentedControl from '@web/components/SegmentedControl.vue';
import TxRow from '@web/components/TxRow.vue';
import type { Transaction } from '@web/api/dashboard';
import BottomNav from '@web/components/BottomNav.vue';
import ConfirmDialog from '@web/components/ConfirmDialog.vue';
import EmptyState from '@web/components/EmptyState.vue';
import SideNav from '@web/components/SideNav.vue';
import { useToast } from '@web/composables/useToast';
import type { Tone } from '@web/lib/tones';

// The component catalogue (OWNER only, see router.ts): every variant × size × state side by side, for checking
// against Figma with PerfectPixel at 100% zoom. Replaces Storybook in a production-only setup (D-021).
// Hover / pressed / focus are interaction states (DESIGN §3 rule 4); here they're forced with data-force-state,
// a hook the components honour only for this page.

const buttonVariants = ['primary', 'secondary', 'danger'] as const;
const sizes = ['large', 'medium', 'small'] as const;
const buttonStates = ['default', 'hover', 'pressed', 'focus', 'disabled', 'loading'] as const;
const inputStates = ['default', 'filled', 'focus', 'error', 'disabled'] as const;
const tones: Tone[] = ['positive', 'warning', 'negative', 'info', 'neutral'];

const amount = ref<number | null>(35_000);
const note = ref('');
const toast = useToast();
const segment = ref<'week' | 'month' | 'year'>('month');
const chipPressed = ref(true);
const sheetOpen = ref(false);
const demoTx = (
  type: Transaction['type'],
  amount: number,
  bucket: 'NEEDS' | 'WANTS' | 'SAVINGS' | 'INCOME',
  note: string | null,
): Transaction => ({
  id: `${type}-${bucket}`,
  type,
  amount,
  categoryId: bucket,
  category: {
    id: bucket,
    name: { NEEDS: 'Makan', WANTS: 'Jajan', SAVINGS: 'Nabung', INCOME: 'Uang Jajan' }[bucket],
    bucket,
    emoji: null,
  },
  note,
  date: '2026-11-11',
  occurredAt: '2026-11-11T05:00:00.000Z',
  source: 'BOT',
  parseMethod: 'RULE',
  createdAt: '2026-11-11T05:00:00.000Z',
});
const sideCollapsed = ref(false);
const dialog = ref<'danger' | 'default' | 'loading' | null>(null);
const showAlert = ref(true);
const demoUser = { name: 'Nia Putri', subtitle: '@niaputri', online: true };

function demoToast(tone: Tone) {
  if (tone === 'neutral') {
    toast.show({
      tone,
      message: 'Transaksi dihapus',
      actionLabel: 'Urungkan',
      onAction: () => toast.show({ tone: 'positive', message: 'Dikembalikan' }),
    });
  } else toast.show({ tone, message: `Toast ${tone}` });
}

const forced = (state: string) => (['hover', 'pressed', 'focus'].includes(state) ? state : undefined);
</script>

<template>
  <main class="playground">
    <header class="playground__header">
      <h1 class="text-h3">Playground</h1>
      <p class="text-caption-1 muted">DESIGN.md §4.1–4.3 · every variant × size × state</p>
    </header>

    <section class="block">
      <h2 class="text-body-1-bold">AppButton</h2>
      <div v-for="variant in buttonVariants" :key="variant" class="grid">
        <h3 class="text-body-3-bold grid__title">{{ variant }}</h3>
        <div class="grid__head text-caption-2 muted">size</div>
        <div v-for="state in buttonStates" :key="state" class="grid__head text-caption-2 muted">{{ state }}</div>
        <template v-for="size in sizes" :key="size">
          <div class="text-caption-2 muted">{{ size }}</div>
          <div v-for="state in buttonStates" :key="state">
            <AppButton
              :variant="variant"
              :size="size"
              :disabled="state === 'disabled'"
              :loading="state === 'loading'"
              :leading-icon="Plus"
              :data-force-state="forced(state)"
            >
              Button
            </AppButton>
          </div>
        </template>
      </div>
      <div class="row">
        <AppButton :trailing-icon="ArrowRight">Trailing icon</AppButton>
        <AppButton :leading-icon="Plus" :trailing-icon="ArrowRight">Both icons</AppButton>
        <AppButton>No icon</AppButton>
        <AppButton variant="danger" :leading-icon="Trash2">Hapus</AppButton>
      </div>
      <div class="row row--narrow">
        <AppButton block size="large">Block</AppButton>
      </div>
    </section>

    <section class="block">
      <h2 class="text-body-1-bold">AppInput</h2>
      <div class="grid grid--inputs">
        <div class="grid__head text-caption-2 muted">size</div>
        <div v-for="state in inputStates" :key="state" class="grid__head text-caption-2 muted">{{ state }}</div>
        <template v-for="size in sizes" :key="size">
          <div class="text-caption-2 muted">{{ size }}</div>
          <div v-for="state in inputStates" :key="state">
            <AppInput
              :size="size"
              label="Title"
              required
              info="Tooltip"
              placeholder="Placeholder"
              helper-text="Helper text"
              :model-value="state === 'filled' || state === 'error' ? 'Filled text' : ''"
              :error="state === 'error' ? 'Error message' : undefined"
              :disabled="state === 'disabled'"
              :leading-icon="Search"
              :trailing-icon="X"
              :data-force-state="forced(state)"
            />
          </div>
        </template>
      </div>
      <div class="row row--inputs">
        <AppInput v-model="note" label="Catatan" placeholder="cireng, gojek…" helper-text="Try typing" />
        <AppInput label="Tanggal" type="date" :leading-icon="Calendar" required model-value="2026-11-02" />
        <AmountInput v-model="amount" label="Nominal" helper-text="Dalam rupiah" />
        <p class="text-caption-1 muted">AmountInput emits: {{ amount === null ? 'null' : amount }}</p>
      </div>
    </section>

    <section class="block">
      <h2 class="text-body-1-bold">AppChip</h2>
      <div v-for="tone in tones" :key="tone" class="row">
        <span class="text-caption-2 muted label">{{ tone }}</span>
        <AppChip :tone="tone">Label</AppChip>
        <AppChip :tone="tone" :leading-icon="Info">Leading</AppChip>
        <AppChip :tone="tone" :trailing-icon="X">Trailing</AppChip>
      </div>
      <div class="row">
        <AppChip tone="positive" :leading-icon="PiggyBank">Bonus nabung</AppChip>
        <AppChip tone="negative">Over Rp12.000</AppChip>
        <AppChip tone="warning" :leading-icon="TriangleAlert">Jajan</AppChip>
        <AppChip tone="info" :leading-icon="CircleCheck">Pokok</AppChip>
      </div>
    </section>

    <section class="block">
      <h2 class="text-body-1-bold">Dashboard pieces (M14) 🆕</h2>
      <div class="row">
        <SegmentedControl
          v-model="segment"
          :options="[
            { value: 'week', label: 'Minggu' },
            { value: 'month', label: 'Bulan' },
            { value: 'year', label: 'Tahun' },
          ]"
          label="Periode"
        />
        <ChipButton :pressed="chipPressed" @click="chipPressed = !chipPressed">Pressed: {{ chipPressed }}</ChipButton>
        <ChipButton>Not pressed</ChipButton>
        <AppButton variant="secondary" size="small" @click="sheetOpen = true">Open AppSheet</AppButton>
      </div>
      <div class="column">
        <BudgetMeter label="Jajan (info → warning tone)" :value="50000" :max="110000" tone="warning" />
        <BudgetMeter label="Pokok" :value="30000" :max="499999" tone="info" />
        <BudgetMeter label="Over budget" :value="150000" :max="110000" tone="warning" />
        <BudgetMeter label="Tabungan" :value="5000" :max="400000" tone="positive" value-label="1% dari Rp400.000" />
      </div>
      <div class="column">
        <TxRow :tx="demoTx('EXPENSE', 10000, 'NEEDS', 'warteg')" editable />
        <TxRow :tx="demoTx('EXPENSE', 35000, 'WANTS', 'donat kentang yang namanya panjang sekali banget')" editable />
        <TxRow :tx="demoTx('SAVING', 200000, 'SAVINGS', null)" />
        <TxRow :tx="demoTx('INCOME', 2000000, 'INCOME', 'uang jajan')" />
      </div>
      <AppSheet v-model:open="sheetOpen" title="Tambah transaksi">
        <AppInput label="Catatan" placeholder="cireng, gojek…" />
        <AmountInput label="Nominal" />
        <template #footer>
          <AppButton variant="secondary" @click="sheetOpen = false">Batal</AppButton>
          <AppButton @click="sheetOpen = false">Simpan</AppButton>
        </template>
      </AppSheet>
    </section>

    <section class="block">
      <h2 class="text-body-1-bold">Navigation (DESIGN §4.4)</h2>
      <p class="text-caption-1 muted">
        SideNav (expanded / collapsed) and BottomNav, inside fixed frames. Active = the current route.
      </p>
      <div class="row row--top">
        <div class="frame frame--side"><SideNav :user="demoUser" /></div>
        <div class="frame frame--side"><SideNav collapsed :user="demoUser" /></div>
        <div class="frame frame--side"><SideNav v-model:collapsed="sideCollapsed" :user="{ name: 'Rani' }" /></div>
      </div>
      <div class="frame frame--bottom"><BottomNav /></div>
    </section>

    <section class="block">
      <h2 class="text-body-1-bold">AppToast + useToast (§4.5a)</h2>
      <div class="column">
        <AppToast v-for="tone in tones" :key="tone" :tone="tone" :message="`Toast ${tone}`" />
        <AppToast tone="neutral" message="Transaksi dihapus" action-label="Urungkan" />
      </div>
      <div class="row">
        <AppButton v-for="tone in tones" :key="tone" variant="secondary" size="small" @click="demoToast(tone)">
          show {{ tone }}
        </AppButton>
      </div>
    </section>

    <section class="block">
      <h2 class="text-body-1-bold">AppAlert (§4.5b)</h2>
      <div class="column">
        <AppAlert v-for="tone in tones" :key="tone" :tone="tone" :title="`Alert ${tone}`">
          Uang jajan bulan ini belum dicatat.
        </AppAlert>
        <AppAlert tone="warning" title="With action" dismissible>
          Jajan minggu ini lewat Rp12.000.
          <template #action><AppButton size="small">Lihat</AppButton></template>
        </AppAlert>
        <AppAlert tone="info" :leading-icon="null">No icon, no title.</AppAlert>
        <AppAlert v-if="showAlert" tone="positive" dismissible @close="showAlert = false">Dismiss me.</AppAlert>
      </div>
    </section>

    <section class="block">
      <h2 class="text-body-1-bold">EmptyState (§4.5c)</h2>
      <div class="row row--top">
        <div class="frame"><EmptyState title="Belum ada transaksi minggu ini" /></div>
        <div class="frame">
          <EmptyState
            :icon="Inbox"
            title="Belum ada transaksi"
            description="Catat lewat bot, misal “warteg 10k”, atau tambah di sini."
            action-label="Tambah transaksi"
          />
        </div>
      </div>
    </section>

    <section class="block">
      <h2 class="text-body-1-bold">AppSkeleton (§4.5d)</h2>
      <div class="column column--narrow">
        <AppSkeleton text-class="text-h3" width="60%" />
        <AppSkeleton />
        <AppSkeleton width="80%" />
        <div class="row">
          <AppSkeleton shape="circle" width="48px" />
          <AppSkeleton shape="rect" width="200px" height="48px" />
        </div>
      </div>
    </section>

    <section class="block">
      <h2 class="text-body-1-bold">ConfirmDialog (§4.5e)</h2>
      <p class="text-caption-1 muted">Bottom sheet below 1024px. Esc, the overlay, or Telegram's back button cancel.</p>
      <div class="row">
        <AppButton variant="danger" @click="dialog = 'danger'">Danger</AppButton>
        <AppButton variant="secondary" @click="dialog = 'default'">Default</AppButton>
        <AppButton variant="secondary" @click="dialog = 'loading'">Loading</AppButton>
      </div>
      <ConfirmDialog
        :open="dialog !== null"
        :title="dialog === 'default' ? 'Simpan perubahan?' : 'Hapus transaksi?'"
        :message="dialog === 'default' ? 'Kategorinya bakal diganti.' : 'Jajan cireng Rp10.000 bakal dihapus.'"
        :tone="dialog === 'default' ? 'default' : 'danger'"
        :confirm-label="dialog === 'default' ? 'Simpan' : 'Ya, hapus'"
        :loading="dialog === 'loading'"
        @update:open="(open) => (dialog = open ? dialog : null)"
        @confirm="dialog = null"
      />
    </section>
  </main>
</template>

<style scoped>
.frame {
  overflow: hidden;
  border: 1px dashed var(--stroke-secondary);
  border-radius: var(--radius-8);
}

.frame--side {
  height: 520px;
}

.frame--bottom {
  max-width: 400px;
}

.row--top {
  align-items: flex-start;
}

.column {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacing-8);
  max-width: 480px;
}

.column--narrow {
  max-width: 320px;
}

.playground {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacing-24);
  padding: var(--space-spacing-24);
}

.playground__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacing-4);
}

.muted {
  color: var(--content-gray);
}

.block {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacing-16);
  padding: var(--space-spacing-24);
  border: 1px solid var(--stroke-primary);
  border-radius: var(--radius-16);
  background: var(--background-light);
}

.grid {
  display: grid;
  grid-template-columns: 64px repeat(6, max-content);
  align-items: center;
  gap: var(--space-spacing-16) var(--space-spacing-24);
  overflow-x: auto;
}

.grid--inputs {
  grid-template-columns: 64px repeat(5, 250px);
}

.grid__title {
  grid-column: 1 / -1;
  text-transform: capitalize;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-spacing-16);
}

.row--narrow {
  max-width: 400px;
}

.row--inputs > * {
  width: 250px;
}

.label {
  width: 64px;
}
</style>
