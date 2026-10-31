<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import EmptyState from '@web/components/EmptyState.vue';
import { me } from '@web/session';

// Home. The budget cards (/api/budget/current) come in the next milestone.

const name = computed(() => me.value?.firstName?.trim() || 'kamu');
</script>

<template>
  <div class="shell-page">
    <h1 class="text-h3">Hai {{ name }} 👋</h1>
    <EmptyState
      title="Ringkasan budget segera hadir"
      description="Sementara, catat pengeluaran lewat bot ya. Sisa budget-mu ada di /sisa."
    />
    <RouterLink v-if="me?.role === 'OWNER'" to="/playground" class="text-body-3-bold shell-page__link">
      Playground komponen
    </RouterLink>
  </div>
</template>
