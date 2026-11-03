/** Ciemnoniebieska gwiazdka — zlecenie grupowe (IsGroupOrder = 1). */
export function GroupStar({ title = 'Zlecenie grupowe' }: { title?: string }) {
  return (
    <span className="group-star" title={title} aria-label={title}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
        <path
          fill="currentColor"
          d="M12 2.6l2.74 6.55 7.06.58-5.4 4.66 1.66 6.9L12 17.77l-6.06 3.52 1.66-6.9-5.4-4.66 7.06-.58L12 2.6z"
        />
      </svg>
    </span>
  );
}
