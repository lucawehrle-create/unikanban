interface LogoProps {
  size?: number
  className?: string
}

/** SemBan-Markenzeichen: navy Kachel, weiße Balken, gelbes X, Coral-Balken. */
export function Logo({ size = 36, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      role="img"
      aria-label="SemBan"
    >
      <rect width="512" height="512" rx="112" fill="#2a2a6e" />
      <rect x="120" y="220" width="64" height="172" rx="32" fill="#ffffff" />
      <rect x="216" y="150" width="64" height="242" rx="32" fill="#ffffff" />
      <rect x="316" y="178" width="76" height="76" rx="20" fill="#f5c645" />
      <path
        d="M340 202 L368 230 M368 202 L340 230"
        stroke="#16161d"
        strokeWidth="18"
        strokeLinecap="round"
      />
      <rect x="316" y="272" width="76" height="120" rx="38" fill="#e9633c" />
    </svg>
  )
}
