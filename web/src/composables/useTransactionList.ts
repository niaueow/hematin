import { reactive, ref, watch } from 'vue';
import { deleteTransaction, listTransactions, restoreTransaction, type Transaction } from '@web/api/dashboard';
import type { LocalDate } from '@web/lib/format';
import { filtersToQuery, type TxFilters } from '@web/lib/transactions';
import type { ToastOptions } from '@web/composables/useToast';

// The Transaksi list: filters, paging, and delete with undo. Deleting is optimistic (the row goes at once, the
// DELETE follows); "Urungkan" in the toast restores it on the server and puts it back where it was.

export const PAGE_SIZE = 30;

export function useTransactionList(options: {
  today: () => LocalDate;
  toast: { show: (options: ToastOptions) => number };
  initial?: Partial<TxFilters>;
}) {
  const filters = reactive<TxFilters>({ period: 'month', type: 'all', categoryId: null, ...options.initial });
  const items = ref<Transaction[]>([]);
  const nextCursor = ref<string | null>(null);
  const loading = ref(false);
  const loadingMore = ref(false);
  const failed = ref(false);
  let request = 0;

  async function reload() {
    const id = ++request;
    loading.value = true;
    failed.value = false;
    try {
      const page = await listTransactions({ ...filtersToQuery(filters, options.today()), limit: PAGE_SIZE });
      if (id !== request) return; // a newer filter won
      items.value = page.items;
      nextCursor.value = page.nextCursor;
    } catch {
      if (id === request) failed.value = true;
    } finally {
      if (id === request) loading.value = false;
    }
  }

  async function loadMore() {
    if (!nextCursor.value || loadingMore.value) return;
    const id = request;
    loadingMore.value = true;
    try {
      const page = await listTransactions({
        ...filtersToQuery(filters, options.today()),
        limit: PAGE_SIZE,
        cursor: nextCursor.value,
      });
      if (id !== request) return;
      items.value = [...items.value, ...page.items];
      nextCursor.value = page.nextCursor;
    } catch {
      options.toast.show({ tone: 'negative', message: 'Gagal memuat transaksi. Coba lagi ya.' });
    } finally {
      loadingMore.value = false;
    }
  }

  function putBack(tx: Transaction, index: number) {
    if (items.value.some((t) => t.id === tx.id)) return;
    const next = [...items.value];
    next.splice(Math.min(index, next.length), 0, tx);
    items.value = next;
  }

  /** Optimistic delete with an undo toast. */
  async function removeWithUndo(tx: Transaction) {
    const index = items.value.findIndex((t) => t.id === tx.id);
    items.value = items.value.filter((t) => t.id !== tx.id);
    try {
      await deleteTransaction(tx.id);
    } catch {
      putBack(tx, index);
      options.toast.show({ tone: 'negative', message: 'Gagal menghapus. Coba lagi ya.' });
      return;
    }
    options.toast.show({
      tone: 'neutral',
      message: 'Transaksi dihapus',
      actionLabel: 'Urungkan',
      onAction: () => {
        restoreTransaction(tx.id)
          .then((restored) => putBack(restored, index))
          .catch(() => options.toast.show({ tone: 'negative', message: 'Gagal mengembalikan. Coba lagi ya.' }));
      },
    });
  }

  watch(filters, () => void reload(), { deep: true });

  return { filters, items, nextCursor, loading, loadingMore, failed, reload, loadMore, removeWithUndo };
}
