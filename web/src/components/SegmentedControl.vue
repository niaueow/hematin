<script setup lang="ts" generic="T extends string">
// 🆕 One-of-a-few choice (period, transaction type). Built from the button tokens: the selected segment uses the
// brand subtle background and brand text, like the active SideNav item. Arrow keys move the choice.

const props = defineProps<{ modelValue: T; options: readonly { value: T; label: string }[]; label: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: T] }>();

function onKeydown(event: KeyboardEvent, index: number) {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!step) return;
  event.preventDefault();
  const next = props.options[(index + step + props.options.length) % props.options.length];
  if (!next) return;
  emit('update:modelValue', next.value);
  const group = (event.currentTarget as HTMLElement).parentElement;
  group?.querySelectorAll<HTMLElement>('button')[props.options.indexOf(next)]?.focus();
}
</script>

<template>
  <div class="segmented" role="radiogroup" :aria-label="label">
    <button
      v-for="(option, index) in options"
      :key="option.value"
      type="button"
      role="radio"
      class="segmented__option text-caption-1"
      :class="{ 'is-selected': option.value === modelValue }"
      :aria-checked="option.value === modelValue"
      :tabindex="option.value === modelValue ? 0 : -1"
      @click="emit('update:modelValue', option.value)"
      @keydown="onKeydown($event, index)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.segmented {
  display: inline-flex;
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
  gap: var(--space-spacing-4);
  padding: var(--space-spacing-4);
  border-radius: var(--radius-12);
  background: var(--background-hover);
}

.segmented__option {
  flex: none;
  height: 32px;
  padding: 0 var(--space-spacing-12);
  border: 0;
  border-radius: var(--radius-8);
  background: none;
  color: var(--content-gray);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background-color var(--motion-color),
    color var(--motion-color);
}

.segmented__option.is-selected {
  background: var(--background-light);
  color: var(--content-brand-active);
}
</style>
