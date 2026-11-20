"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Pencil, Plus, Trash2, Package, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface LineItem {
  concept: string;
  quantity: number;
  unitAmount: number;
  vatPercentage: number;
  discountPercentage?: number;
  detailedDescription?: string | null;
  productId?: number | null;
  productName?: string | null;
  productSku?: string | null;
  totalTaxableAmount?: number;
}

interface Props {
  budget: any;
  onSynced?: () => void;
}

function parseLines(budget: any): LineItem[] {
  if (!budget?.lineasJson) return [];
  try {
    const arr = JSON.parse(budget.lineasJson);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

const euro = (n: number | null | undefined) =>
  (typeof n === "number" ? n : 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

export function BudgetLinesEditor({ budget, onSynced }: Props) {
  const isContasimple = !!budget?.contasimpleId;
  const lines = parseLines(budget);
  const [syncing, setSyncing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<LineItem[]>([]);
  const didSync = useRef(false);

  // Live-on-open: pull the latest estimate + PDF from Contasimple silently.
  useEffect(() => {
    if (!isContasimple || didSync.current) return;
    didSync.current = true;
    (async () => {
      setSyncing(true);
      try {
        const res = await fetch(`/api/budgets/${budget.id}/contasimple-sync`, { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          if (data?.synced) onSynced?.();
        }
      } catch {
        /* silent */
      } finally {
        setSyncing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isContasimple, budget?.id]);

  const openEditor = () => {
    setDraft(
      lines.map((l) => ({
        concept: l.concept || "",
        quantity: Number(l.quantity) || 0,
        unitAmount: Number(l.unitAmount) || 0,
        vatPercentage: Number(l.vatPercentage) || 0,
        discountPercentage: Number(l.discountPercentage) || 0,
        detailedDescription: l.detailedDescription || "",
        productId: l.productId ?? null,
        productName: l.productName ?? null,
        productSku: l.productSku ?? null,
      }))
    );
    setEditOpen(true);
  };

  const updateDraft = (idx: number, patch: Partial<LineItem>) => {
    setDraft((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };
  const addLine = () =>
    setDraft((prev) => [...prev, { concept: "", quantity: 1, unitAmount: 0, vatPercentage: budget?.contasimpleCompany === "canarias" ? 7 : 21, discountPercentage: 0, detailedDescription: "" }]);
  const removeLine = (idx: number) => setDraft((prev) => prev.filter((_, i) => i !== idx));

  const draftBase = draft.reduce((s, l) => {
    const disc = Number(l.discountPercentage) || 0;
    return s + (Number(l.quantity) || 0) * (Number(l.unitAmount) || 0) * (1 - disc / 100);
  }, 0);

  const saveLines = async () => {
    if (draft.length === 0) {
      toast.error("Debe haber al menos una línea");
      return;
    }
    if (draft.some((l) => !l.concept.trim())) {
      toast.error("Todas las líneas necesitan un concepto");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/budgets/${budget.id}/contasimple-lines`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: draft.map((l) => ({
            concept: l.concept.trim(),
            quantity: Number(l.quantity) || 0,
            unitAmount: Number(l.unitAmount) || 0,
            vatPercentage: Number(l.vatPercentage) || 0,
            discountPercentage: Number(l.discountPercentage) || 0,
            detailedDescription: l.detailedDescription || null,
            productId: l.productId ?? null,
            productName: l.productName ?? null,
            productSku: l.productSku ?? null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al guardar");
      toast.success("Presupuesto actualizado en Contasimple");
      setEditOpen(false);
      onSynced?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (!isContasimple && lines.length === 0) return null;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Package className="h-5 w-5 text-blue-600" />
          Productos y líneas
          {budget?.contasimpleNumber && (
            <span className="text-sm font-normal text-gray-500">({budget.contasimpleNumber})</span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {syncing && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" /> Sincronizando…
            </span>
          )}
          {isContasimple && (
            <Button size="sm" variant="outline" className="gap-2" onClick={openEditor}>
              <Pencil className="h-4 w-4" /> Editar líneas
            </Button>
          )}
        </div>
      </div>

      {lines.length === 0 ? (
        <p className="text-sm text-gray-500 py-4">Sin líneas registradas.</p>
      ) : (
        <>
        {/* Vista mobile: tarjetas */}
        <div className="sm:hidden space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <div className="font-medium text-gray-900 dark:text-white text-sm">{l.concept}</div>
              {l.detailedDescription && (
                <div className="text-xs text-gray-500 whitespace-pre-wrap mt-0.5">{l.detailedDescription}</div>
              )}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-xs text-gray-600 dark:text-gray-400">
                <span>Cant.: <span className="text-gray-900 dark:text-white">{l.quantity}</span></span>
                <span>Precio: <span className="text-gray-900 dark:text-white">{euro(l.unitAmount)}</span></span>
                <span>Dto.: <span className="text-gray-900 dark:text-white">{(Number(l.discountPercentage) || 0)}%</span></span>
                <span>IVA/IGIC: <span className="text-gray-900 dark:text-white">{(Number(l.vatPercentage) || 0)}%</span></span>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 flex justify-between text-sm">
                <span className="text-gray-500">Base</span>
                <span className="font-semibold">{euro(l.totalTaxableAmount ?? l.quantity * l.unitAmount)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500">
                <th className="py-2 pr-3 font-medium">Concepto</th>
                <th className="py-2 px-3 font-medium text-right">Cant.</th>
                <th className="py-2 px-3 font-medium text-right">Precio</th>
                <th className="py-2 px-3 font-medium text-right">Dto.</th>
                <th className="py-2 px-3 font-medium text-right">IVA/IGIC</th>
                <th className="py-2 pl-3 font-medium text-right">Base</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-gray-800 align-top">
                  <td className="py-2 pr-3">
                    <div className="font-medium text-gray-900 dark:text-white">{l.concept}</div>
                    {l.detailedDescription && (
                      <div className="text-xs text-gray-500 whitespace-pre-wrap">{l.detailedDescription}</div>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">{l.quantity}</td>
                  <td className="py-2 px-3 text-right">{euro(l.unitAmount)}</td>
                  <td className="py-2 px-3 text-right">{(Number(l.discountPercentage) || 0)}%</td>
                  <td className="py-2 px-3 text-right">{(Number(l.vatPercentage) || 0)}%</td>
                  <td className="py-2 pl-3 text-right">{euro(l.totalTaxableAmount ?? l.quantity * l.unitAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {(budget?.baseImponible != null || budget?.totalConIva != null) && (
        <div className="mt-4 flex flex-col items-end gap-1 text-sm">
          <div className="flex justify-between w-full max-w-xs">
            <span className="text-gray-500">Base imponible</span>
            <span className="font-medium">{euro(budget.baseImponible)}</span>
          </div>
          <div className="flex justify-between w-full max-w-xs">
            <span className="text-gray-500">IVA / IGIC</span>
            <span className="font-medium">{euro(budget.totalIva)}</span>
          </div>
          <div className="flex justify-between w-full max-w-xs border-t border-gray-200 dark:border-gray-700 pt-1">
            <span className="font-semibold">Total</span>
            <span className="font-bold text-lg">{euro(budget.totalConIva)}</span>
          </div>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar líneas del presupuesto</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-500 -mt-2">
            Los cambios se enviarán a Contasimple ({budget?.contasimpleCompany === "canarias" ? "Canarias" : "Península"}) y se actualizará el PDF.
          </p>
          <div className="space-y-4 mt-2">
            {draft.map((l, i) => (
              <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">Concepto</Label>
                    <Input value={l.concept} onChange={(e) => updateDraft(i, { concept: e.target.value })} />
                  </div>
                  <Button size="icon" variant="ghost" className="mt-5 text-red-600" onClick={() => removeLine(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div>
                  <Label className="text-xs">Descripción (opcional)</Label>
                  <Textarea
                    rows={2}
                    value={l.detailedDescription || ""}
                    onChange={(e) => updateDraft(i, { detailedDescription: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <Label className="text-xs">Cantidad</Label>
                    <Input type="number" step="any" value={l.quantity} onChange={(e) => updateDraft(i, { quantity: parseFloat(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="text-xs">Precio unitario</Label>
                    <Input type="number" step="any" value={l.unitAmount} onChange={(e) => updateDraft(i, { unitAmount: parseFloat(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="text-xs">Descuento %</Label>
                    <Input type="number" step="any" value={l.discountPercentage || 0} onChange={(e) => updateDraft(i, { discountPercentage: parseFloat(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="text-xs">IVA/IGIC %</Label>
                    <Input type="number" step="any" value={l.vatPercentage} onChange={(e) => updateDraft(i, { vatPercentage: parseFloat(e.target.value) })} />
                  </div>
                </div>
              </div>
            ))}
            <Button variant="outline" className="gap-2" onClick={addLine}>
              <Plus className="h-4 w-4" /> Añadir línea
            </Button>
            <div className="text-right text-sm text-gray-600">
              Base imponible estimada: <span className="font-semibold">{euro(draftBase)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={saveLines} disabled={saving}>
              {saving ? "Guardando…" : "Guardar y enviar a Contasimple"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
