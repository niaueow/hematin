<script setup lang="ts">
import { ReceiptText } from '@lucide/vue';
import EmptyState from '@web/components/EmptyState.vue';

// Placeholder: the transactions list and CRUD (/api/transactions) come in a later milestone.
</script>

<template>
  <div class="shell-page">
    <h1 class="text-h3">Transaksi</h1>
    <EmptyState
      :icon="ReceiptText"
      title="Daftar transaksi segera hadir"
      description="Nanti di sini kamu bisa lihat, ubah, dan hapus catatan."
    />
  </div>
</template>
