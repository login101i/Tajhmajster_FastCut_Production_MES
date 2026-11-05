import type { Lang } from './messages';

/** Inline SVG flags — Windows does not render emoji regional flags. */
export function FlagIcon({ code, className = '' }: { code: Lang; className?: string }) {
  if (code === 'sl') {
    return (
      <svg className={className} viewBox="0 0 24 16" width="24" height="16" aria-hidden>
        <rect width="24" height="16" fill="#fff" />
        <rect y="5.33" width="24" height="5.34" fill="#005ce6" />
        <rect y="10.67" width="24" height="5.33" fill="#ed1c24" />
        {/* simplified crest circle */}
        <circle cx="6.5" cy="6.2" r="2.4" fill="#005ce6" stroke="#ffcc00" strokeWidth="0.6" />
        <circle cx="6.5" cy="6.2" r="1.2" fill="#ed1c24" />
      </svg>
    );
  }
  if (code === 'en') {
    return (
      <svg className={className} viewBox="0 0 24 16" width="24" height="16" aria-hidden>
        <rect width="24" height="16" fill="#012169" />
        <path d="M0 0 L24 16 M24 0 L0 16" stroke="#fff" strokeWidth="3.2" />
        <path d="M0 0 L24 16 M24 0 L0 16" stroke="#C8102E" strokeWidth="1.6" />
        <path d="M12 0 V16 M0 8 H24" stroke="#fff" strokeWidth="5" />
        <path d="M12 0 V16 M0 8 H24" stroke="#C8102E" strokeWidth="2.8" />
      </svg>
    );
  }
  // pl
  return (
    <svg className={className} viewBox="0 0 24 16" width="24" height="16" aria-hidden>
      <rect width="24" height="8" fill="#fff" />
      <rect y="8" width="24" height="8" fill="#DC143C" />
    </svg>
  );
}
