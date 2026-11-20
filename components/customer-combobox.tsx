"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Loader2, X } from "lucide-react";

interface Customer { id: string; nombre: string; nif?: string | null; }

/**
 * Searchable customer picker. Queries /api/customers?search= (debounced) so it
 * is NOT limited to the first 50 customers like a plain <select>.
 */
export function CustomerCombobox({
  value,
  initialLabel,
  onChange,
  placeholder,
  className,
}: {
  value: string | null;
  initialLabel?: string | null;
  onChange: (id: string | null, label?: string | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState<string | null>(initialLabel ?? null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setLabel(initialLabel ?? null); }, [initialLabel]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/customers?search=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((d) => setResults(Array.isArray(d) ? d : (d?.customers ?? [])))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query, open]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const select = (c: Customer | null) => {
    onChange(c?.id ?? null, c?.nombre ?? null);
    setLabel(c?.nombre ?? null);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={boxRef} className={`relative ${className || ""}`}>
      {value && label ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
          <span className="break-words">{label}</span>
          <button type="button" onClick={() => select(null)} className="text-red-500 hover:text-red-600 inline-flex items-center gap-1 flex-shrink-0" title="Quitar">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder || "Buscar cliente…"}
            className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40"
          />
        </div>
      )}

      {open && !value && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border bg-popover shadow-lg max-h-72 overflow-auto">
          {loading ? (
            <div className="px-3 py-3 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Buscando…</div>
          ) : (
            <>
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => select(c)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-start justify-between gap-2"
                >
                  <span className="break-words">{c.nombre}{c.nif ? <span className="text-muted-foreground"> · {c.nif}</span> : null}</span>
                </button>
              ))}
              {results.length === 0 && (
                <div className="px-3 py-3 text-xs text-muted-foreground">{query.trim() === "" ? "Escribe para buscar…" : "Sin resultados"}</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
