import { BrandLockup } from "@/components/Brand";

export function PageLoading({ label = "Carregando painel..." }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="flex flex-col items-center gap-5 text-center">
        <BrandLockup badgeClassName="size-9" />
        <div className="space-y-3">
          <div className="mx-auto size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}
