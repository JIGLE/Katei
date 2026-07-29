import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { usePreferences } from '../lib/preferences';
import { formatMoney } from '../lib/format';
import { useAuth } from '../lib/auth';
import type { GiftItem, GiftListSummary } from '../lib/types';
import { Modal } from './Modal';
import { EmptyState } from './EmptyState';
import { GiftForm } from './GiftForm';
import { DomainChip } from './LinkField';
import { ShareGiftList } from './ShareGiftList';
import { Avatar } from './Avatar';

const fieldCls =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600';

interface FamilyGiftListsProps {
  lists: GiftListSummary[];
  refetch: () => void;
}

// Every list except the viewer's own — household members, pets, and people
// outside the household. Status and attribution are always the truth here.
export function FamilyGiftLists({ lists, refetch }: FamilyGiftListsProps) {
  const { t } = useTranslation();
  const { locale } = usePreferences();
  const { user } = useAuth();
  const [addingFor, setAddingFor] = useState<GiftListSummary | null>(null);
  const [editing, setEditing] = useState<{ listId: number; item: GiftItem } | null>(null);
  const [addingPerson, setAddingPerson] = useState(false);
  const [personName, setPersonName] = useState('');
  const [savingPerson, setSavingPerson] = useState(false);

  const handleSaved = () => { setAddingFor(null); setEditing(null); refetch(); };
  const handleDeleted = () => { setEditing(null); refetch(); };

  const addPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = personName.trim();
    if (!name) return;
    setSavingPerson(true);
    try {
      await api.post('/gift-lists', { external_name: name });
      setPersonName('');
      setAddingPerson(false);
      refetch();
    } catch { /* keep the form open with what they typed */ }
    setSavingPerson(false);
  };

  // Matches the backend's own permission check exactly, so this control
  // never offers something that would 403.
  const canManageShare = (list: GiftListSummary) => list.external_name != null || user?.role === 'admin';

  return (
    <section className="space-y-6">
      <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">{t('gifts.familyFriends')}</p>

      {lists.length === 0 && !addingPerson && (
        <EmptyState
          icon="🎀"
          title={t('gifts.familyEmpty')}
          hint={t('gifts.familyEmptyHint')}
          actionLabel={t('gifts.addExternalPerson')}
          onAction={() => setAddingPerson(true)}
        />
      )}

      {lists.map((list) => (
        <div key={list.id} className="space-y-2">
          <div className="flex items-center gap-2">
            {list.owner_name ? (
              <Avatar name={list.owner_name} url={list.owner_avatar} size="sm" />
            ) : (
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[0.6rem] font-medium text-zinc-300">
                {(list.external_name ?? '?').trim().slice(0, 1).toUpperCase()}
              </span>
            )}
            <p className="min-w-0 flex-1 truncate text-xs font-medium uppercase tracking-widest text-zinc-500">
              {t('gifts.forName', { name: list.owner_name ?? list.external_name })}
            </p>
            <button
              type="button"
              onClick={() => setAddingFor(list)}
              aria-label={t('gifts.addGiftAria')}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-zinc-800 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>

          {list.items.length === 0 ? (
            <p className="px-1 text-xs text-zinc-600">{t('gifts.noIdeasYet')}</p>
          ) : (
            <div className="divide-y divide-zinc-800/60 overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900">
              {list.items.map((g) => (
                <div key={g.id} className="flex items-center gap-3 p-4 transition-colors hover:bg-zinc-800/30">
                  <button type="button" onClick={() => setEditing({ listId: list.id, item: g })} className="min-w-0 flex-1 text-left">
                    <p className={`truncate text-sm ${g.status === 'bought' ? 'text-zinc-400' : 'text-zinc-100'}`}>{g.title}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                      {g.price != null && <span className="tabular-nums">{formatMoney(g.price, g.currency ?? 'EUR', locale)}</span>}
                      {g.added_by_name && <span className="truncate">{t('gifts.addedBy', { name: g.added_by_name })}</span>}
                    </div>
                    {g.status !== 'idea' && (
                      <p className="mt-0.5 truncate text-xs text-teal-400">
                        {t(g.status === 'bought' ? 'gifts.boughtBy' : 'gifts.reservedBy', { name: g.bought_by_name ?? t('gifts.someone') })}
                      </p>
                    )}
                  </button>
                  {g.url && <DomainChip url={g.url} site={g.link_site} />}
                  <span
                    className={[
                      'flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                      g.status === 'bought'
                        ? 'bg-teal-500/10 text-teal-300'
                        : g.status === 'reserved'
                          ? 'bg-amber-500/10 text-amber-300'
                          : 'bg-zinc-800 text-zinc-500',
                    ].join(' ')}
                  >
                    {t(`gifts.status_${g.status}`)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {canManageShare(list) && <ShareGiftList listId={list.id} />}
        </div>
      ))}

      {addingPerson ? (
        <form onSubmit={addPerson} className="flex gap-2">
          <input
            type="text"
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
            placeholder={t('gifts.externalNamePlaceholder')}
            maxLength={120}
            autoFocus
            className={fieldCls}
          />
          <button
            type="submit"
            disabled={savingPerson || !personName.trim()}
            className="flex-shrink-0 rounded-xl bg-zinc-100 px-4 text-sm font-medium text-zinc-900 transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {t('gifts.addExternal')}
          </button>
        </form>
      ) : lists.length > 0 && (
        <button
          type="button"
          onClick={() => setAddingPerson(true)}
          className="text-xs text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-300"
        >
          {t('gifts.addExternalPerson')}
        </button>
      )}

      <Modal open={!!addingFor} title={t('gifts.newGift')} onClose={() => setAddingFor(null)}>
        {addingFor && <GiftForm listId={addingFor.id} isOwnList={false} onSaved={handleSaved} onCancel={() => setAddingFor(null)} />}
      </Modal>

      <Modal open={!!editing} title={t('gifts.editGift')} onClose={() => setEditing(null)}>
        {editing && (
          <GiftForm
            listId={editing.listId}
            isOwnList={false}
            initial={editing.item}
            onSaved={handleSaved}
            onCancel={() => setEditing(null)}
            onDeleted={handleDeleted}
          />
        )}
      </Modal>
    </section>
  );
}
