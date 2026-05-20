import { useId } from "react";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  const gradientId = useId();
  const panelGradientId = `${gradientId}-panel`;

  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#07111F" />
      <path
        d="M16 4.25L26.25 9.9V18.65C26.25 24.2 21.9 27.65 16 29.25C10.1 27.65 5.75 24.2 5.75 18.65V9.9L16 4.25Z"
        fill={`url(#${gradientId})`}
      />
      <path
        d="M16 5.95L24.65 10.7V18.25C24.65 22.85 21.15 25.85 16 27.35C10.85 25.85 7.35 22.85 7.35 18.25V10.7L16 5.95Z"
        fill="#0B1728"
        stroke="#38BDF8"
        strokeWidth="1.2"
      />
      <path
        d="M10.2 12.85H20.7C21.35 12.85 21.85 13.35 21.85 14V21.15C21.85 21.8 21.35 22.3 20.7 22.3H10.2C9.55 22.3 9.05 21.8 9.05 21.15V14C9.05 13.35 9.55 12.85 10.2 12.85Z"
        fill={`url(#${panelGradientId})`}
        stroke="#475569"
        strokeWidth="0.9"
      />
      <path
        d="M12.05 16L14.25 18L12.05 20"
        stroke="#F8FAFC"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M15.7 20H19.45" stroke="#5EEAD4" strokeWidth="1.55" strokeLinecap="round" />
      <circle cx="22.1" cy="9.95" r="1.35" fill="#5EEAD4" />
      <circle cx="23.9" cy="18.45" r="1" fill="#38BDF8" />
      <circle cx="8.1" cy="18.45" r="1" fill="#38BDF8" />
      <defs>
        <linearGradient id={gradientId} x1="6" y1="4" x2="26" y2="28">
          <stop stopColor="#1D4ED8" />
          <stop offset="0.55" stopColor="#0891B2" />
          <stop offset="1" stopColor="#14B8A6" />
        </linearGradient>
        <linearGradient id={panelGradientId} x1="9" y1="13" x2="22" y2="22">
          <stop stopColor="#111827" />
          <stop offset="1" stopColor="#020617" />
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
