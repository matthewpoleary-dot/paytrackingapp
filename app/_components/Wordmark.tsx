/** The T mark, inline so it costs no request and inherits no colour. */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      className="shrink-0"
    >
      <rect width="64" height="64" rx="15" className="fill-accent" />
      <g className="fill-accent-fg">
        <rect x="12" y="18" width="40" height="8" rx="4" />
        <rect x="28" y="18" width="8" height="30" rx="4" />
      </g>
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <Mark size={26} />
      <span className="t-title">Tally</span>
    </span>
  );
}
