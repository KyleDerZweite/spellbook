import { cn } from "@/lib/utils"

interface SpellbookIconProps {
  className?: string
}

export function SpellbookIcon({ className }: SpellbookIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      stroke="#34d399"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-6 w-6", className)}
    >
      {/* Open spellbook */}
      <path d="M4 8c0 0 4-2 12-2s12 2 12 2v18c0 0-4-1.5-12-1.5S4 26 4 26V8z" />
      {/* Center spine/binding */}
      <path d="M16 6v18.5" />
      {/* Left page lines */}
      <path d="M7 11h6" strokeOpacity="0.6" />
      <path d="M7 14h5" strokeOpacity="0.6" />
      {/* Right page lines */}
      <path d="M19 11h6" strokeOpacity="0.6" />
      <path d="M19 14h5" strokeOpacity="0.6" />
      {/* Magic sparkles/stars */}
      <circle cx="10" cy="19" r="0.8" fill="#34d399ff" stroke="none" />
      <circle cx="22" cy="18" r="1" fill="#34d399ff" stroke="none" />
      <circle cx="14" cy="21" r="0.6" fill="#34d399ff" stroke="none" />
      {/* Magical wisps rising from book */}
      <path d="M12 4c1.5 1 0.5 2.5 2 3" stroke="#5ae3b1ff" opacity="0.7" strokeWidth="1" />
      <path d="M20 3.5c-1.5 1 -0.5 2 -2 2.8" stroke="#5ae3b1ff" opacity="0.7" strokeWidth="1" />
    </svg>
  )
}
