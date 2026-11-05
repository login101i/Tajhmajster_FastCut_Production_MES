/** Ikona warstw / płyt — zlecenie grupowe (IsGroupOrder = 1). */
export function GroupStar({ title = 'Zlecenie grupowe' }: { title?: string }) {
  return (
    <span className="group-star group-layers" title={title} aria-label={title}>
      <svg viewBox="0 0 24 24" aria-hidden>
        {/* trzy poziome płyty jedna na drugiej */}
        <rect x="3" y="4" width="18" height="4.2" rx="1.1" fill="currentColor" opacity="0.55" />
        <rect x="3" y="10" width="18" height="4.2" rx="1.1" fill="currentColor" opacity="0.78" />
        <rect x="3" y="16" width="18" height="4.2" rx="1.1" fill="currentColor" />
      </svg>
    </span>
  );
}

/** Jedna pozioma linia — podzlecenie (jasnoniebieska). */
export function GroupChildLine({ title = 'Podzlecenie' }: { title?: string }) {
  return (
    <span className="group-star group-child-line" title={title} aria-label={title}>
      <svg viewBox="0 0 24 24" aria-hidden>
        <rect x="3" y="10" width="18" height="4.2" rx="1.1" fill="currentColor" />
      </svg>
    </span>
  );
}
