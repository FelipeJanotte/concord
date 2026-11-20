export function ConcordLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <path
        d="M390.8 142.9A176 176 0 1 0 390.8 369.1"
        fill="none"
        className="stroke-logo"
        strokeWidth={96}
        strokeLinecap="round"
      />
      <circle cx={256} cy={256} r={64} className="fill-logo-core" />
    </svg>
  )
}
