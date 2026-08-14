"use client";

// The design's search bar: "Search for a meeting or Ask electron about your
// meetings" with "Ask electron" in violet, magnifier left, bookmark right.
// Placeholder styling isn't possible on a native input, so the styled hint
// overlays until the field has a value.

export function AskSearch({
  value,
  onChange,
  before,
  after,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Plain text before "Ask electron". */
  before: string;
  /** Plain text after "Ask electron". */
  after: string;
}) {
  return (
    <div className="relative flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4 shrink-0 text-gray-400"><circle cx="9" cy="9" r="5.5"/><path d="m13.5 13.5 3 3"/></svg>
      <div className="relative flex-1">
        {value === "" && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center text-sm text-gray-400">
            {before}
            <span className="mx-1 font-medium text-indigo-600">Ask electron</span>
            {after}
          </span>
        )}
        <input
          className="w-full bg-transparent text-sm outline-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4 shrink-0 text-gray-400"><path d="M6 3.5h8a1 1 0 0 1 1 1v12l-5-3-5 3v-12a1 1 0 0 1 1-1Z"/></svg>
    </div>
  );
}
