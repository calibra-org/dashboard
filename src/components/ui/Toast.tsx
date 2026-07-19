interface ToastProps {
  message: string;
  tone?: "success" | "warning" | "danger";
}

export function Toast({ message, tone = "success" }: ToastProps) {
  const toneClasses = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
  };

  return <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${toneClasses[tone]}`}>{message}</div>;
}
