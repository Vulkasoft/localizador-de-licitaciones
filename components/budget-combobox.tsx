"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Loader2, X, FileSpreadsheet } from "lucide-react";

interface BudgetOpt {
  id: string;
  contasimpleNumber?: string | null;
  nombre?: string | null;
  cliente?: string | null;
}

function budgetLabel(b: BudgetOpt): string {
  const num = b.contasimpleNumber ? b.contasimpleNumber : null;
  const name = b.nombre || b.cliente || "(sin nombre)";
  return num ? `${num} · ${name}` : name;
}

/**
 * Searchable budget picker. Queries /api/budgets?numero=<q> (debounced) ordered
 * by most recent, so you can type the budget number to find it instead of
 * scrolling a long <select>.
 */
export function BudgetCombobox({
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
  const [results, setResults] = useState<BudgetOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState<string | null>(initialLabel ?? null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setLabel(initialLabel ?? null); }, [initialLabel]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (query.trim()) p.set("numero", query.trim());
      p.set("sortBy", "fecha_desc");
      p.set("limit", "20");
      fetch(`/api/budgets?${p.toString()}`)
        .then((r) => r.json())
        .then((d) => setResults(Array.isArray(d?.budgets) ? d.budgets : []))
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

  const select = (b: BudgetOpt | null) => {
    onChange(b?.id ?? null, b ? budgetLabel(b) : null);
    setLabel(b ? budgetLabel(b) : null);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={boxRef} className={`relative ${className || ""}`}>
      {value && label ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
          <span className="break-words min-w-0">{label}</span>
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
            placeholder={placeholder || "Escribe el nº de presupuesto…"}
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
              {results.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => select(b)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-start gap-2"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-emerald-600" />
                  <span className="break-words min-w-0">
                    {b.contasimpleNumber ? <span className="font-medium">{b.contasimpleNumber}</span> : null}
                    {b.contasimpleNumber ? " · " : null}
                    <span className="text-muted-foreground">{b.nombre || b.cliente || "(sin nombre)"}</span>
                  </span>
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
