/**
 * What another member's private module looks like.
 *
 * Deliberately NOT a blurred number, a skeleton, or "$—". A blurred figure
 * invites guessing at a magnitude; a skeleton implies data is loading and will
 * arrive. This is a settled, final state, and it reads as one.
 *
 * "Privado" alone reads as the app hiding something. Naming the owner, when
 * known, reframes it as their decision, respected.
 */
export function PrivateBlock({ member }: { member?: string }) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-lg bg-surface-sunken px-3 py-2 text-private"
      role="note"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true">🔒</span>
        <span className="text-sm">Privado</span>
      </div>
      {member ? (
        <p className="text-xs text-text-muted">{member} decidió no compartir este monto</p>
      ) : null}
    </div>
  );
}
