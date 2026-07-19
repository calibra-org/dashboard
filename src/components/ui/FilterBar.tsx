interface FilterBarProps {
  activeFilter: string;
  onChange: (value: string) => void;
  options: string[];
}

export function FilterBar({ activeFilter, onChange, options }: FilterBarProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option === activeFilter;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              active ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
