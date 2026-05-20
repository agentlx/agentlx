import { BRAND_MARK_URL } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={BRAND_MARK_URL}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn("object-contain", className)}
    />
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
