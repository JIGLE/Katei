import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface AvatarPickerProps {
  name: string;
  url: string | null;      // the currently-saved avatar
  file: File | null;       // a newly-chosen file (staged, not yet uploaded)
  onPick: (file: File | null) => void;
}

// Circular preview + "Choose photo" button. The parent stages the File and
// uploads it after saving (the member must exist to receive its avatar).
export function AvatarPicker({ name, url, file, onPick }: AvatarPickerProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(url);

  useEffect(() => {
    if (!file) { setPreview(url); return; }
    const obj = URL.createObjectURL(file);
    setPreview(obj);
    return () => URL.revokeObjectURL(obj);
  }, [file, url]);

  const initials =
    name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '·';

  return (
    <div className="flex items-center gap-4">
      {preview ? (
        <img src={preview} alt="" className="h-14 w-14 flex-shrink-0 rounded-full object-cover" />
      ) : (
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-medium text-zinc-300">
          {initials}
        </div>
      )}
      <div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-xl border border-zinc-800 px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:border-zinc-700"
        >
          {file || url ? t('form.changePhoto') : t('form.choosePhoto')}
        </button>
        <p className="mt-1 text-xs text-zinc-600">{t('form.photoHint')}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
