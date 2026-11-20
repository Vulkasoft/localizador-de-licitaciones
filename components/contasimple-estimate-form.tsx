"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowLeft,
  Search,
  Loader2,
  Plus,
  Trash2,
  Package,
  User,
  FileText,
  Check,
  X,
} from "lucide-react";

type CompanyKey = "peninsula" | "canarias";

interface CustomerResult {
  id: number;
  organization: string;
  name: string | null;
  nif: string;
  city: string;
  province: string;
}

interface ProductResult {
  id: number;
  name: string;
  price: number;
  vat: number;
  description: string | null;
  internalCode: string | null;
}

interface LineItem {
  key: number;
  concept: string;
  detailedDescription: string;
  quantity: number;
  unitAmount: number;
  vatPercentage: number;
  productId: number | null;
  productName: string | null;
}

const COMPANY_CONFIG: Record<CompanyKey, { label: string; vat: number; vatLabel: string; icon: string; activeClasses: string; ring: string }> = {
  peninsula: {
    label: "Península",
    vat: 21,
    vatLabel: "IVA 21%",
    icon: "🇪🇸",
    activeClasses: "border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300",
    ring: "ring-blue-400",
  },
  canarias: {
    label: "Canarias",
    vat: 7,
    vatLabel: "IGIC 7%",
    icon: "🏖️",
    activeClasses: "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300",
    ring: "ring-amber-400",
  },
};

const eur = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

let lineKeyCounter = 1;

interface ContasimpleEstimateFormProps {
  tenderId?: string;
  prefillNombre?: string;
}

export function ContasimpleEstimateForm({ tenderId, prefillNombre }: ContasimpleEstimateFormProps = {}) {
  const router = useRouter();
  const [company, setCompany] = useState<CompanyKey>("canarias");

  // Customer
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerResult[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null);
  const [customerSearched, setCustomerSearched] = useState(false);

  // Products
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ProductResult[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [productSearched, setProductSearched] = useState(false);

  // Lines
  const [lines, setLines] = useState<LineItem[]>([]);

  // Extra fields
  const [notes, setNotes] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [nombreLocal, setNombreLocal] = useState(prefillNombre ?? "");
  const [fechaPlazo, setFechaPlazo] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const cfg = COMPANY_CONFIG[company];

  const switchCompany = (key: CompanyKey) => {
    if (key === company) return;
    setCompany(key);
    // Customer and products belong to the other company: reset
    setSelectedCustomer(null);
    setCustomerResults([]);
    setCustomerSearched(false);
    setProductResults([]);
    setProductSearched(false);
    // Update default VAT on lines that use the previous default
    const prevVat = COMPANY_CONFIG[company].vat;
    const newVat = COMPANY_CONFIG[key].vat;
    setLines((prev) => prev.map((l) => (l.vatPercentage === prevVat ? { ...l, vatPercentage: newVat } : l)));
  };

  const searchCustomers = async () => {
    const q = customerQuery.trim();
    if (!q) return;
    setSearchingCustomers(true);
    try {
      const res = await fetch(`/api/contasimple/customers?company=${company}&query=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error((await res.json()).error || "Error");
      const data = await res.json();
      setCustomerResults(data.customers || []);
      setCustomerSearched(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al buscar clientes");
    } finally {
      setSearchingCustomers(false);
    }
  };

  const searchProducts = async () => {
    const q = productQuery.trim();
    setSearchingProducts(true);
    try {
      const url = q
        ? `/api/contasimple/products?company=${company}&query=${encodeURIComponent(q)}`
        : `/api/contasimple/products?company=${company}&page=1&pageSize=30`;
      const res = await fetch(url);
      if (!res.ok) throw new Error((await res.json()).error || "Error");
      const data = await res.json();
      setProductResults(data.products || []);
      setProductSearched(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al buscar productos");
    } finally {
      setSearchingProducts(false);
    }
  };

  const addProductLine = (p: ProductResult) => {
    setLines((prev) => [
      ...prev,
      {
        key: lineKeyCounter++,
        concept: p.name,
        // Solo rellenar la descripción si aporta algo distinto al nombre del producto
        detailedDescription:
          p.description && p.description.trim() && p.description.trim() !== p.name.trim()
            ? p.description
            : "",
        quantity: 1,
        unitAmount: p.price ?? 0,
        vatPercentage: p.vat ?? cfg.vat,
        productId: p.id,
        productName: p.name,
      },
    ]);
    toast.success(`Línea añadida: ${p.name}`);
  };

  const addManualLine = () => {
    setLines((prev) => [
      ...prev,
      {
        key: lineKeyCounter++,
        concept: "",
        detailedDescription: "",
        quantity: 1,
        unitAmount: 0,
        vatPercentage: cfg.vat,
        productId: null,
        productName: null,
      },
    ]);
  };

  const updateLine = (key: number, patch: Partial<LineItem>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: number) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const subtotal = lines.reduce((acc, l) => acc + (l.unitAmount || 0) * (l.quantity || 0), 0);
  const taxes = lines.reduce((acc, l) => acc + ((l.unitAmount || 0) * (l.quantity || 0) * (l.vatPercentage || 0)) / 100, 0);
  const total = subtotal + taxes;

  const handleSubmit = async () => {
    if (!selectedCustomer) {
      toast.error("Selecciona un cliente de Contasimple");
      return;
    }
    if (lines.length === 0) {
      toast.error("Añade al menos una línea al presupuesto");
      return;
    }
    const invalid = lines.find((l) => !l.concept.trim());
    if (invalid) {
      toast.error("Todas las líneas deben tener un concepto");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/contasimple/estimates/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          targetEntityId: selectedCustomer.id,
          lines: lines.map((l) => ({
            concept: l.concept.trim(),
            detailedDescription: l.detailedDescription.trim() || null,
            quantity: l.quantity || 1,
            unitAmount: l.unitAmount || 0,
            vatPercentage: l.vatPercentage,
            productId: l.productId,
            productName: l.productName,
          })),
          notes: notes.trim() || null,
          expirationDate: expirationDate || null,
          nombre: nombreLocal.trim() || null,
          fechaPlazo: fechaPlazo || null,
          ciudad: selectedCustomer.city || null,
          tenderId: tenderId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear el presupuesto");
      toast.success(`Presupuesto ${data.contasimpleNumber} creado en Contasimple (${cfg.label})`);
      if (tenderId) {
        router.push(`/tenders/${tenderId}`);
      } else if (data.localBudgetId) {
        router.push(`/budgets/${data.localBudgetId}`);
      } else {
        router.push("/contasimple");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear el presupuesto");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link href={tenderId ? `/tenders/${tenderId}` : "/contasimple"}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {tenderId ? "Volver a la licitación" : "Volver a Contasimple"}
          </Button>
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-600 flex items-center justify-center">
            <FileText className="h-5 w-5 text-white" />
          </div>
          Nuevo presupuesto en Contasimple
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Crea un presupuesto real en Contasimple sin salir de GestiónDJI. Se registrará con numeración automática y quedará también como licitación pendiente de revisión aquí.
        </p>
      </div>

      {/* Empresa */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">1. Empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(Object.keys(COMPANY_CONFIG) as CompanyKey[]).map((key) => {
              const c = COMPANY_CONFIG[key];
              const active = company === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => switchCompany(key)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    active
                      ? `${c.activeClasses} ring-2 ring-offset-2 ${c.ring}`
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{c.icon}</span>
                    <div>
                      <h3 className="text-lg font-bold">{c.label}</h3>
                      <p className="text-xs opacity-80">{c.vatLabel} por defecto</p>
                    </div>
                    {active && <Check className="ml-auto h-5 w-5" />}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Cliente */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" />
            2. Cliente de Contasimple ({cfg.label})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedCustomer ? (
            <div className="flex items-center justify-between p-4 rounded-lg border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20">
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{selectedCustomer.organization}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  NIF: {selectedCustomer.nif}
                  {selectedCustomer.city ? ` · ${selectedCustomer.city}` : ""}
                  {selectedCustomer.province ? ` (${selectedCustomer.province})` : ""}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(null)}>
                <X className="h-4 w-4 mr-1" />
                Cambiar
              </Button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchCustomers();
                      }
                    }}
                    placeholder="Buscar cliente por nombre o NIF (p. ej. Mogan)"
                    className="pl-9"
                  />
                </div>
                <Button onClick={searchCustomers} disabled={searchingCustomers || !customerQuery.trim()} className="gap-2">
                  {searchingCustomers ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Buscar
                </Button>
              </div>
              {customerSearched && (
                <div className="mt-3 space-y-2">
                  {customerResults.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      Sin resultados en {cfg.label}. Prueba con parte del nombre o el NIF. Si el cliente no existe, créalo primero en Contasimple.
                    </p>
                  ) : (
                    customerResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCustomer(c)}
                        className="w-full text-left p-3 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        <p className="font-medium text-gray-900 dark:text-white">{c.organization}</p>
                        <p className="text-xs text-gray-500">
                          NIF: {c.nif}
                          {c.city ? ` · ${c.city}` : ""}
                          {c.province ? ` (${c.province})` : ""}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Productos y líneas */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5" />
            3. Líneas del presupuesto
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Product search */}
          <div className="mb-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border">
            <Label className="text-sm font-medium mb-2 block">
              Añadir producto del catálogo de {cfg.label}
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      searchProducts();
                    }
                  }}
                  placeholder="Buscar producto (p. ej. Matrice, Dock, batería) o vacío para listar"
                  className="pl-9"
                />
              </div>
              <Button onClick={searchProducts} disabled={searchingProducts} variant="outline" className="gap-2">
                {searchingProducts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Buscar
              </Button>
            </div>
            {productSearched && (
              <div className="mt-3 max-h-64 overflow-y-auto space-y-1">
                {productResults.length === 0 ? (
                  <p className="text-sm text-gray-500">Sin resultados. Prueba con términos más cortos.</p>
                ) : (
                  productResults.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 p-2 rounded-md border bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/70"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
                        <p className="text-xs text-gray-500">
                          {eur(p.price ?? 0)} · {company === "canarias" ? "IGIC" : "IVA"} {p.vat}%
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => addProductLine(p)} className="gap-1 flex-shrink-0">
                        <Plus className="h-3 w-3" />
                        Añadir
                      </Button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Lines */}
          {lines.length === 0 ? (
            <p className="text-sm text-gray-500 mb-4">
              Aún no hay líneas. Añade productos del catálogo o líneas manuales. Puedes dejar los precios a 0 si están pendientes de valoración.
            </p>
          ) : (
            <div className="space-y-3 mb-4">
              {lines.map((l, idx) => (
                <div key={l.key} className="p-3 rounded-lg border bg-white dark:bg-gray-900">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-mono text-gray-400 mt-2.5 w-5 flex-shrink-0">{idx + 1}.</span>
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-6">
                        <Label className="text-xs text-gray-500">Concepto</Label>
                        <Input
                          value={l.concept}
                          onChange={(e) => updateLine(l.key, { concept: e.target.value })}
                          placeholder="Concepto de la línea"
                        />
                        {l.productId && (
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                            <Package className="h-3 w-3" /> Producto del catálogo
                          </p>
                        )}
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs text-gray-500">Cantidad</Label>
                        <Input
                          type="number"
                          min="0.01"
                          step="1"
                          value={l.quantity}
                          onChange={(e) => updateLine(l.key, { quantity: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs text-gray-500">Precio unit. (€)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.unitAmount}
                          onChange={(e) => updateLine(l.key, { unitAmount: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs text-gray-500">{company === "canarias" ? "IGIC %" : "IVA %"}</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          value={l.vatPercentage}
                          onChange={(e) => updateLine(l.key, { vatPercentage: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeLine(l.key)}
                      className="text-red-500 hover:text-red-600 flex-shrink-0 mt-5"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button variant="outline" onClick={addManualLine} className="gap-2">
            <Plus className="h-4 w-4" />
            Añadir línea manual
          </Button>

          {/* Totals */}
          {lines.length > 0 && (
            <div className="mt-4 pt-4 border-t flex flex-col items-end gap-1 text-sm">
              <p className="text-gray-600 dark:text-gray-400">Base imponible: <span className="font-medium text-gray-900 dark:text-white">{eur(subtotal)}</span></p>
              <p className="text-gray-600 dark:text-gray-400">{company === "canarias" ? "IGIC" : "IVA"}: <span className="font-medium text-gray-900 dark:text-white">{eur(taxes)}</span></p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">Total: {eur(total)}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalles */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">4. Detalles (opcional)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label htmlFor="cs-notes">Notas del presupuesto (visibles en Contasimple)</Label>
            <Textarea
              id="cs-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Referencia del pliego, condiciones, etc."
              rows={3}
            />
          </div>
          <div>
            <Label htmlFor="cs-expiration">Validez del presupuesto</Label>
            <Input id="cs-expiration" type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cs-plazo">Fecha límite del plazo (ficha local)</Label>
            <Input id="cs-plazo" type="date" value={fechaPlazo} onChange={(e) => setFechaPlazo(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="cs-nombre">Nombre para la ficha en GestiónDJI</Label>
            <Input
              id="cs-nombre"
              value={nombreLocal}
              onChange={(e) => setNombreLocal(e.target.value)}
              placeholder="Si se deja vacío se usará el número de presupuesto y el cliente"
            />
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 pb-10">
        <Link href="/contasimple">
          <Button variant="outline">Cancelar</Button>
        </Link>
        <Button onClick={handleSubmit} disabled={submitting} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          {submitting ? "Creando en Contasimple..." : `Crear presupuesto en ${cfg.label}`}
        </Button>
      </div>
    </div>
  );
}
