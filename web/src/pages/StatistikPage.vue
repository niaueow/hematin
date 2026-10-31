<script setup lang="ts">
import { ChartPie } from '@lucide/vue';
import EmptyState from '@web/components/EmptyState.vue';

// Placeholder: the charts (/api/summary) come in a later milestone.
</script>

<template>
  <div class="shell-page">
    <h1 class="text-h3">Statistik</h1>
    <EmptyState
      :icon="ChartPie"
      title="Grafik segera hadir"
      description="Nanti di sini ada pengeluaran per minggu, bulan, dan tahun."
    />
  </div>
</template>
