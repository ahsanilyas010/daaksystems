import { useEffect, useRef, useState } from "react";

export interface SearchSelectOption {
  id: number;
  label: string;
}

export function SearchSelect({
  value,
  onChange,
  fetchOptions,
  placeholder,
}: {
  value: SearchSelectOption | null;
  onChange: (option: SearchSelectOption | null) => void;
  fetchOptions: (query: string) => Promise<SearchSelectOption[]>;
  placeholder: string;
}) {
  const [query, setQuery] = useState(value?.label ?? "");
  const [options, setOptions] = useState<SearchSelectOption[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value?.label ?? "");
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      fetchOptions(query).then(setOptions);
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open, fetchOptions]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <input
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(null);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && options.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded border border-gray-200 bg-white shadow-lg">
          {options.map((opt) => (
            <li
              key={opt.id}
              className="cursor-pointer px-3 py-2 text-sm hover:bg-slate-100"
              onClick={() => {
                onChange(opt);
                setQuery(opt.label);
                setOpen(false);
              }}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
