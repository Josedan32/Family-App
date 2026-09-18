const PALETTE_SIZE = 8;

/** Deterministic: the same member always lands on the same color, and two
 * members never look the same purely by luck of the initial letter. */
export function avatarColorIndex(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return (hash % PALETTE_SIZE) + 1;
}

export function avatarInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

const SIZE_CLASSES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl",
} as const;

export function Avatar({
  displayName,
  photoUrl,
  /** Colors by this id, not by name — two members can share a first name,
   * and a display name can change without the person becoming someone else. */
  seed,
  size = "md",
  className = "",
}: {
  displayName: string;
  photoUrl?: string | null;
  seed?: string;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        className={`flex-none rounded-full object-cover ${SIZE_CLASSES[size]} ${className}`}
      />
    );
  }

  const colorIndex = avatarColorIndex(seed || displayName);

  return (
    <div
      aria-hidden="true"
      className={`flex flex-none items-center justify-center rounded-full font-semibold ${SIZE_CLASSES[size]} ${className}`}
      style={{
        backgroundColor: `var(--avatar-${colorIndex}-bg)`,
        color: `var(--avatar-${colorIndex}-fg)`,
      }}
    >
      {avatarInitials(displayName)}
    </div>
  );
}
