// ALL user-facing Indonesian strings live here (AGENTS.md rule 7). Tone: BOT_SPEC §5 (D-023).
// ≤ 5 lines, ≤ 2 emoji, 2–3 variants per message type, picked at random so it doesn't feel robotic.
// Messages are sent as plain text (no parse_mode), so user-provided names can't inject markup.
// TODO(M7+): daily reminder, recap.

import type { Bucket, BudgetSnapshot, PurchaseCheck } from '../budget/engine.js';
import { formatRupiah as rp } from '../lib/money.js';

type Random = () => number;

/** Picks one variant. `random` is injectable so tests are deterministic. */
export function pick<T>(variants: readonly T[], random: Random = Math.random): T {
  return variants[Math.floor(random() * variants.length)] as T;
}

/** A user's first name for greetings: trimmed and capped, never empty. */
export function displayName(firstName: string | null | undefined): string {
  const name = (firstName ?? '').replace(/\s+/g, ' ').trim().slice(0, 32);
  return name === '' ? 'kamu' : name;
}

// --- access (BOT_SPEC §1) ------------------------------------------------------------------------

/** The one canned reply for unknown users (BOT_SPEC §1). */
export const PRIVATE_BOT = 'Bot ini private, minta link undangan dulu ya 🙏';

/** Sent once in a group before the bot leaves (BOT_SPEC §1). */
export const PRIVATE_CHAT_ONLY = 'Pakai di chat pribadi ya 🙏 Aku cuma bisa dipakai di sana. Dadah!';

export const INVITE_INVALID =
  'Link undangannya udah ga berlaku (udah kepake atau kadaluarsa) 😕\nMinta link baru ke yang ngundang kamu ya.';

const ASK_INCOME =
  'Biar aku bisa ngitung budget-mu, catat dulu uang jajan bulan ini, misal "uang jajan 2jt".\nBelum dapet? Santai, catat aja pas udah masuk.';

export const welcomeOwner = (firstName: string | null, random?: Random) =>
  pick(
    [
      `Halo ${displayName(firstName)}! 👑 Kamu terdaftar sebagai owner Hematin.\nUndang temen pakai /invite.\n${ASK_INCOME}`,
      `Siap, bos ${displayName(firstName)}! 👑 Hematin udah jadi milikmu.\nMau ngajak temen? Ketik /invite.\n${ASK_INCOME}`,
    ],
    random,
  );

export const welcomeInvited = (firstName: string | null, random?: Random) =>
  pick(
    [
      `Halo ${displayName(firstName)}! 👋 Selamat datang di Hematin.\nAku bantu catat jajan & jaga budget 50/30/20-mu.\n${ASK_INCOME}`,
      `Yeay, ${displayName(firstName)} udah gabung Hematin! 🐷\nMulai sekarang tiap jajan lapor aku ya.\n${ASK_INCOME}`,
    ],
    random,
  );

export const welcomeBack = (firstName: string | null, random?: Random) =>
  pick(
    [
      `Halo lagi, ${displayName(firstName)}! 👋 Langsung ketik pengeluaranmu, misal "warteg 10k".\nCara pakai lengkap: /bantuan`,
      `${displayName(firstName)} balik lagi! 🐷 Catat aja kayak biasa, misal "gojek 18k".\nLupa caranya? /bantuan`,
    ],
    random,
  );

// --- help ----------------------------------------------------------------------------------------

export const HELP = [
  'Cara pakai Hematin 📒',
  '• Catat: "warteg 10k", "gojek 18k", "reksadana 200k"',
  '• Pemasukan: "uang jajan 2jt" · Sebelum jajan: "mau donat 35k"',
  '• /sisa sisa budget · /riwayat 10 terakhir · /undo batalin',
  '• /kategori daftar kategori · /dashboard buka dashboard',
].join('\n');

// --- invites (BOT_SPEC §1, D-006) ----------------------------------------------------------------

export const inviteCreated = (link: string, hours: number) =>
  `Link undangan (sekali pakai, berlaku ${hours} jam):\n${link}\nKirim langsung ke temenmu ya, jangan disebar di grup.`;

export const INVITE_OWNER_ONLY = 'Bikin undangan cuma bisa sama owner ya 🙏';

// --- limits & placeholders -----------------------------------------------------------------------

export const rateLimited = (random?: Random) =>
  pick(
    [
      'Woy, pelan-pelan 😅 Kebanyakan pesan dalam semenit. Tunggu bentar ya.',
      'Spam banget sih 😅 Istirahat semenit dulu, nanti lanjut lagi.',
    ],
    random,
  );

/** Commands from BotFather's list that later milestones implement. */
export const COMING_SOON = 'Fitur ini lagi disiapin, sabar ya 🙏 Sementara cek /bantuan dulu.';

// --- monthly income reminder (BOT_SPEC §4) -------------------------------------------------------

/**
 * 1st of the month ~10:00 WIB. Phrased conditionally ("kalau ada"): a month without recorded income isn't
 * assumed to have income, and logging stays open either way.
 */
export const INCOME_REMINDER = [
  'Pagi! 🌞 Udah tanggal 1, bulan baru nih.\nKalau bulan ini ada uang jajan atau pemasukan lain, catat ya biar aku bisa ngitung budget-mu.\nKetik aja, misal "uang jajan 2jt".',
  'Selamat pagi! Bulan baru, budget baru 📒\nKalau udah dapet uang jajan bulan ini, kabarin aku ya, misal "uang jajan 1,5jt".\nBelum dapet? Santai, catat aja pas udah masuk. Pengeluaran tetap bisa dicatat kayak biasa.',
  'Halo, tanggal 1 nih! 🙌\nBudget bulan ini baru bisa aku hitung kalau pemasukannya udah dicatat.\nKalau ada, ketik misal "uang saku 2jt". Kalau belum ada, gapapa, nanti aja.',
] as const;

export const incomeReminder = (random?: Random) => pick(INCOME_REMINDER, random);

/** On the first message of a month that has no income yet (PRD F12). Conditional, like INCOME_REMINDER. */
export const incomeNudge = (random?: Random) =>
  pick(
    [
      'Btw, uang jajan bulan ini belum dicatat 👀\nKalau udah dapet, ketik misal "uang jajan 2jt" biar aku bisa ngitung budget-mu.',
      'Psst, pemasukan bulan ini belum ada 📒\nKalau udah masuk, catat ya, misal "uang jajan 1,5jt". Belum dapet? Santai.',
    ],
    random,
  );

// --- shared formatting ---------------------------------------------------------------------------

/** How a bucket is called in replies: "Makan Rp10.000 (pokok)". */
export const BUCKET_LABEL: Readonly<Record<Bucket, string>> = {
  NEEDS: 'pokok',
  WANTS: 'jajan',
  SAVINGS: 'nabung',
  INCOME: 'pemasukan',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** "2026-10-31" → "31 Okt". Reads the WIB calendar date string; no clock or time zone involved. */
export function formatDate(date: string): string {
  const [, month, day] = date.split('-').map(Number) as [number, number, number];
  return `${day} ${MONTHS[month - 1] ?? ''}`;
}

/** A segment's dates (always within one month): "2–8 Nov", or "1 Nov" for a one-day segment. */
export function formatDayRange(start: string, end: string): string {
  return start === end ? formatDate(start) : `${Number(start.slice(8))}–${formatDate(end)}`;
}

/** What replies need to know about a transaction. */
export type TxSummary = {
  type: 'INCOME' | 'EXPENSE' | 'SAVING';
  amount: number;
  categoryName: string | null;
  note: string | null;
  /** WIB date, "YYYY-MM-DD". */
  localDate: string;
};

/** Its category name, or a word for its type (income may have no category). */
function txLabel(tx: Pick<TxSummary, 'type' | 'categoryName'>): string {
  if (tx.categoryName) return tx.categoryName;
  return tx.type === 'INCOME' ? 'Pemasukan' : tx.type === 'SAVING' ? 'Nabung' : 'Pengeluaran';
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** "Makan Rp10.000 · warteg · 31 Okt". Income gets a "+". */
export function describeTx(tx: TxSummary): string {
  const amount = tx.type === 'INCOME' ? `+${rp(tx.amount)}` : rp(tx.amount);
  const note = tx.note ? ` · ${clip(tx.note, 30)}` : '';
  return `${txLabel(tx)} ${amount}${note} · ${formatDate(tx.localDate)}`;
}

// --- buttons -------------------------------------------------------------------------------------

export const BUTTON = {
  changeCategory: '✏️ Ganti kategori',
  undo: '↩️ Undo',
  confirmDelete: '🗑 Ya, hapus',
  cancel: 'Batal',
  amountYes: (amount: number) => `✅ Iya, ${rp(amount)}`,
  amountNo: '❌ Bukan',
  category: (name: string, bucket: Bucket) => `${name} · ${BUCKET_LABEL[bucket]}`,
  historyDelete: (index: number, tx: TxSummary) => `🗑 ${index}. ${txLabel(tx)} ${rp(tx.amount)}`,
  buy: (emoji: string) => `${emoji} Jadi beli`,
  skip: '💪 Ga jadi',
  log: '📝 Catat',
} as const;

// --- logging (BOT_SPEC §2, §3) -------------------------------------------------------------------

/** A log without an amount ("warteg"). BOT_SPEC §2.1. */
export const askAmount = (random?: Random) =>
  pick(
    ['Berapa duitnya? 🤔 Ketik nominalnya aja, misal "15k".', 'Berapa? Kirim nominalnya aja ya, misal "15rb".'],
    random,
  );

/** No amount and nothing recognizable (BOT_SPEC §2.2 UNKNOWN). */
export const SHORT_HELP =
  'Hmm, aku ga nangkep 😅 Coba ketik "warteg 10k" atau "uang jajan 2jt".\nCara lengkap: /bantuan';

export const ONE_AT_A_TIME =
  'Ada lebih dari satu nominal nih 😅 Kirim satu-satu ya, misal "kopi 20k" dulu, terus "roti 15k".';

export const amountOutOfRange = (amount: number) =>
  `${rp(amount)}? Kayaknya salah ketik deh 😅\nAku cuma bisa catat Rp1 sampai Rp100.000.000. Ketik ulang ya.`;

/** A bare number under 1.000 ("kopi 20"): does it mean thousands? (BOT_SPEC §2.1) */
export const confirmAmount = (candidate: number) => `Maksudnya ${rp(candidate)}?`;

export const AMOUNT_RETYPE = 'Oke, ketik ulang lengkap sama nominalnya ya, misal "kopi 20k".';

/** No category found (BOT_SPEC §2.3 step 4). Messages are plain text, so the user's item is safe here. */
export const pickCategory = (item: string, amount: number) =>
  item === ''
    ? `${rp(amount)} buat apa? Pilih kategorinya ya 🤔`
    : `"${clip(item, 40)}" ${rp(amount)} masuk kategori apa? 🤔\nNanti aku inget buat berikutnya.`;

export const PICK_CANCELLED = 'Oke, ga jadi dicatat.';

/** An old or already-used button (pending questions last 10 minutes). */
export const EXPIRED = 'Udah kadaluarsa, ketik ulang aja ya.';

const NO_BUDGET_LINE = 'Sisa budget belum bisa dihitung: uang jajan bulan ini belum dicatat.';

/** BOT_SPEC §3.1: what was recorded, what's left this week, and one neutral line when over budget. */
export function expenseLogged(category: { name: string; bucket: Bucket }, amount: number, snap: BudgetSnapshot) {
  const lines = [`✅ Dicatat: ${category.name} ${rp(amount)} (${BUCKET_LABEL[category.bucket]})`];
  if (snap.state === 'NO_BUDGET') lines.push(NO_BUDGET_LINE);
  else if (category.bucket === 'WANTS') {
    lines.push(`Sisa jajan minggu ini: ${rp(snap.wants.remainingWeek)}`);
    if (snap.wants.remainingWeek < 0)
      lines.push(`Jajan minggu ini lewat ${rp(-snap.wants.remainingWeek)}, nanti dipotong dari jatah minggu depan ya.`);
  } else {
    lines.push(`Sisa pokok minggu ini: ${rp(snap.needs.remainingWeek)}`);
    if (snap.needs.remainingMonth < 0)
      lines.push(`Pokok bulan ini udah lewat ${rp(-snap.needs.remainingMonth)}, pelan-pelan ya.`);
  }
  return lines.join('\n');
}

/** BOT_SPEC §3.3: the income and the month's new split. */
export function incomeLogged(categoryName: string | null, amount: number, snap: BudgetSnapshot) {
  const lines = [`💰 ${categoryName ?? 'Pemasukan'} ${rp(amount)} masuk!`];
  if (snap.state === 'OK') {
    const { needsMonth, wantsMonth, savingsTarget } = snap.month;
    const { remainingWeek, dailyPace } = snap.wants;
    lines.push(`Bulan ini: pokok ${rp(needsMonth)} · jajan ${rp(wantsMonth)} · nabung ${rp(savingsTarget)}`);
    lines.push(`Jatah jajan minggu ini: ${rp(remainingWeek)}${remainingWeek > 0 ? ` (${rp(dailyPace)}/hari)` : ''}`);
  }
  return lines.join('\n');
}

/** BOT_SPEC §3.4: the saving and progress toward this month's target (recorded + bonus, BUDGET_RULES §7). */
export function savingLogged(amount: number, snap: BudgetSnapshot) {
  const { total, progressPct, target } = snap.savings;
  if (snap.state === 'NO_BUDGET' || target === 0)
    return `🐷 Nabung ${rp(amount)}! Target tabungan muncul setelah uang jajan bulan ini dicatat.`;
  return `🐷 Nabung ${rp(amount)}! Tabungan bulan ini ${progressPct}% dari target (${rp(total)}/${rp(target)}).`;
}

// --- changing and deleting -----------------------------------------------------------------------

export const PICK_NEW_CATEGORY = 'Pilih kategori yang bener';
export const CATEGORY_CHANGED = 'Kategori diganti ✅';
export const CATEGORY_UNAVAILABLE = 'Kategori itu ga bisa dipakai di sini.';
export const TX_NOT_FOUND = 'Catatan ini udah ga ada.';

// --- purchase check: "mau X" (BOT_SPEC §3.2, §5; BUDGET_RULES §6) --------------------------------

/** The emoji on "Jadi beli" and in the replies: 🍩 for a donut, otherwise a generic 🛒 (BOT_SPEC §3.2). */
export const itemEmoji = (item: string) => (/\b(donat|donut)s?\b/.test(item) ? '🍩' : '🛒');

export type VerdictContext = {
  check: PurchaseCheck;
  item: string;
  /** When the current segment ends: "Minggu", or a date when the month ends mid-week ("30 Nov"). */
  until: string;
  /** The segment ends on a Sunday, so the next allocation starts on Monday. */
  endsOnSunday: boolean;
};

/** "buat 4 hari", or "buat hari ini" on the segment's last day. */
const forDays = (days: number) => (days > 0 ? `buat ${days} hari` : 'buat hari ini');

/**
 * The verdict templates of BOT_SPEC §5, filled with BUDGET_RULES §6 numbers. Where a template would say
 * something false ("udah abis" while some is left), it says how much is left instead.
 */
export function verdict({ check, item, until, endsOnSunday }: VerdictContext, random?: Random): string {
  const emoji = itemEmoji(item);
  const { remainingWeek: remaining, remainingAfter: after, daysAfterToday: days } = check;
  switch (check.verdict) {
    case 'NO_BUDGET':
      return NO_BUDGET;
    case 'ALLOW':
      return pick(
        [
          `Gas! ${emoji} Jajanmu minggu ini masih ${rp(remaining)}, abis ini sisa ${rp(after)} ${forDays(days)}. Santuy.`,
          `Boleh dong 😄 Masih aman kok, sisa jajan ${rp(after)} sampai ${until}.`,
        ],
        random,
      );
    case 'CAUTION':
      return pick(
        [
          `Hmm bisa sih, tapi abis ini jajanmu tinggal ${rp(after)} buat ${days} hari lagi (≈${rp(check.perDayAfter ?? 0)}/hari) 😬 Tabunganmu udah ${check.savingsProgressPct}% dari target, sayang kalo jebol. Yakin?`,
          `Boleh… tapi mepet ya. Sisa ${rp(after)} buat ${days} hari. Mau skip dulu biar aman? 👀`,
        ],
        random,
      );
    case 'DENY': {
      const left = remaining > 0 ? `tinggal ${rp(remaining)}` : 'udah abis';
      const variants = [
        `Waduh, jajan minggu ini ${left} bestie 🥲 Kalau maksa, jatah minggu depan kepotong ${rp(check.nextWeekCut)}. Mending skip dulu, duitnya jadi tabungan aja yuk 💪`,
      ];
      // BOT_SPEC §5 ⚠: "Senin jatahmu reset" only if no debt carries into the next segment (and it starts on a Monday).
      if (check.debtBefore === 0 && endsOnSunday)
        variants.push(
          remaining > 0
            ? `Yah, jatah jajan minggu ini tinggal ${rp(remaining)}, ga cukup. Tahan dulu ya, Senin jatahmu reset 😉`
            : 'Yah, jatah jajan minggu ini udah habis. Tahan dulu ya, Senin jatahmu reset 😉',
        );
      return pick(variants, random);
    }
  }
}

/** "mau" + a NEEDS item: no verdict (BUDGET_RULES §6), just the needs remaining and a [Catat] button. */
export function needsCheck(category: { name: string }, amount: number, snap: BudgetSnapshot) {
  const remaining =
    snap.state === 'NO_BUDGET'
      ? NO_BUDGET_LINE
      : `Sisa pokok minggu ini ${rp(snap.needs.remainingWeek)}, abis ini ${rp(snap.needs.remainingWeek - amount)}.`;
  return `${category.name} itu kebutuhan pokok, ga perlu izin 😄\n${remaining}\nUdah kebeli? Tap Catat.`;
}

/** Jadi beli: recorded, with the new remaining. Neutral even after a DENY (owner decision for M6). */
export function bought(item: string, snap: BudgetSnapshot) {
  const emoji = itemEmoji(item);
  if (snap.state === 'NO_BUDGET') return `Oke dicatat ${emoji}\n${NO_BUDGET_LINE}`;
  const { remainingWeek } = snap.wants;
  if (remainingWeek < 0)
    return `Oke dicatat ${emoji} Jajan minggu ini lewat ${rp(-remainingWeek)}, nanti dipotong dari jatah minggu depan ya.`;
  return `Oke dicatat ${emoji} Sisa jajan minggu ini ${rp(remainingWeek)}.`;
}

/** Ga jadi: praise, and what skipping saved this week (BUDGET_RULES §7, not added to savings). */
export const skipped = (amount: number, weekTotal: number, random?: Random) =>
  pick(
    [
      `Mantap! 💪 ${rp(amount)} selamat. Total yang kamu selamatkan minggu ini: ${rp(weekTotal)}.`,
      `Keren, ditahan! 💪 ${rp(amount)} aman. Minggu ini kamu udah nyelamatin ${rp(weekTotal)}.`,
    ],
    random,
  );

/** The intent was already bought or skipped (a second tap). */
export const INTENT_DECIDED = 'Yang ini udah diputusin 👍';
export const INTENT_NOT_FOUND = 'Cek ini udah ga ada.';

export const confirmDelete = (tx: TxSummary) => `Hapus catatan ini?\n${describeTx(tx)}`;
export const txDeleted = (tx: TxSummary) => `🗑 Dihapus: ${describeTx(tx)}`;
export const DELETE_CANCELLED = 'Oke, ga jadi dihapus 👍';
export const NOTHING_TO_UNDO = 'Ga ada catatan dalam 24 jam terakhir buat dibatalin.';

// --- /sisa, /riwayat, /kategori (BOT_SPEC §1) ----------------------------------------------------

/** The NO_BUDGET template (BOT_SPEC §5). */
export const NO_BUDGET =
  'Uang jajan bulan ini belum dicatat nih, jadi aku belum bisa ngitung 😅 Ketik dulu misal "uang jajan 2jt".';

/** /sisa: remaining this week + this month per bucket, the wants daily pace, savings progress. */
export function sisa(snap: BudgetSnapshot) {
  const { wants, needs, savings, segment } = snap;
  let pace = `${rp(wants.dailyPace)}/hari buat ${segment.remainingDays} hari lagi`;
  if (wants.remainingWeek === 0) pace = 'Jatah jajan minggu ini udah abis.';
  if (wants.remainingWeek < 0)
    pace = `Jajan udah lewat ${rp(-wants.remainingWeek)}, jatah minggu depan kepotong segitu.`;
  return [
    `📊 Sisa budget minggu ini (${formatDayRange(segment.start, segment.end)})`,
    `Jajan: ${rp(wants.remainingWeek)} · bulan ini ${rp(wants.remainingMonth)}`,
    pace,
    `Pokok: ${rp(needs.remainingWeek)} · bulan ini ${rp(needs.remainingMonth)}`,
    `🐷 Tabungan: ${rp(savings.total)}/${rp(savings.target)} (${savings.progressPct}%)`,
  ].join('\n');
}

/** /riwayat. A list, so it's the one reply allowed past 5 lines (one line per transaction). */
export function history(txs: readonly TxSummary[]) {
  return [
    `📜 ${txs.length} catatan terakhir (🗑 buat hapus):`,
    ...txs.map((tx, i) => `${i + 1}. ${describeTx(tx)}`),
  ].join('\n');
}

export const HISTORY_EMPTY = 'Belum ada catatan. Coba ketik "warteg 10k".';

const BUCKET_TITLE: Readonly<Record<Bucket, string>> = {
  NEEDS: 'Pokok',
  WANTS: 'Jajan',
  SAVINGS: 'Nabung',
  INCOME: 'Pemasukan',
};

/** /kategori: categories grouped by bucket. */
export function categoryList(categories: readonly { name: string; bucket: Bucket }[]) {
  const lines = (['NEEDS', 'WANTS', 'SAVINGS', 'INCOME'] as const)
    .map((bucket) => ({ bucket, names: categories.filter((c) => c.bucket === bucket).map((c) => c.name) }))
    .filter(({ names }) => names.length > 0)
    .map(({ bucket, names }) => `${BUCKET_TITLE[bucket]}: ${names.join(', ')}`);
  return ['📂 Kategori', ...lines].join('\n');
}
