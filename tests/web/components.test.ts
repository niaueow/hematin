// @vitest-environment happy-dom
import { Plus, ArrowRight, Info } from '@lucide/vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import AmountInput from '@web/components/AmountInput.vue';
import AppButton from '@web/components/AppButton.vue';
import AppChip from '@web/components/AppChip.vue';
import AppInput from '@web/components/AppInput.vue';
import { parseRupiah } from '@web/lib/money';
import { BUCKET_TONE } from '@web/lib/tones';

// DESIGN.md §4.1–4.3: props → classes, the states each component computes, and the a11y wiring.

describe('AppButton', () => {
  it.each([
    [{}, ['app-button--primary', 'app-button--medium'], 'text-body-2'],
    [{ variant: 'secondary', size: 'large' }, ['app-button--secondary', 'app-button--large'], 'text-body-1'],
    [{ variant: 'danger', size: 'small' }, ['app-button--danger', 'app-button--small'], 'text-caption-1'],
  ] as const)('%j → %j, label %s', (props, classes, textClass) => {
    const wrapper = mount(AppButton, { props, slots: { default: 'Simpan' } });
    expect(wrapper.classes()).toEqual(expect.arrayContaining([...classes]));
    expect(wrapper.find('span').classes()).toContain(textClass);
    expect(wrapper.text()).toBe('Simpan');
    expect(wrapper.attributes('type')).toBe('button');
  });

  it('block makes it full width; type is passed through', () => {
    const wrapper = mount(AppButton, { props: { block: true, type: 'submit' } });
    expect(wrapper.classes()).toContain('app-button--block');
    expect(wrapper.attributes('type')).toBe('submit');
  });

  it('icons: 20px on large/medium, 16px on small; omitted → none', () => {
    const medium = mount(AppButton, { props: { leadingIcon: Plus, trailingIcon: ArrowRight } });
    expect(medium.findAll('svg').map((svg) => svg.attributes('width'))).toEqual(['20', '20']);
    const small = mount(AppButton, { props: { size: 'small', leadingIcon: Plus } });
    expect(small.find('svg').attributes('width')).toBe('16');
    expect(mount(AppButton).findAll('svg')).toHaveLength(0);
  });

  it('emits click when enabled', async () => {
    const wrapper = mount(AppButton);
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('disabled: native disabled, no click', async () => {
    const wrapper = mount(AppButton, { props: { disabled: true } });
    expect(wrapper.attributes('disabled')).toBeDefined();
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
  });

  it('loading: the spinner replaces the leading icon, aria-busy, no click, keeps its colours', async () => {
    const wrapper = mount(AppButton, { props: { loading: true, leadingIcon: Plus }, slots: { default: 'Lanjut' } });
    expect(wrapper.find('.app-button__spinner').exists()).toBe(true);
    expect(wrapper.findAll('svg')).toHaveLength(1);
    expect(wrapper.attributes('aria-busy')).toBe('true');
    expect(wrapper.attributes('disabled')).toBeUndefined(); // not the disabled look
    expect(wrapper.text()).toBe('Lanjut'); // label stays, so the width does too
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
  });
});

describe('AppInput', () => {
  const field = (wrapper: ReturnType<typeof mount>) => wrapper.find('.app-input');

  it.each([
    ['default (empty)', {}, 'is-default'],
    ['filled', { modelValue: 'cireng' }, 'is-filled'],
    ['filled with 0', { modelValue: 0 }, 'is-filled'],
    ['error', { modelValue: 'x', error: 'Wajib diisi' }, 'is-error'],
    ['error while empty', { error: 'Wajib diisi' }, 'is-error'],
    ['disabled', { modelValue: 'x', disabled: true }, 'is-disabled'],
    ['disabled wins over error', { error: 'x', disabled: true }, 'is-disabled'],
  ] as const)('state %s', (_name, props, state) => {
    expect(field(mount(AppInput, { props })).classes()).toContain(state);
  });

  it('focus while focused (unless there’s an error); back on blur', async () => {
    const wrapper = mount(AppInput, { props: { modelValue: 'x' } });
    await wrapper.find('input').trigger('focus');
    expect(field(wrapper).classes()).toContain('is-focus');
    expect(wrapper.emitted('focus')).toHaveLength(1);
    await wrapper.find('input').trigger('blur');
    expect(field(wrapper).classes()).toContain('is-filled');

    const withError = mount(AppInput, { props: { error: 'x' } });
    await withError.find('input').trigger('focus');
    expect(field(withError).classes()).toContain('is-error');
  });

  it('v-model: emits the typed string', async () => {
    const wrapper = mount(AppInput);
    await wrapper.find('input').setValue('gojek');
    expect(wrapper.emitted('update:modelValue')).toEqual([['gojek']]);
  });

  it('label row: the label is tied to the input; required star; info icon with its text', () => {
    const wrapper = mount(AppInput, { props: { label: 'Nominal', required: true, info: 'Dalam rupiah', id: 'amt' } });
    expect(wrapper.find('label').attributes('for')).toBe('amt');
    expect(wrapper.find('input').attributes('id')).toBe('amt');
    expect(wrapper.find('.app-input__required').text()).toBe('*');
    expect(wrapper.find('input').attributes('required')).toBeDefined();
    expect(wrapper.find('.app-input__info').attributes('aria-label')).toBe('Dalam rupiah');
    expect(mount(AppInput).find('.app-input__label-row').exists()).toBe(false);
  });

  it('an id is generated when not given', () => {
    const wrapper = mount(AppInput, { props: { label: 'Catatan' } });
    const id = wrapper.find('input').attributes('id');
    expect(id).toBeTruthy();
    expect(wrapper.find('label').attributes('for')).toBe(id);
  });

  it('helper text, replaced by the error, linked with aria-describedby; aria-invalid on error', () => {
    const helper = mount(AppInput, { props: { helperText: 'Dalam rupiah', id: 'a' } });
    expect(helper.find('.app-input__helper').text()).toBe('Dalam rupiah');
    expect(helper.find('input').attributes('aria-describedby')).toBe('a-hint');
    expect(helper.find('input').attributes('aria-invalid')).toBeUndefined();

    const error = mount(AppInput, { props: { helperText: 'Dalam rupiah', error: 'Wajib diisi', id: 'a' } });
    expect(error.find('#a-hint').text()).toBe('Wajib diisi');
    expect(error.find('input').attributes('aria-invalid')).toBe('true');
  });

  it.each([
    ['large', 'text-body-2-bold', 'text-body-2'],
    ['medium', 'text-body-3-bold', 'text-body-3'],
    ['small', 'text-body-3-bold', 'text-caption-1'],
  ] as const)('size %s: label %s, text %s', (size, label, text) => {
    const wrapper = mount(AppInput, { props: { size, label: 'L' } });
    expect(field(wrapper).classes()).toContain(`app-input--${size}`);
    expect(wrapper.find('label').classes()).toContain(label);
    expect(wrapper.find('input').classes()).toContain(text);
  });

  it('native attributes go to the <input>; class and data-* stay on the wrapper', () => {
    const wrapper = mount(AppInput, {
      attrs: { name: 'note', maxlength: '120', class: 'x', 'data-force-state': 'focus' },
    });
    expect(wrapper.find('input').attributes()).toMatchObject({ name: 'note', maxlength: '120' });
    expect(field(wrapper).classes()).toContain('x');
    expect(field(wrapper).attributes('data-force-state')).toBe('focus');
  });

  it('icons are 20px; the info icon is 16px', () => {
    const wrapper = mount(AppInput, { props: { leadingIcon: Info, trailingIcon: Info, label: 'L', info: 'i' } });
    expect(wrapper.findAll('svg').map((svg) => svg.attributes('width'))).toEqual(['16', '20', '20']);
  });

  it('disabled: the input is disabled', () => {
    expect(
      mount(AppInput, { props: { disabled: true } })
        .find('input')
        .attributes('disabled'),
    ).toBeDefined();
  });
});

describe('AmountInput', () => {
  it.each([
    ['35000', 35_000],
    ['Rp35.000', 35_000],
    ['Rp 1.500.000', 1_500_000],
    ['0035', 35],
    ['abc', null],
    ['', null],
    ['1'.repeat(20), 111_111_111_111], // capped at 12 digits: always a safe integer
  ])('typing %j emits %j (an integer, never a string)', async (typed, expected) => {
    const wrapper = mount(AmountInput);
    await wrapper.find('input').setValue(typed);
    const emitted = wrapper.emitted('update:modelValue') as [number | null][];
    expect(emitted.at(-1)).toEqual([expected]);
    if (expected !== null) expect(Number.isSafeInteger(expected)).toBe(true);
  });

  it('shows the value formatted (Rp35.000), right after typing too', async () => {
    const wrapper = mount(AmountInput, { props: { modelValue: 35_000 } });
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('Rp35.000');
    await wrapper.find('input').setValue('1500000');
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('Rp1.500.000');
    await wrapper.setProps({ modelValue: null });
    await nextTick();
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('');
  });

  it('looks like AppInput: numeric keyboard, its props passed through', () => {
    const wrapper = mount(AmountInput, { props: { label: 'Nominal', error: 'Wajib diisi', size: 'large' } });
    expect(wrapper.find('input').attributes('inputmode')).toBe('numeric');
    expect(wrapper.find('.app-input').classes()).toEqual(expect.arrayContaining(['app-input--large', 'is-error']));
    expect(wrapper.find('label').text()).toBe('Nominal');
  });

  it('parseRupiah', () => {
    expect(parseRupiah('Rp 12.000')).toBe(12_000);
    expect(parseRupiah('-5')).toBe(5); // no negative money in an amount field
    expect(parseRupiah('Rp')).toBeNull();
  });
});

describe('AppChip', () => {
  it.each(['positive', 'warning', 'negative', 'info', 'neutral'] as const)('tone %s', (tone) => {
    const wrapper = mount(AppChip, { props: { tone }, slots: { default: 'Label' } });
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['app-chip', `app-chip--${tone}`, 'text-caption-2']));
    expect(wrapper.text()).toBe('Label');
  });

  it('defaults to neutral; icons are 16px', () => {
    const wrapper = mount(AppChip, { props: { leadingIcon: Plus, trailingIcon: Plus } });
    expect(wrapper.classes()).toContain('app-chip--neutral');
    expect(wrapper.findAll('svg').map((svg) => svg.attributes('width'))).toEqual(['16', '16']);
  });

  it('bucket → tone: Pokok info, Jajan warning, Nabung positive, Pemasukan neutral', () => {
    expect(BUCKET_TONE).toEqual({ NEEDS: 'info', WANTS: 'warning', SAVINGS: 'positive', INCOME: 'neutral' });
  });
});
