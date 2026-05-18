import { useId } from "react";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  const gradientId = useId();

  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill={`url(#${gradientId})`} />
      <rect x="1" y="1" width="30" height="30" rx="8" stroke="rgba(255,255,255,0.14)" />
      <path
        d="M10.75 10.75L15 15l-4.25 4.25"
        stroke="#F8FAFC"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M17.5 20.25H22.25" stroke="#F8FAFC" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M20.75 8.75L24 12"
        stroke="#93C5FD"
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.95"
      />
      <defs>
        <linearGradient id={gradientId} x1="4" y1="3.5" x2="28.5" y2="29">
          <stop stopColor="#3B82F6" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function BrandLockup({
  className,
  badgeClassName,
  iconClassName,
  textClassName,
}: {
  className?: string;
  badgeClassName?: string;
  iconClassName?: string;
  textClassName?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5 font-mono font-bold tracking-tight", className)}>
      <div className={cn("grid size-7 shrink-0 place-items-center", badgeClassName)}>
        <BrandMark className={cn("size-full", iconClassName)} />
      </div>
      <span className={cn("text-base", textClassName)}>
        Agent<span className="text-primary">LX</span>
      </span>
    </div>
  );
}
