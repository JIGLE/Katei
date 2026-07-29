import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import type { GiftListsResponse } from '../lib/types';
import { MyWishlist } from './MyWishlist';
import { FamilyGiftLists } from './FamilyGiftLists';

// The gifts half of the Lists tab: the viewer's own wishlist (always shown
// untouched) and everyone else's — household, pets, and people outside it.
export function GiftsPane() {
  const { t } = useTranslation();
  const [data, setData] = useState<GiftListsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLists = () => {
    api.get<GiftListsResponse>('/gift-lists')
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchLists(); }, []);

  if (loading) return <p className="text-sm text-zinc-500">{t('common.loading')}</p>;
  if (error) return <p className="text-sm text-rose-400">{error}</p>;
  if (!data) return null;

  return (
    <div className="animate-fade-slide-in space-y-8">
      <MyWishlist list={data.mine} refetch={fetchLists} />
      <FamilyGiftLists lists={data.others} refetch={fetchLists} />
    </div>
  );
}
