import { Search } from "lucide-react";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchField({ value, onChange, placeholder = "جستجو" }: SearchFieldProps) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 shadow-sm">
      <Search size={16} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border-0 bg-transparent outline-none placeholder:text-slate-400"
        placeholder={placeholder}
        aria-label="جستجو"
      />
    </label>
  );
}
