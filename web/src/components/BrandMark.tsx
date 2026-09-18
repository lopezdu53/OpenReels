import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  size?: number;
}

/** Higgsfield-style white squiggle mark. Color via `currentColor`. */
export function BrandMark({ className, size = 28 }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <path
        d="M7.5 22.5c.4-6.8 6.2-9.2 11.2-10.6 3.2-.9 5.3-2.2 5.3-4.4 0-2.4-2.3-4-5.4-4-3.8 0-6.4 2-7.1 5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M24.5 9.5c-.4 6.8-6.2 9.2-11.2 10.6-3.2.9-5.3 2.2-5.3 4.4 0 2.4 2.3 4 5.4 4 3.8 0 6.4-2 7.1-5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
