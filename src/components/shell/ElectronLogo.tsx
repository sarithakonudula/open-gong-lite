// The electron brand: an atom-flower mark (three petal orbits around a white
// nucleus) plus the lowercase wordmark. One source for sidebar, login, share
// header, and favicon (app/icon.svg mirrors the mark — keep them in sync).

export function ElectronMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <g transform="translate(32 32)">
        <ellipse rx="29" ry="12.5" fill="#D9CDF8" transform="rotate(60)" />
        <ellipse rx="29" ry="12.5" fill="#4053E9" />
        <ellipse
          rx="29"
          ry="12.5"
          fill="#8B2FE8"
          transform="rotate(-60)"
          opacity="0.92"
        />
        <ellipse rx="8.5" ry="13.5" fill="#F9A8E4" />
        <circle r="5.5" fill="#ffffff" />
      </g>
    </svg>
  );
}

export function ElectronLogo({
  markClassName = "h-7 w-7",
  textClassName = "text-[17px]",
}: {
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <ElectronMark className={`shrink-0 ${markClassName}`} />
      <span
        className={`font-bold lowercase tracking-tight text-fg ${textClassName}`}
      >
        electron
      </span>
    </span>
  );
}
