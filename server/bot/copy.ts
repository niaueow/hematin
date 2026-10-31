// ALL user-facing Indonesian strings live here (AGENTS.md rule 7). Tone: BOT_SPEC §5 (D-023).
// ≤ 5 lines, ≤ 2 emoji, 2–3 variants per message type, picked at random so it doesn't feel robotic.
// Messages are sent as plain text (no parse_mode), so user-provided names can't inject markup.
// TODO(M5+): logging, /sisa, verdicts, daily reminder, recap.

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

/** Plain text before expense logging exists (M5). */
export const LOGGING_COMING_SOON =
  'Fitur catat pengeluaran lagi disiapin, bentar lagi bisa 🙏\nSementara cek /bantuan dulu ya.';

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
