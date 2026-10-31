<script setup lang="ts">
import { Info } from '@lucide/vue';
import { computed, ref, useAttrs, useId, type Component } from 'vue';

// DESIGN.md §4.2. The state (default / filled / focus / error / disabled) is computed here, never passed in:
// disabled wins, then error, then focus, then filled. Native attributes (name, autocomplete, maxlength…) go to
// the <input>; class, style and data-* stay on the wrapper.

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: string | number | null;
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
    type?: string;
    inputmode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'search' | 'url' | 'none';
    id?: string;
  }>(),
  { size: 'medium', required: false, disabled: false, type: 'text' },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
}>();

const attrs = useAttrs();
const wrapperAttrs = computed(() =>
  Object.fromEntries(
    Object.entries(attrs).filter(([key]) => key === 'class' || key === 'style' || key.startsWith('data-')),
  ),
);
const inputAttrs = computed(() =>
  Object.fromEntries(
    Object.entries(attrs).filter(([key]) => !(key === 'class' || key === 'style' || key.startsWith('data-'))),
  ),
);

const autoId = useId();
const inputId = computed(() => props.id ?? `input-${autoId}`);
const hintId = computed(() => `${inputId.value}-hint`);
const input = ref<HTMLInputElement | null>(null);
const focused = ref(false);

const hasValue = computed(
  () => props.modelValue !== undefined && props.modelValue !== null && String(props.modelValue) !== '',
);
const state = computed(() => {
  if (props.disabled) return 'disabled';
  if (props.error) return 'error';
  if (focused.value) return 'focus';
  return hasValue.value ? 'filled' : 'default';
});
const hint = computed(() => props.error || props.helperText || '');

const LABEL = { large: 'text-body-2-bold', medium: 'text-body-3-bold', small: 'text-body-3-bold' } as const;
const TEXT = { large: 'text-body-2', medium: 'text-body-3', small: 'text-caption-1' } as const;

function onFocus(event: FocusEvent) {
  focused.value = true;
  emit('focus', event);
}

function onBlur(event: FocusEvent) {
  focused.value = false;
  emit('blur', event);
}

defineExpose({ focus: () => input.value?.focus(), input });
</script>

<template>
  <div class="app-input" :class="[`app-input--${size}`, `is-${state}`]" v-bind="wrapperAttrs">
    <div v-if="label" class="app-input__label-row">
      <label :for="inputId" :class="LABEL[size]" class="app-input__label">{{ label }}</label>
      <span v-if="required" class="app-input__required text-body-3" aria-hidden="true">*</span>
      <span v-if="info" class="app-input__info" role="img" :aria-label="info" :title="info" tabindex="0">
        <Info :size="16" aria-hidden="true" />
      </span>
    </div>
    <div class="app-input__field" @click="input?.focus()">
      <component :is="leadingIcon" v-if="leadingIcon" :size="20" aria-hidden="true" class="app-input__icon" />
      <input
        :id="inputId"
        ref="input"
        v-bind="inputAttrs"
        class="app-input__control"
        :class="TEXT[size]"
        :type="type"
        :inputmode="inputmode"
        :value="modelValue ?? ''"
        :placeholder="placeholder"
        :disabled="disabled"
        :required="required"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="hint ? hintId : undefined"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @focus="onFocus"
        @blur="onBlur"
      />
      <component :is="trailingIcon" v-if="trailingIcon" :size="20" aria-hidden="true" class="app-input__icon" />
    </div>
    <p v-if="hint" :id="hintId" class="app-input__helper text-caption-3">{{ hint }}</p>
  </div>
</template>

<style scoped>
.app-input {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacing-4);
  width: 100%;
}

.app-input__label-row {
  display: flex;
  align-items: center;
  gap: var(--space-spacing-4);
}

.app-input__label {
  color: var(--content-primary);
}

.app-input__required {
  color: var(--content-system-default-negative);
}

.app-input__info {
  display: inline-flex;
  color: var(--content-default);
  cursor: help;
  border-radius: var(--radius-full);
}

.app-input__field {
  display: flex;
  align-items: center;
  gap: var(--space-spacing-16);
  border: 1px solid var(--stroke-primary);
  border-radius: var(--radius-16);
  background: none;
  color: var(--content-default);
  cursor: text;
  transition:
    border-color var(--motion-color),
    background-color var(--motion-color);
}

/* Sizes (fixed field heights from DESIGN §4.2; the 1px border is inside them) */
.app-input--large .app-input__field {
  height: 52px;
  padding: calc(var(--space-spacing-16) - 1px) calc(var(--space-spacing-16) - 1px);
}

.app-input--medium .app-input__field {
  height: 44px;
  padding: calc(var(--space-spacing-12) - 1px) calc(var(--space-spacing-16) - 1px);
}

.app-input--small .app-input__field {
  height: 36px;
  padding: calc(var(--space-spacing-8) - 1px) calc(var(--space-spacing-16) - 1px);
}

.app-input__control {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  outline: none;
  background: none;
  color: var(--content-primary);
}

.app-input__control::placeholder {
  color: var(--content-default);
  opacity: 1;
}

.app-input__icon {
  flex: none;
}

.app-input__helper {
  color: var(--content-default);
}

/* States. The field shows the focus ring itself, so the <input> has none (rule 6 is met by the border). */
.app-input.is-filled .app-input__field {
  border-color: var(--stroke-secondary-inverse);
  color: var(--content-primary);
}

.app-input.is-focus .app-input__field,
.app-input[data-force-state='focus'] .app-input__field {
  border-color: var(--stroke-focus);
  color: var(--content-primary);
}

.app-input.is-error .app-input__field {
  border-color: var(--stroke-system-negative);
  color: var(--content-primary);
}

.app-input.is-error .app-input__helper {
  color: var(--content-system-default-negative);
}

.app-input.is-disabled .app-input__field {
  border-color: transparent;
  background: var(--background-disabled);
  color: var(--content-disable);
  cursor: not-allowed;
}

.app-input.is-disabled .app-input__control,
.app-input.is-disabled .app-input__control::placeholder {
  color: var(--content-disable);
  cursor: not-allowed;
}

/* The field's focus ring follows rule 6 for keyboard users. */
.app-input__field:has(.app-input__control:focus-visible) {
  outline: 2px solid var(--stroke-focus);
  outline-offset: 2px;
}
</style>
