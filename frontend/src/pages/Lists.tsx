import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../lib/api';
import type { ShoppingItem } from '../lib/types';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/EmptyState';
import { SearchInput, matchesQuery } from '../components/SearchInput';
import { GiftsPane } from '../components/GiftsPane';

const fieldCls =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600';

type Pane = 'shopping' | 'gifts';

// One shopping row, draggable by its leading handle — dragging anywhere else
// on the row would fight the existing checkbox-tap and edit-tap interactions.
function ShoppingRow({
  item, onToggle, onEdit,
}: {
  item: ShoppingItem;
  onToggle: (item: ShoppingItem) => void;
  onEdit: (item: ShoppingItem) => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li ref={setNodeRef} style={style} className={`flex items-center gap-3 p-4 ${isDragging ? 'opacity-50' : ''}`}>
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t('shopping.reorderAria')}
        className="flex h-8 w-5 flex-shrink-0 touch-none cursor-grab items-center justify-center text-zinc-600 active:cursor-grabbing"
      >
        <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.25" /><circle cx="9" cy="12" r="1.25" /><circle cx="9" cy="18" r="1.25" />
          <circle cx="15" cy="6" r="1.25" /><circle cx="15" cy="12" r="1.25" /><circle cx="15" cy="18" r="1.25" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onToggle(item)}
        aria-label={item.is_done ? t('shopping.uncheckAria') : t('shopping.checkAria')}
        className={[
          'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          item.is_done ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-600 hover:border-zinc-400',
        ].join(' ')}
      >
        {item.is_done && (
          <svg className="h-3 w-3 text-zinc-900" viewBox="0 0 12 12" fill="none">
            <path className="check-draw" pathLength={1} d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <button type="button" onClick={() => onEdit(item)} className="min-w-0 flex-1 text-left">
        <p className={`text-sm ${item.is_done ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>{item.name}</p>
        {item.note && <p className="mt-0.5 truncate text-xs text-zinc-500">{item.note}</p>}
      </button>
    </li>
  );
}

export default function Lists() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  // A quick-access tile can deep-link straight into the gifts pane.
  const [pane, setPane] = useState<Pane>(searchParams.get('pane') === 'gifts' ? 'gifts' : 'shopping');

  // --- Shopping state ------------------------------------------------------
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quickAdd, setQuickAdd] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editStore, setEditStore] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const quickAddRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fetchItems = () => {
    api.get<ShoppingItem[]>('/shopping')
      .then(setItems)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchItems(); }, []);

  // Quick-add keeps focus so a shopping trip's worth of items flows in one
  // typing session — a modal per grocery item would be ceremony.
  const addQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = quickAdd.trim();
    if (!name) return;
    setQuickAdd('');
    try {
      const created = await api.post<ShoppingItem>('/shopping', { name });
      setItems((prev) => [...prev.filter((i) => !i.is_done), created, ...prev.filter((i) => i.is_done)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
      setQuickAdd(name);
    }
    quickAddRef.current?.focus();
  };

  const toggle = async (item: ShoppingItem) => {
    try {
      const updated = await api.patch<ShoppingItem>(`/shopping/${item.id}`, { is_done: !item.is_done });
      setItems((prev) => {
        const rest = prev.filter((i) => i.id !== item.id);
        // Keep the invariant the server orders by: open first, fresh-done at
        // the top of the done pile.
        return updated.is_done
          ? [...rest.filter((i) => !i.is_done), updated, ...rest.filter((i) => i.is_done)]
          : [...rest.filter((i) => !i.is_done), updated, ...rest.filter((i) => i.is_done)].sort(
              (a, b) => Number(a.is_done) - Number(b.is_done),
            );
      });
    } catch { /* row stays; next fetch reconciles */ }
  };

  const clearDone = async () => {
    try {
      await api.post('/shopping/clear-done', {});
      setItems((prev) => prev.filter((i) => !i.is_done));
    } catch { /* keep list */ }
  };

  const openEdit = (item: ShoppingItem) => {
    setEditing(item);
    setEditName(item.name);
    setEditNote(item.note ?? '');
    setEditStore(item.store ?? '');
    setConfirmDelete(false);
  };

  const saveEdit = async () => {
    if (!editing || !editName.trim()) return;
    try {
      const updated = await api.patch<ShoppingItem>(`/shopping/${editing.id}`, {
        name: editName.trim(),
        note: editNote.trim() || null,
        store: editStore.trim() || null,
      });
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    }
  };

  const deleteItem = async () => {
    if (!editing) return;
    try {
      await api.delete(`/shopping/${editing.id}`);
      setItems((prev) => prev.filter((i) => i.id !== editing.id));
      setEditing(null);
    } catch { /* keep */ }
  };

  const visible = items.filter((i) => matchesQuery(query, i.name, i.note));
  const done = visible.filter((i) => i.is_done);
  const showSearch = items.length >= 8 || query !== '';

  // Grouped by store (Groceries / IKEA / ...), falling back to a catch-all
  // bucket for untagged items. Server order already puts open items before
  // done ones, so partitioning by store preserves open-before-done per group.
  const anywhereLabel = t('shopping.anywhere');
  const groupKey = (i: ShoppingItem) => i.store?.trim() || anywhereLabel;
  const storeGroups = Array.from(
    visible.reduce<Map<string, ShoppingItem[]>>((map, item) => {
      const key = groupKey(item);
      map.set(key, [...(map.get(key) ?? []), item]);
      return map;
    }, new Map()),
  ).sort(([a], [b]) => {
    if (a === anywhereLabel) return 1;
    if (b === anywhereLabel) return -1;
    return a.localeCompare(b);
  });
  const existingStores = Array.from(
    new Set(items.map((i) => i.store?.trim()).filter((s): s is string => !!s)),
  ).sort((a, b) => a.localeCompare(b));

  // Store groups are visually partitioned but items live in one flat array
  // (interleaved by sort_order, not contiguous) — reordering within a group
  // means extracting just that group's members (in their current relative
  // order), reordering that subset, then writing it back into the exact flat
  // slots it came from, leaving every other group's items untouched.
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const activeItem = items.find((i) => i.id === active.id);
    const overItem = items.find((i) => i.id === over.id);
    if (!activeItem || !overItem || groupKey(activeItem) !== groupKey(overItem)) return; // no cross-group drag

    const group = groupKey(activeItem);
    const idxs = items.reduce<number[]>((acc, it, idx) => (groupKey(it) === group ? [...acc, idx] : acc), []);
    const groupItems = idxs.map((i) => items[i]);
    const oldPos = groupItems.findIndex((i) => i.id === active.id);
    const newPos = groupItems.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(groupItems, oldPos, newPos);
    const next = [...items];
    idxs.forEach((flatIdx, i) => { next[flatIdx] = reordered[i]; });
    setItems(next);
    api.post('/shopping/reorder', { ids: reordered.map((i) => i.id) }).catch(() => fetchItems());
  };

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">{t('lists.eyebrow')}</p>
          <h1 className="mt-1 text-2xl font-light text-zinc-100">{t('lists.title')}</h1>
        </div>
        {/* Shopping | Gifts — the Timeline's segmented pattern. */}
        <div className="flex gap-1 rounded-xl border border-zinc-800/60 bg-zinc-900 p-1">
          {(['shopping', 'gifts'] as Pane[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPane(p)}
              aria-pressed={pane === p}
              className={[
                'flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                pane === p ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300',
              ].join(' ')}
            >
              {t(p === 'shopping' ? 'lists.shopping' : 'lists.gifts')}
            </button>
          ))}
        </div>
      </header>

      {pane === 'shopping' && (
        <div className="animate-fade-slide-in space-y-4">
          {showSearch && <SearchInput value={query} onChange={setQuery} label={t('search.shopping')} />}

          {loading && <p className="text-sm text-zinc-500">{t('common.loading')}</p>}
          {error && <p className="text-sm text-rose-400">{error}</p>}

          {!loading && !error && items.length === 0 && (
            <EmptyState icon="🧺" title={t('shopping.empty')} hint={t('shopping.emptyHint')} />
          )}
          {!loading && !error && items.length > 0 && visible.length === 0 && (
            <EmptyState icon="🔍" title={t('search.noMatches')} hint={t('search.noMatchesHint')} />
          )}

          {storeGroups.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <div className="space-y-4">
                {done.length > 0 && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={clearDone}
                      className="text-xs text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-300"
                    >
                      {t('shopping.clearDone')}
                    </button>
                  </div>
                )}
                {/* A store header only earns its place when there's more than
                    one bucket — a single "Anywhere" group is just the plain
                    list, not a truthful grouping. */}
                {storeGroups.map(([store, groupItems]) => (
                  <section key={store} className="space-y-2">
                    {storeGroups.length > 1 && (
                      <p className="text-xs font-medium uppercase tracking-widest text-zinc-600">{store}</p>
                    )}
                    <div className="overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900">
                      <SortableContext items={groupItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                        <ul className="divide-y divide-zinc-800/60">
                          {groupItems.map((item) => (
                            <ShoppingRow key={item.id} item={item} onToggle={toggle} onEdit={openEdit} />
                          ))}
                        </ul>
                      </SortableContext>
                    </div>
                  </section>
                ))}
              </div>
            </DndContext>
          )}

          {/* Quick add — sits at the end of the list, docked above the bottom
              nav so it's always reachable no matter how long the list gets.
              bottom-0, not bottom-28: <main> already reserves clearance for
              the floating nav via pb-44, and sticky's offset resolves against
              that padding edge — unlike the fixed-position FABs elsewhere
              that reuse bottom-28 directly against the viewport, stacking
              bottom-28 on top of pb-44 here would double the gap and strand
              the bar mid-list instead of flush above the nav. */}
          <form
            onSubmit={addQuick}
            className="sticky bottom-0 flex gap-2 border-t border-zinc-800/60 bg-zinc-950/95 py-3 backdrop-blur-sm"
          >
            <input
              ref={quickAddRef}
              type="text"
              value={quickAdd}
              onChange={(e) => setQuickAdd(e.target.value)}
              placeholder={t('shopping.addPlaceholder')}
              aria-label={t('shopping.addPlaceholder')}
              maxLength={120}
              className={fieldCls}
            />
            <button
              type="submit"
              disabled={!quickAdd.trim()}
              className="flex-shrink-0 rounded-xl bg-zinc-100 px-4 text-sm font-medium text-zinc-900 transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {t('shopping.add')}
            </button>
          </form>
        </div>
      )}

      {pane === 'gifts' && <GiftsPane />}

      <Modal open={!!editing} title={t('shopping.editItem')} onClose={() => setEditing(null)}>
        <div className="space-y-4">
          <div>
            <label htmlFor="shop_name" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-zinc-500">
              {t('form.name')}
            </label>
            <input id="shop_name" type="text" value={editName} maxLength={120} onChange={(e) => setEditName(e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label htmlFor="shop_note" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-zinc-500">
              {t('form.notes')}
            </label>
            <input id="shop_note" type="text" value={editNote} maxLength={500} onChange={(e) => setEditNote(e.target.value)} placeholder={t('shopping.notePlaceholder')} className={fieldCls} />
          </div>
          <div>
            <label htmlFor="shop_store" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-zinc-500">
              {t('shopping.store')}
            </label>
            <input
              id="shop_store"
              type="text"
              list="existing-stores"
              value={editStore}
              maxLength={80}
              onChange={(e) => setEditStore(e.target.value)}
              placeholder={t('shopping.storePlaceholder')}
              className={fieldCls}
            />
            <datalist id="existing-stores">
              {existingStores.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => (confirmDelete ? deleteItem() : setConfirmDelete(true))}
              className={[
                'rounded-xl border px-3 py-2.5 text-sm transition-colors',
                confirmDelete ? 'border-rose-500/40 text-rose-400' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300',
              ].join(' ')}
            >
              {confirmDelete ? t('common.confirm') : t('form.deleteItem')}
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="flex-1 rounded-xl border border-zinc-800 py-2.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={!editName.trim()}
              className="flex-1 rounded-xl bg-zinc-100 py-2.5 text-sm font-medium text-zinc-900 transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
