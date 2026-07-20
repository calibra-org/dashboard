import { Grid3X3 } from "lucide-react";

interface LolitBrandProps {
  compact?: boolean;
  showGrid?: boolean;
}

export function LolitBrand({ compact = false, showGrid = true }: LolitBrandProps) {
  return (
    <div className="flex items-center justify-between gap-4" dir="ltr">
      <div className="flex items-center gap-3">
        <span className={compact ? "text-2xl font-extrabold tracking-tight text-violet-600" : "text-[34px] font-extrabold tracking-[-0.045em] text-violet-600"}>lolit</span>
        <span className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-extrabold tracking-wide text-white shadow-[0_5px_16px_rgba(124,58,237,0.23)]">SEO V2</span>
      </div>
      {showGrid ? <Grid3X3 className="text-slate-900" size={compact ? 22 : 25} strokeWidth={2.2} /> : null}
    </div>
  );
}
