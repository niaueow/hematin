# DESIGN.md — Design System & Components

Short rules for building the dashboard UI so every component looks like Figma and is **used the same way everywhere**.

- **Figma is the source of truth** for how things look. This file is the source of truth for **component names and props**.
- Names here are working names. Rename freely, but rename here first, then in code.
- 🆕 = designed in this file using the existing tokens, not in Figma yet. Add it to Figma when you have time, then sync the values here.

---

## 1. Tokens

Files:
- `web/src/styles/tokens.css`: the Figma export (colors, fonts, shadows). Paste new exports here; don't hand-edit values.
- `web/src/styles/tokens.fixes.css`: the fixes below, loaded **after** `tokens.css`.

| Group | Prefix | Examples | Use in components? |
|---|---|---|---|
| Primitive colors | `--brand-*`, `--system-{positive,warning,negative}-*`, `--neutral-*` | `--brand-500` | ❌ Never directly. Only semantic tokens use them |
| Semantic colors | `--content-*`, `--background-*`, `--stroke-*`, `--surface-l0…l6` | `--background-brand-active` | ✅ Always |
| Typography | `--{heading,body,caption}-*` | `--body-body-2-font-size` | ✅ Via the text classes in §2 |
| Shadows | `--shadow-l0…l6-box-shadow` | `--shadow-l2-box-shadow` | ✅ |
| Radius | `--radius-8/12/16/24/full` | | ✅ |
| Spacing | `--space-spacing-0…24` | `--space-spacing-16` | ✅ |

**Theme:** light is the default. Dark mode = `<html data-semantic-mode="dark">`.

### `tokens.fixes.css` (what's missing or broken in the current export)
1. **Radius and spacing** (missing from the export, used by every component):
   `--radius-8: 8px; --radius-12: 12px; --radius-16: 16px; --radius-24: 24px; --radius-full: 999px;`
   `--space-spacing-{0,2,4,8,10,12,14,16,24}` = the same number in px.
2. **Letter spacing** (missing): `0.01em` for every text style, except caption-3 = `0`.
3. **Font family:** Figma exports PostScript names (`PlusJakartaSans-SemiBold`) that browsers can't find. Load **Plus Jakarta Sans** (400, 500, 600, 800) from Google Fonts and set every `--*-font-family` to `"Plus Jakarta Sans", sans-serif`. The weight token picks the weight.
4. **Overlay cycle:** the semantic block has `--overlay-50: var(--overlay-50)`, which is a cycle, so the variable becomes invalid. Rename the primitives to `--neutral-overlay-50` / `--neutral-overlay-50-inverse` and point the semantic tokens at them.
5. 🆕 **Negative hover** (for the danger button; there's no semantic token yet):
   light `--background-system-hover-negative: var(--system-negative-600);`
   dark `--background-system-hover-negative: var(--system-negative-300);`
6. Don't use `--shadow-cobain-*` or `--shadow-show-ui-*`. They look like scratch styles.

### As built (M12)
- **The export is JSON** (`PRIMITIVE.json`, `SEMANTIC.JSON`, `RADIUS.JSON`, W3C design-token format, kept in the gitignored `figma-token/`). `npm run tokens` (`scripts/tokens-from-figma.mjs`) turns it into `tokens.css` with the names Figma's CSS export uses (`Background / Brand Active` → `--background-brand-active`, `{Neutral.900}` → `var(--neutral-900)`). It reproduces the export as-is, overlay cycle included; the fixes stay in `tokens.fixes.css`.
- **This export has light-mode semantics only.** `data-semantic-mode` is set from `prefers-color-scheme` (`web/src/theme.ts`), but there are no dark values yet, so dark mode looks light. Fix 5's dark value is in place. To add dark mode, export the dark semantic collection and generate a `[data-semantic-mode='dark']` block.
- **No text styles or shadows in this export.** The typography tokens (`--body-body-2-font-size` etc.) are in `tokens.fixes.css`, from the §2 table. Shadows are for Toast/Dialog (§4.5), not built yet.
- **Radius is in this export** (fix 1 says it was missing), but `Radius Full` is 99px. `tokens.fixes.css` still sets the five radius tokens, with `--radius-full: 999px`.
- **Fonts:** Plus Jakarta Sans 400/500/600/800 from Google Fonts (`web/index.html`), allowed by the CSP in `vercel.json` (SECURITY §6). Text styles: `web/src/styles/typography.css`; base rules: `base.css`; motion tokens `--motion-color` (150ms) and `--motion-enter` (200ms).
- **The colour lint:** `npm run lint` also runs stylelint (`stylelint.config.mjs`): no hex, `rgb()`/`hsl()`/…, or named colours in `.vue` files or `web/src/styles`, except the two token files.

## 2. Typography

Font: **Plus Jakarta Sans**. Line height `normal` everywhere (matches Figma "Auto").

| Class | Token group | Size | Weight |
|---|---|---|---|
| `.text-h1` | `heading-heading-1` | 40 | 600 |
| `.text-h2` | `heading-heading-2` | 32 | 600 |
| `.text-h3` | `heading-heading-3` | 24 | 600 |
| `.text-body-1` / `.text-body-1-bold` | `body-body-1(-bold)` | 20 | 500 / 600 |
| `.text-body-2` / `.text-body-2-bold` | `body-body-2(-bold)` | 16 | 500 / 600 |
| `.text-body-3` / `.text-body-3-bold` | `body-body-3(-bold)` | 14 | 500 / 600 |
| `.text-caption-1` | `caption-caption-1` | 14 | 400 |
| `.text-caption-2` | `caption-caption-2` | 12 | 400 |
| `.text-caption-3` | `caption-caption-3` | 10 | 400 |

Each class sets family, size, weight, line height, and letter spacing together. Don't set `font-size` on its own anywhere.

Money amounts also get `font-variant-numeric: tabular-nums` so digits don't jump around.

## 3. Global rules

1. **Tokens only.** No hex, rgb, or px values in components, except `0`, `1px`/`2px` borders, and the fixed heights/icon sizes written in this file.
2. **Figma widths are not code widths.** Figma uses fixed widths (input 250px, sidebar 800px tall). In code, inputs fill their container and the sidebar is full viewport height.
3. **Icons: Lucide** via the `@lucide/vue` package. Import each icon as a component (`import { House } from '@lucide/vue'`), so only the icons you use end up in the bundle.
   - Sizes are only **16, 20, or 24** (`:size="20"`). Use one stroke width everywhere (Lucide default `2`, unless Figma uses another).
   - Color = `currentColor` (Lucide's default), so icons follow the text color of their state automatically.
   - Icons are passed to components as **components**, never strings or raw SVG.
   - "Filled" icons (e.g. the active tab, `home-fill` in Figma): see Lucide's "Filled icons" guide for `@lucide/vue`.
   - ⚠ Check: the Figma icon names (`home-fill`, `add`, `info`…) aren't all Lucide names (`-fill` names are typical of other sets like Remix Icon). If the Figma icons aren't Lucide, either swap them to Lucide in Figma, or accept small visual differences.
4. **States come from interaction, not props.** Hover, focus, and pressed come from CSS (`:hover`, `:focus-visible`, `:active`). Only `disabled`, `error`, and `loading` are props.
5. **Hover only on devices that hover**: wrap hover styles in `@media (hover: hover)` so phones don't get stuck in hover.
6. **Focus must be visible**: `outline: 2px solid var(--stroke-focus); outline-offset: 2px` on `:focus-visible`, for every interactive component.
7. **Breakpoint: 1024px.** Below = mobile layout with the bottom navbar. From 1024px up = desktop with the sidebar.
8. **Motion:** 150ms ease-out for color changes, 200ms for things that enter/leave (toast, dialog). Turn animations off under `prefers-reduced-motion`.

---

### As built (M12)
- **Icons:** `@lucide/vue` (`lucide-vue-next` is deprecated). Lucide doesn't officially support filled icons. Its guide sets `fill` (here `fill="currentColor"`) with `stroke-width="0"`, which works for some icons only. Check each filled icon (the bottom navbar's active tab) against Figma when it's built.
- **Focus (rule 6) on inputs:** the field shows the 2px `--stroke-focus` outline for keyboard focus, on top of the focus border from §4.2.
- **`data-force-state="hover|pressed|focus"`:** Button and Input honour it so `/playground` can show interaction states side by side. Only the playground uses it; pages never do.

## 4. Components

Same pattern for each component: **Props** (the API, which must stay consistent) → **Sizes** → **States** → **Usage**.

Common icon props for **Button, Input, Chip, Alert, and nav items**:

| Prop | Type | Default | Notes |
|---|---|---|---|
| `leadingIcon` | `Component` | — | Icon on the **left** of the text. Omit = no icon, no gap |
| `trailingIcon` | `Component` | — | Icon on the **right** of the text. Omit = no icon, no gap |

You can use either one, both, or none. The `gap` only appears between elements that exist (flex `gap` handles this automatically).

Common tone values for **Chip, Alert, and Toast**: `'positive' | 'warning' | 'negative' | 'info' | 'neutral'`.

---

### 4.1 Button — `AppButton.vue`

Figma: `Style=Primary, Size=Large|Medium|Small, State=Default|Hover|Disable`

> Figma's property is called `Style`, but `style` is a reserved attribute in Vue, so it's called `variant` in code.

**Props**

| Prop | Type | Default | Notes |
|---|---|---|---|
| `variant` | `'primary' \| 'secondary' \| 'danger'` | `'primary'` | `secondary` and `danger` are 🆕 (needed for dialogs) |
| `size` | `'large' \| 'medium' \| 'small'` | `'medium'` | Same words as Figma |
| `leadingIcon` / `trailingIcon` | `Component` | — | See above |
| `disabled` | `boolean` | `false` | |
| `loading` | `boolean` | `false` | 🆕 Spinner (Lucide `LoaderCircle`, spinning) replaces the leading icon; the button keeps its width and ignores clicks |
| `block` | `boolean` | `false` | Full width (useful on mobile) |
| `type` | `'button' \| 'submit'` | `'button'` | Native button type |

Slot: `default` = the label text. Emits: `click` (never while `disabled` or `loading`).

**Sizes** (radius `--radius-16`, gap `--space-spacing-8` for all)

| Size | Height | Padding (y / x) | Text | Icon |
|---|---|---|---|---|
| large | 53px | 14 / 16 | `.text-body-1` | 20 |
| medium | 44px | 12 / 14 | `.text-body-2` | 20 |
| small | 34px | 8 / 12 | `.text-caption-1` | 16 |

**States**

| Variant | Default | Hover | Pressed (`:active`) | Text / icon |
|---|---|---|---|---|
| primary | `--background-brand-active` | `--background-brand-hover` | `--background-brand-clicked` | `--content-primary-inverse` |
| secondary 🆕 | `--background-light` + 1px border `--stroke-secondary` | `--background-hover` | `--background-disabled` | `--content-primary` |
| danger 🆕 | `--background-system-default-negative` | `--background-system-hover-negative` | same as hover | `--content-primary-inverse` |
| **any, disabled** | `--background-disabled` (no border) | — | — | `--content-disable` |

**Usage**
```vue
<AppButton size="large" block>Simpan</AppButton>
<AppButton size="small" :leading-icon="Plus">Tambah</AppButton>
<AppButton :trailing-icon="ArrowRight" :loading="saving">Lanjut</AppButton>
<AppButton variant="danger" :leading-icon="Trash2">Hapus</AppButton>
```

---

### 4.2 Input — `AppInput.vue`

Figma: `Style=Default, Size=Large|Medium|Small`, states Default (empty) / Filled / Disable.

**Anatomy:** label row (title · required `*` · info icon) → field (leading icon · text · trailing icon) → helper text.

**Props**

| Prop | Type | Default | Notes |
|---|---|---|---|
| `modelValue` | `string \| number` | — | Use with `v-model` |
| `size` | `'large' \| 'medium' \| 'small'` | `'medium'` | |
| `label` | `string` | — | Omit = no label row |
| `required` | `boolean` | `false` | Shows a red `*` next to the label |
| `info` | `string` | — | Tooltip text; shows the 16px info icon (Lucide `Info`). Omit = no icon |
| `placeholder` | `string` | — | |
| `helperText` | `string` | — | Small text under the field |
| `error` | `string` | — | Error message. Replaces `helperText` and switches to the error state |
| `leadingIcon` / `trailingIcon` | `Component` | — | Icon size 20 |
| `disabled` | `boolean` | `false` | |
| `type` | `'text' \| 'number' \| 'date' \| …` | `'text'` | Native input type |
| `inputmode` | `string` | — | e.g. `'numeric'` for money |
| `id` | `string` | auto | Auto-generated if omitted; ties the label to the input |

Emits: `update:modelValue`, `focus`, `blur`. Clicking the label focuses the input. The error message is linked with `aria-describedby`, and the input gets `aria-invalid="true"`.

**Sizes** (field: radius `--radius-16`, 1px border, gap `--space-spacing-16`; wrapper gap 4px; label row gap 4px)

| Size | Field height | Padding (y / x) | Label | Input text |
|---|---|---|---|---|
| large | 52px | 16 / 16 | `.text-body-2-bold` | `.text-body-2` |
| medium | 44px | 12 / 16 | `.text-body-3-bold` | `.text-body-3` |
| small | 36px | 8 / 16 | `.text-body-3-bold` | `.text-caption-1` |

Shared text colors: label `--content-primary`; `*` `--content-system-default-negative` (`.text-body-3`); helper text `.text-caption-3` in `--content-default`; placeholder `--content-default`.

**States** (the state is computed by the component, not passed as a prop; error wins over everything except disabled)

| State | When | Border | Background | Text | Helper text |
|---|---|---|---|---|---|
| default | empty | `--stroke-primary` | none | placeholder `--content-default` | `--content-default` |
| filled | has a value | `--stroke-secondary-inverse` | none | `--content-primary` | `--content-default` |
| focus | focused | `--stroke-focus` | none | `--content-primary` | `--content-default` |
| error | `error` set | `--stroke-system-negative` | none | `--content-primary` | `--content-system-default-negative` |
| disabled | `disabled` | none | `--background-disabled` | `--content-disable` | `--content-default` |

**Usage**
```vue
<AppInput v-model="note" label="Catatan" placeholder="cireng, gojek…" />
<AppInput v-model="date" label="Tanggal" type="date" :leading-icon="Calendar" required />
<AppInput v-model="amount" label="Nominal" inputmode="numeric"
          helper-text="Dalam rupiah" :error="errors.amount" />
```

> Money input = `AppInput` + a small wrapper (`AmountInput.vue`) that adds the `Rp` formatting and emits an **integer**. It doesn't change any of the looks above.

---

### 4.3 Chip — `AppChip.vue`

Figma: one size, color changes depending on use.

**Props**

| Prop | Type | Default | Notes |
|---|---|---|---|
| `tone` | tone | `'neutral'` | Picks a token pair, never a free color |
| `leadingIcon` / `trailingIcon` | `Component` | — | Icon size 16 |

Slot: `default` = label.

**Look:** radius `--radius-24`, padding 2 / 8, gap 4px, text `.text-caption-2`, height hugs content.

**Tones** (each tone = one background + one text color; icons follow the text color). This table is also the tone table for Alert and Toast.

| Tone | Subtle background | Text / icon | Default icon (Alert, Toast) | Used for |
|---|---|---|---|---|
| positive | `--background-system-subtle-positive` | `--content-system-default-positive` | `CircleCheck` | Nabung, "bonus nabung", under budget, success |
| warning | `--background-system-subtle-warning` | `--content-system-default-warning` | `TriangleAlert` | Jajan/wants, ≥ 80% used, CAUTION |
| negative | `--background-system-subtle-negative` | `--content-system-default-negative` | `CircleX` | Over budget, DENY, errors |
| info | `--background-system-subtle-info` | `--content-system-default-info` | `Info` | Pokok/needs, neutral info |
| neutral | `--background-hover` | `--content-gray` | `Info` | Plain labels, other categories |

**Bucket → tone** (use everywhere: chips, chart colors, meters): Pokok = `info`, Jajan = `warning`, Nabung = `positive`, Pemasukan = `neutral`.

> If you need a new color, **add a tone here first**. Don't pass colors as props, otherwise chips drift apart.

**Usage**
```vue
<AppChip tone="positive" :leading-icon="PiggyBank">Bonus nabung</AppChip>
<AppChip tone="negative">Over Rp12.000</AppChip>
```

---

### 4.4 Navigation (shared config)

Both navs read **one** list so desktop and mobile always show the same pages:

```ts
// web/src/nav.ts
import { House, ReceiptText, ChartPie, User } from '@lucide/vue'

export const NAV_ITEMS = [
  { key: 'home',  label: 'Home',      to: '/',          icon: House },
  { key: 'tx',    label: 'Transaksi', to: '/transaksi', icon: ReceiptText },
  { key: 'stats', label: 'Statistik', to: '/statistik', icon: ChartPie },
  { key: 'me',    label: 'Profil',    to: '/profil',    icon: User },
] as const
```
The active item comes from the current route. It's never passed by hand.

#### 4.4a Sidebar (desktop, ≥ 1024px) — `SideNav.vue` + `SideNavItem.vue`

Figma: `Expand=True|False`

**Props (SideNav)**

| Prop | Type | Default | Notes |
|---|---|---|---|
| `collapsed` | `boolean` | `false` | `v-model:collapsed`; the toggle icon (Lucide `PanelLeft`, 24px, next to the logo) flips it. Remember the choice in `localStorage` |
| `items` | `NavItem[]` | `NAV_ITEMS` | |
| `user` | `{ name: string; subtitle?: string; avatarUrl?: string; online?: boolean }` | — | Profile area. `subtitle` = Telegram `@username` (instead of email in Figma) |

Emits: `logout`.

**Container:** background `--background-light`; right border 1px `--stroke-primary`; padding `--space-spacing-12`; gap 24px; height 100vh. Width: **240px** expanded; collapsed = 42px item + 12px padding on each side (66px + border). Animate the width (200ms).

**Header:** logo mark "N" (Plus Jakarta Sans 800, 40px, `--content-brand-active`) + app name `.text-body-1` `--content-primary` (hidden when collapsed) + toggle icon.

**SideNavItem** (`icon`, `label`, `to`, `active` computed): height 36px, padding `--space-spacing-8`, gap `--space-spacing-8`, radius `--radius-8`, icon 20px, text `.text-caption-1`. Items stack with a gap of `--space-spacing-4` (expanded and collapsed).

| State | Background | Text / icon |
|---|---|---|
| default | `--background-light` | `--content-primary` |
| hover | `--background-hover` | `--content-primary` |
| active | `--background-brand-subtle` | `--content-brand-hover` |
| collapsed | icon only, centered, 42 × 36; the label becomes a tooltip | same as above |

**Profile area:** top border 1px `--stroke-primary`, padding 16 / 0, gap 16px. Avatar 48px round (`--radius-full`), Telegram photo or initials. Online dot 8px `--background-system-default-positive` at the bottom right. Name `.text-body-2` `--content-primary`. Subtitle `.text-caption-1` `--content-gray`, one line with ellipsis. Logout icon (Lucide `LogOut`) 24px. When collapsed, only the avatar shows.

> Figma cleanup notes (not design changes): the default tab uses `align-items: flex-end` (use `center`); the collapsed tab uses `--content-primary-inverse` as a background and `--radius-8` as a gap. In code, use `--background-light` and `--space-spacing-8`.

#### 4.4b Bottom navbar (mobile / Mini App, < 1024px) — `BottomNav.vue`

**Props:** `items: NavItem[]` (default `NAV_ITEMS`, **max 5**).

**Container:** background `--background-light`; radius `--radius-12 --radius-12 0 0`; padding 0 / `--space-spacing-24`; `justify-content: space-between`; plus `padding-bottom: env(safe-area-inset-bottom)` so it clears the iPhone home bar and Telegram.

**Item:** width 60px, padding 14 / 4, gap `--space-spacing-8`, icon 24px, label `.text-caption-2`, centered.

| State | Top border | Icon | Label |
|---|---|---|---|
| default | 2px **transparent** (keeps the height the same) | outline | `--content-gray` |
| active | 2px `--stroke-brand` | filled (Lucide filled style, §3 rule 3) | `--content-brand-active` |

---

#### As built (M13)
- **Code:** `web/src/nav.ts` (`NAV_ITEMS`, `isNavActive`), `SideNav.vue`, `SideNavItem.vue`, `BottomNav.vue`, `UserAvatar.vue`, `AppShell.vue` (the signed-in layout: sidebar from 1024px, bottom navbar below, `ToastHost`).
- **Logo mark:** "H" (for Hematin), not the "N" written above, which looks like a leftover from the Figma template. Change it here and in `SideNav.vue` if Figma says otherwise.
- **Collapsed sidebar:** the header stacks the mark above the toggle (42px wide). The collapsed state is stored per browser under `hematin.sidenav.collapsed`; without storage it just isn't remembered.
- **Profile area:** name = Telegram first name (else @username); subtitle = `@username`; photo = Telegram's `photo_url` inside the Mini App (display only), else initials. No presence data, so no online dot. The logout icon is hidden inside the Mini App (initData signs every request; nothing to sign out of).
- **Filled icons:** the active BottomNav icon gets `fill="currentColor"` (Lucide's filled-icon approach, §3 rule 3). Compare with Figma; some icons may need a different glyph.
- **Safe areas:** `--app-safe-bottom` (base.css) = the larger of `env(safe-area-inset-bottom)` and Telegram's `--tg-safe-area-inset-bottom` + `--tg-content-safe-area-inset-bottom` (Bot API 8.0+). Used by the BottomNav, the toast position and the dialog's bottom sheet. `--app-bottom-nav-height` is 77px.
- **Telegram back button:** one app-wide handler stack (`pushTelegramBack` in `web/src/telegram.ts`, `useTelegramBack`). The newest registration gets the press; the button shows while anything is registered. Pages with `meta.back` (the playground) go back; an open ConfirmDialog cancels. Needs Bot API 6.1+ (checked with `isVersionAtLeast`).

### 4.5 Feedback 🆕

Not in Figma yet. Built only from the existing tokens and the same proportions as the other components (radius 16, padding 12–16, Plus Jakarta Sans text styles).

#### 4.5a Toast — `AppToast.vue` + `useToast()`

Short message after an action ("Transaksi dihapus", with "Urungkan").

**API:** call `toast.show({ tone, message, actionLabel?, onAction?, duration? })` from anywhere via the `useToast()` composable. One `<ToastHost />` is mounted in the app layout.

| Option | Type | Default | Notes |
|---|---|---|---|
| `tone` | tone | `'neutral'` | Sets the icon and its color (tone table §4.3) |
| `message` | `string` | — | One line, max ~60 characters |
| `actionLabel` / `onAction` | `string` / `() => void` | — | e.g. "Urungkan" |
| `duration` | `number` (ms) | 4000, or 6000 with an action | `0` = stays until closed |

**Look:** background `--background-light`; 1px border `--stroke-primary`; radius `--radius-16`; shadow `--shadow-l3-box-shadow`; padding 12 / 16; gap 12px; max width 400px (mobile: full width minus 16px each side).
- Icon 20px in the tone's text color.
- Message `.text-body-3` `--content-primary`, flex 1.
- Action: text button, `.text-body-3-bold` `--content-brand-active` (hover `--content-brand-hover`), no background.
- Close: Lucide `X` 16px, `--content-gray`.

**Position:** mobile = bottom center, 16px **above** the bottom navbar; desktop = bottom right, 24px from the edges. New toasts stack upward, max 3. Enter = slide up 8px + fade (200ms).

**A11y:** host is `role="status"` / `aria-live="polite"`; negative tone uses `role="alert"`. Hovering or focusing pauses the timer.

#### 4.5b Alert — `AppAlert.vue`

Inline message inside a page ("Uang jajan bulan ini belum dicatat", "Jajan minggu ini lewat Rp12.000").

| Prop | Type | Default | Notes |
|---|---|---|---|
| `tone` | tone | `'info'` | |
| `title` | `string` | — | Optional bold first line |
| `leadingIcon` | `Component` | tone's default icon | Pass `null` to hide |
| `dismissible` | `boolean` | `false` | Shows `X`; emits `close` |

Slot: `default` = message; `action` = optional `AppButton size="small"`.

**Look:** background = tone's subtle background; 1px border `--stroke-system-{positive|warning|negative|info}` (neutral: `--stroke-secondary`); radius `--radius-16`; padding 12 / 16; gap 8px; icon 20px in the tone's text color. Title `.text-body-3-bold` `--content-primary`; message `.text-caption-1` `--content-primary`. Full width of its container.

#### 4.5c Empty state — `EmptyState.vue`

When a list or chart has no data ("Belum ada transaksi minggu ini").

| Prop | Type | Default | Notes |
|---|---|---|---|
| `icon` | `Component` | `Inbox` | Lucide icon |
| `title` | `string` | — | Required |
| `description` | `string` | — | Optional |
| `actionLabel` | `string` | — | Shows `AppButton size="medium"`; emits `action` |

**Look:** centered column, padding 24px. Icon 32px in a 64px circle (`--radius-full`) with background `--background-brand-subtle` and icon color `--content-brand-active`. Gaps: icon → title 16px, title → description 4px, text → button 16px. Title `.text-body-2-bold` `--content-primary`; description `.text-caption-1` `--content-gray`, max width 280px.

#### 4.5d Skeleton — `AppSkeleton.vue`

Placeholder while data loads. **Never show `Rp0` while loading.**

| Prop | Type | Default | Notes |
|---|---|---|---|
| `shape` | `'text' \| 'rect' \| 'circle'` | `'text'` | |
| `textClass` | `string` | `'text-body-3'` | For `text`: height = that style's line height, so it matches the real text |
| `width` / `height` | `string` | `100%` / — | e.g. `'60%'`, `'120px'` |

**Look:** background `--background-hover`; radius `--radius-8` (text, rect) or `--radius-full` (circle); shimmer = a moving gradient from `--background-hover` to `--background-disabled` and back, 1.2s loop, off under reduced motion. Each real component gets a skeleton with the same size and layout.

#### 4.5e Confirm dialog — `ConfirmDialog.vue`

Before destructive actions (delete transaction, logout from all devices).

| Prop | Type | Default | Notes |
|---|---|---|---|
| `open` | `boolean` | `false` | `v-model:open` |
| `title` | `string` | — | e.g. "Hapus transaksi?" |
| `message` | `string` | — | e.g. "Jajan cireng Rp10.000 bakal dihapus." |
| `confirmLabel` / `cancelLabel` | `string` | `'Ya, hapus'` / `'Batal'` | |
| `tone` | `'danger' \| 'default'` | `'danger'` | Confirm button = `danger` or `primary` variant |
| `loading` | `boolean` | `false` | Passed to the confirm button |

Emits: `confirm`, `cancel`.

**Look:** overlay `--overlay-50` (after fix #4). Panel: background `--background-light`; radius `--radius-16`; shadow `--shadow-l4-box-shadow`; padding 24px; width `min(400px, 100% − 32px)`; centered on desktop; on mobile, a bottom sheet with top radius only and safe-area padding. Title `.text-body-1-bold` `--content-primary`; message `.text-body-3` `--content-gray`, 8px below the title. Buttons 24px below the text, `size="medium"`: desktop = right-aligned row (cancel `secondary`, then confirm); mobile = stacked full width (confirm on top).

**Behavior:** Esc, an overlay click, or the Telegram back button = cancel. Focus is trapped inside and starts on **Batal** (safer default), then returns to the trigger on close.

---

## 5. Checklist for every new component

- [ ] Props use the same names as the Figma properties (except `style` → `variant`)
- [ ] Tokens only; no raw colors or arbitrary px
- [ ] Icons from Lucide via `leadingIcon` / `trailingIcon`; optional; sizes 16/20/24
- [ ] All states covered, plus `:focus-visible`
- [ ] Checked against Figma with the PerfectPixel extension at 100% zoom (🆕 components: check that they look like they belong next to the others)
- [ ] Added to this file

### 4.5 As built (M13)
- **Code:** `web/src/composables/useToast.ts` + `ToastHost.vue` + `AppToast.vue`, `AppAlert.vue`, `EmptyState.vue`, `AppSkeleton.vue`, `ConfirmDialog.vue`.
- **Toast:** `useToast().show()` returns an id; `dismiss(id)` closes it. The timer pauses on hover or focus and resumes with the time left. Newest at the bottom; a 4th toast drops the oldest.
- **Shadows:** this Figma export has none, so Toast and Dialog use `var(--shadow-l3-box-shadow, none)` / `--shadow-l4` with a `none` fallback until a shadow export lands.
- **Alert:** no live-region role (it's page content, not an announcement); Toast handles announcements.
- **ConfirmDialog:** `role="alertdialog"`, `aria-modal`, labelled by its title and described by its message. Confirm only emits `confirm`; the page closes it (so it can show `loading` first).

## 4.6 Playground (M12)

`/playground` (OWNER only; the router guard sends anyone else home) renders every variant × size × state of Button, Input and Chip, plus AmountInput, side by side, for the PerfectPixel check at 100% zoom. Since M13 it also has SideNav (expanded / collapsed), BottomNav, Toast (static, plus buttons that call `useToast`), Alert, EmptyState, Skeleton and ConfirmDialog. It replaces Storybook in the production-only setup. Add each new component there.

## 6. Decisions log

| # | Topic | Decision |
|---|---|---|
| 1 | Icon set | Lucide (`@lucide/vue`). Check that the Figma icons are Lucide too (§3 rule 3) |
| 2 | Icon size, large/medium buttons | 20px |
| 3 | Button pressed / focus | pressed = `--background-brand-clicked`; focus = §3 rule 6 |
| 4 | Input focus / error | border `--stroke-focus` / `--stroke-system-negative` + red helper text |
| 5 | Red text in the input label | Required `*` |
| 6 | Sidebar | 240px expanded; item gap 4px in both modes |
| 7 | Sidebar item hover | `--background-hover` |
| 8 | Breakpoint | 1024px |
| 9 | Bucket colors | Pokok = info, Jajan = warning, Nabung = positive, Pemasukan = neutral |
| 10 | Feedback components | Designed here from existing tokens (§4.5); add to Figma later |
| 11 | New button variants | `secondary`, `danger` (+ `loading` prop), needed by dialogs; add to Figma later |
| 12 | Loading button | Keeps its variant colours (not the disabled look), sets `aria-busy`, ignores clicks (M12) |
| 13 | AmountInput | Shows `Rp35.000` in the field itself and emits an integer or `null`; digits only (no "jt"/"rb" parsing), at most 12 digits (M12) |
