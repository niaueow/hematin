<script setup lang="ts">
import { computed, ref, type Component } from 'vue';
import AppInput from '@web/components/AppInput.vue';
import { formatRupiah, parseRupiah } from '@web/lib/format';

// DESIGN.md §4.2: AppInput + Rp formatting, emitting an integer number of rupiah (AGENTS.md rule 1), or null when
// empty. It looks exactly like AppInput. Only the digits count ("Rp 1.500.000" → 1500000); units like "jt" are
// the bot's job, not this field's.

const props = withDefaults(
  defineProps<{
    modelValue?: number | null;
    size?: 'large' | 'medium' | 'small';
    label?: string;
    required?: boolean;
    info?: string;
    placeholder?: string;
    helperText?: string;
    error?: string;
    leadingIcon?: Component;
    trailingIcon?: Component;
    disabled?: boolean;
    id?: string;
  }>(),
  { modelValue: null, size: 'medium', required: false, disabled: false, placeholder: 'Rp0' },
);

const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>();

const field = ref<InstanceType<typeof AppInput> | null>(null);
const display = computed(() => (props.modelValue === null ? '' : formatRupiah(props.modelValue)));

function onInput(text: string) {
  const value = parseRupiah(text);
  emit('update:modelValue', value);
  // Show the formatted value right away, even when the number didn't change (a letter was typed), caret at the end.
  const input = field.value?.input;
  if (input) {
    input.value = value === null ? '' : formatRupiah(value);
    input.setSelectionRange(input.value.length, input.value.length);
  }
}
</script>

<template>
  <AppInput
    :id="id"
    ref="field"
    :model-value="display"
    :size="size"
    :label="label"
    :required="required"
    :info="info"
    :placeholder="placeholder"
    :helper-text="helperText"
    :error="error"
    :leading-icon="leadingIcon"
    :trailing-icon="trailingIcon"
    :disabled="disabled"
    inputmode="numeric"
    autocomplete="off"
    class="tabular-nums"
    @update:model-value="onInput"
  />
</template>
