import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../lib/preferences';
import { formatMoney } from '../lib/format';
import type { GiftItem, GiftListSummary } from '../lib/types';
import { Modal } from './Modal';
import { EmptyState } from './EmptyState';
import { GiftForm } from './GiftForm';
import { DomainChip } from './LinkField';
import { ShareButton, ShareGiftPanel } from './ShareGiftList';
import { SectionAdd } from './SectionAdd';

interface MyWishlistProps {
  list: GiftListSummary;
  refetch: () => void;
}

// The owner's own view of their wishlist. Deliberately renders no status
// pill or bought/reserved affordance anywhere — the API already forces
// `status: 'idea'` and masks attribution for the owner, but the UI doesn't
// even have a control that could hint otherwise.
export function MyWishlist({ list, refetch }: MyWishlistProps) {
  const { t } = useTranslation();
  const { locale } = usePreferences();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GiftItem | null>(null);
  const [sharing, setSharing] = useState(false);

  const handleSaved = () => {
    setShowForm(false);
    setEditing(null);
    refetch();
  };
  const handleDeleted = () => {
    setEditing(null);
    refetch();
  };

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
            {t('gifts.myWishlist')}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">{t('gifts.myWishlistHint')}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          <ShareButton
            open={sharing}
            onClick={() => setSharing((v) => !v)}
            controls={`share-${list.id}`}
          />
          <SectionAdd label={t('gifts.addGift')} onClick={() => setShowForm(true)} />
        </div>
      </div>
      {sharing && <ShareGiftPanel listId={list.id} id={`share-${list.id}`} />}

      {list.items.length === 0 && (
        <EmptyState
          icon="🎁"
          title={t('gifts.myWishlistEmpty')}
          hint={t('gifts.myWishlistEmptyHint')}
          actionLabel={t('gifts.addGift')}
          onAction={() => setShowForm(true)}
        />
      )}

      {list.items.length > 0 && (
        <div className="divide-y divide-zinc-800/60 overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900">
          {list.items.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-3 p-4 transition-colors hover:bg-zinc-800/30"
            >
              <button
                type="button"
                onClick={() => setEditing(g)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm text-zinc-100">{g.title}</p>
                {g.price != null && (
                  <p className="mt-0.5 text-xs tabular-nums text-zinc-500">
                    {formatMoney(g.price, g.currency ?? 'EUR', locale)}
                  </p>
                )}
              </button>
              {g.url && <DomainChip url={g.url} site={g.link_site} />}
            </div>
          ))}
        </div>
      )}

      <Modal open={showForm} title={t('gifts.newGift')} onClose={() => setShowForm(false)}>
        <GiftForm
          listId={list.id}
          isOwnList
          onSaved={handleSaved}
          onCancel={() => setShowForm(false)}
        />
      </Modal>

      <Modal open={!!editing} title={t('gifts.editGift')} onClose={() => setEditing(null)}>
        {editing && (
          <GiftForm
            listId={list.id}
            isOwnList
            initial={editing}
            onSaved={handleSaved}
            onCancel={() => setEditing(null)}
            onDeleted={handleDeleted}
          />
        )}
      </Modal>
    </section>
  );
}
