import { useState } from 'react';
import { useAuth } from '../lib/auth';

const labelCls = 'mb-1.5 block text-xs font-medium uppercase tracking-widest text-zinc-500';
const fieldCls =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none';

export function AuthGate() {
  const { needsSetup, login, register } = useAuth();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password) {
      setError('Name and password are required.');
      return;
    }
    if (needsSetup && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (needsSetup) {
        await register(name.trim(), password);
      } else {
        await login(name.trim(), password);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      // Surface the API's message rather than the raw "401 {json}" string.
      setError(msg.replace(/^\d+\s+/, '').replace(/^\{.*"error":"(.*?)".*\}$/, '$1'));
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-light tracking-wide text-zinc-100">家庭</h1>
          <p className="mt-2 text-xs uppercase tracking-widest text-zinc-500">Katei</p>
        </div>

        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-6">
          <h2 className="mb-1 text-lg font-light text-zinc-100">
            {needsSetup ? 'Create your account' : 'Sign in'}
          </h2>
          <p className="mb-5 text-xs text-zinc-500">
            {needsSetup
              ? 'This will be the first household account.'
              : 'Welcome back to your household.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className={labelCls}>Name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex"
                autoFocus
                autoComplete="username"
                className={fieldCls}
              />
            </div>

            <div>
              <label htmlFor="password" className={labelCls}>Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={needsSetup ? 'At least 8 characters' : '••••••••'}
                autoComplete={needsSetup ? 'new-password' : 'current-password'}
                className={fieldCls}
              />
            </div>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-zinc-100 py-2.5 text-sm font-medium text-zinc-900 transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Please wait…' : needsSetup ? 'Create account' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
