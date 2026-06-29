// Household member avatar — a circle with initials on a zinc ground, or the
// member's image when one is set. See BRAND.md §7.

interface AvatarProps {
  name: string;
  url?: string | null;
  size?: 'xs' | 'sm' | 'md';
}

const sizeCls: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'h-5 w-5 text-[0.55rem]',
  sm: 'h-6 w-6 text-[0.6rem]',
  md: 'h-8 w-8 text-xs',
};

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function Avatar({ name, url, size = 'sm' }: AvatarProps) {
  const dim = sizeCls[size];
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        title={name}
        className={`${dim} flex-shrink-0 rounded-full object-cover ring-2 ring-zinc-900`}
      />
    );
  }
  return (
    <span
      title={name}
      className={`${dim} flex flex-shrink-0 items-center justify-center rounded-full bg-zinc-800 font-medium text-zinc-300 ring-2 ring-zinc-900`}
    >
      {initials(name)}
    </span>
  );
}

// A compact overlapping stack of member avatars for a single obligation.
export function AssigneeStack({
  members,
  size = 'sm',
}: {
  members: { user_name: string; user_avatar: string | null }[];
  size?: AvatarProps['size'];
}) {
  if (members.length === 0) return null;
  const shown = members.slice(0, 3);
  const extra = members.length - shown.length;
  return (
    <div className="flex flex-shrink-0 items-center -space-x-1.5">
      {shown.map((m, i) => (
        <Avatar key={i} name={m.user_name} url={m.user_avatar} size={size} />
      ))}
      {extra > 0 && (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-[0.6rem] font-medium text-zinc-400 ring-2 ring-zinc-900">
          +{extra}
        </span>
      )}
    </div>
  );
}
