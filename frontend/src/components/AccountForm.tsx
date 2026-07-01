import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Avatar } from './Avatar';
import type { User } from '../lib/types';

const labelCls = 'mb-1.5 block text-xs font-medium uppercase tracking-widest text-zinc-500';
const fieldCls =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none';

// "My account" — self-service profile (name / email / avatar) and password
// change. Distinct from admin member-management: it only ever edits the
// logged-in user.
export function AccountForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  if (!user) return null;

  const saveProfile = async () => {
    if (!name.trim()) {
      setMessage({ kind: 'err', text: t('form.errNameRequired') });
      return;
    }
    setSavingProfile(true);
    setMessage(null);
    try {
      await api.patch<User>(`/users/${user.id}`, {
        name: name.trim(),
        email: email.trim(),
        avatar_url: avatarUrl.trim(),
      });
      await refresh();
      setMessage({ kind: 'ok', text: t('account.profileSaved') });
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message.replace(/^\d+\s+/, '') : t('account.saveFailed') });
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    if (newPw.length < 8) {
      setMessage({ kind: 'err', text: t('auth.errPasswordLen') });
      return;
    }
    setSavingPw(true);
    setMessage(null);
    try {
      await api.post('/auth/password', { current_password: currentPw, new_password: newPw });
      setCurrentPw('');
      setNewPw('');
      setMessage({ kind: 'ok', text: t('account.passwordChanged') });
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message.replace(/^\d+\s+/, '') : t('account.saveFailed') });
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Identity preview */}
      <div className="flex items-center gap-3">
        <Avatar name={name || user.name} url={avatarUrl || user.avatar_url} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm text-zinc-100">{name || user.name}</p>
          <p className="text-xs text-zinc-500">
            家庭{user.role === 'admin' ? ` · ${t('household.admin')}` : ''}
          </p>
        </div>
      </div>

      {/* Profile */}
      <div className="space-y-3">
        <div>
          <label htmlFor="acct_name" className={labelCls}>{t('auth.name')}</label>
          <input id="acct_name" type="text" value={name} onChange={(e) => setName(e.target.value)} className={fieldCls} />
        </div>
        <div>
          <label htmlFor="acct_email" className={labelCls}>{t('account.email')}</label>
          <input
            id="acct_email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className={fieldCls}
          />
          <p className="mt-1.5 text-xs text-zinc-600">{t('account.emailHint')}</p>
        </div>
        <div>
          <label htmlFor="acct_avatar" className={labelCls}>{t('account.avatarUrl')}</label>
          <input
            id="acct_avatar"
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
            className={fieldCls}
          />
        </div>
        <button
          type="button"
          onClick={saveProfile}
          disabled={savingProfile}
          className="w-full rounded-xl bg-zinc-100 py-2.5 text-sm font-medium text-zinc-900 transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {savingProfile ? t('common.saving') : t('account.saveProfile')}
        </button>
      </div>

      {/* Password */}
      <div className="space-y-3 border-t border-zinc-800/60 pt-4">
        <label className={`${labelCls} mb-0`}>{t('account.changePassword')}</label>
        <div>
          <label htmlFor="acct_cur" className="mb-1.5 block text-xs text-zinc-500">{t('account.currentPassword')}</label>
          <input id="acct_cur" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password" className={fieldCls} />
        </div>
        <div>
          <label htmlFor="acct_new" className="mb-1.5 block text-xs text-zinc-500">{t('account.newPassword')}</label>
          <input id="acct_new" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder={t('auth.passwordSetupPlaceholder')} autoComplete="new-password" className={fieldCls} />
        </div>
        <button
          type="button"
          onClick={changePassword}
          disabled={savingPw || !currentPw || !newPw}
          className="w-full rounded-xl border border-zinc-800 py-2.5 text-sm text-zinc-300 transition-colors hover:border-zinc-700 disabled:opacity-50"
        >
          {savingPw ? t('common.saving') : t('account.changePassword')}
        </button>
      </div>

      {message && (
        <p className={`text-sm ${message.kind === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>{message.text}</p>
      )}

      <button
        type="button"
        onClick={onClose}
        className="w-full pt-1 text-center text-xs text-zinc-500 transition-colors hover:text-zinc-300"
      >
        {t('common.close')}
      </button>
    </div>
  );
}
