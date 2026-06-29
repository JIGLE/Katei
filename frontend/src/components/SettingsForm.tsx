import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface NotificationSettings {
  ntfy_url: string;
  lead_days: number;
}

const labelCls = 'mb-1.5 block text-xs font-medium uppercase tracking-widest text-zinc-500';
const fieldCls =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none';

export function SettingsForm({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [leadDays, setLeadDays] = useState('3');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    api
      .get<NotificationSettings>('/settings/notifications')
      .then((s) => { setUrl(s.ntfy_url); setLeadDays(String(s.lead_days)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.put('/settings/notifications', {
        ntfy_url: url.trim(),
        lead_days: Number(leadDays) || 0,
      });
      setMessage({ kind: 'ok', text: 'Saved.' });
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
      // Persist first so the test hits the current URL.
      await api.put('/settings/notifications', {
        ntfy_url: url.trim(),
        lead_days: Number(leadDays) || 0,
      });
      await api.post('/settings/notifications/test', {});
      setMessage({ kind: 'ok', text: 'Test sent — check your ntfy app.' });
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message.replace(/^\d+\s+/, '') : 'Test failed.' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-zinc-500">
        Get a push when an event is due. Create a topic in the{' '}
        <span className="text-zinc-300">ntfy</span> app, then paste its URL below
        (e.g. <span className="text-zinc-400">https://ntfy.sh/your-secret-topic</span>).
      </p>

      <div>
        <label htmlFor="ntfy_url" className={labelCls}>Notification URL</label>
        <input
          id="ntfy_url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://ntfy.sh/…"
          className={fieldCls}
        />
      </div>

      <div>
        <label htmlFor="lead_days" className={labelCls}>Remind me this many days ahead</label>
        <input
          id="lead_days"
          type="number"
          min="0"
          max="60"
          value={leadDays}
          onChange={(e) => setLeadDays(e.target.value)}
          className={`${fieldCls} [color-scheme:dark]`}
        />
      </div>

      {message && (
        <p className={`text-sm ${message.kind === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
          {message.text}
        </p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={sendTest}
          disabled={testing || saving || !url.trim()}
          className="flex-1 rounded-xl border border-zinc-800 py-2.5 text-sm text-zinc-300 transition-colors hover:border-zinc-700 disabled:opacity-50"
        >
          {testing ? 'Sending…' : 'Send test'}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || testing}
          className="flex-1 rounded-xl bg-zinc-100 py-2.5 text-sm font-medium text-zinc-900 transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full pt-1 text-center text-xs text-zinc-500 transition-colors hover:text-zinc-300"
      >
        Close
      </button>
    </div>
  );
}
