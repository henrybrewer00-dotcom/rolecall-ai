import { Search, ArrowRight } from "lucide-react";
import { Spinner } from "./ui";

/**
 * AI search bar — light, boxy, on-brand (resolve.ai): white field with a crisp
 * black border and a lime action square on the right.
 */
export function AISearchBar({
  value,
  onChange,
  onSubmit,
  loading,
  placeholder = "Ask anything — 'who's struggling to close?'",
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex w-full items-stretch overflow-hidden rounded-[4px] border border-ink-900 bg-white shadow-sm transition focus-within:ring-4 focus-within:ring-accent-300/40">
      <span className="grid w-12 shrink-0 place-items-center text-ink-400">
        <Search className="h-5 w-5" />
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
        }}
        placeholder={placeholder}
        type="text"
        className="min-w-0 flex-1 bg-transparent py-3.5 pr-3 text-base text-ink-900 placeholder:text-ink-400 focus:outline-none"
      />
      <button
        onClick={onSubmit}
        disabled={loading}
        aria-label="Search"
        className="grid w-14 shrink-0 place-items-center border-l border-ink-900 bg-accent-300 text-ink-900 transition hover:bg-accent-400 disabled:opacity-60"
      >
        {loading ? <Spinner className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
      </button>
    </div>
  );
}
