interface SectionCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function SectionCard({ title, subtitle, children }: SectionCardProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <p className="text-sm font-medium text-slate-500">{subtitle}</p>
        <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
      </div>
      {children}
    </section>
  );
}
