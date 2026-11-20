"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  RefreshCw,
  Download,
  Users,
  FileText,
  Check,
  ChevronLeft,
  ChevronRight,
  Search,
  Building2,
  Phone,
  Mail,
  MapPin,
  ArrowLeft,
  Loader2,
  Package,
} from "lucide-react";
import Link from "next/link";

type CompanyKey = "peninsula" | "canarias";

interface ContasimpleCustomer {
  id: number;
  organization: string;
  name: string | null;
  nif: string;
  province: string;
  city: string;
  phone: string;
  email: string;
  address: string;
}

interface ContasimpleEstimate {
  id: number;
  number: string;
  entityString: string;
  presupuestoDate: string;
  status: string;
  totalAmount: number;
  totalTaxableAmount: number;
  totalVatAmount: number;
  target: {
    organization: string;
    province: string;
    city: string;
  };
  lines: { concept: string; quantity: number; unitTaxableAmount: number }[];
}

interface CompanyInfo {
  name: string;
  nif: string;
  email: string;
  region: string;
}

type Tab = "estimates" | "customers" | "products";

interface ContasimpleProduct {
  id: number;
  name: string;
  price: number;
  vat: number;
  description: string | null;
  internalCode: string | null;
}

const COMPANY_CONFIG: Record<CompanyKey, { label: string; shortLabel: string; color: string; bgColor: string; borderColor: string; hoverBg: string; icon: string }> = {
  peninsula: {
    label: "Península",
    shortLabel: "PEN",
    color: "text-blue-700 dark:text-blue-300",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    borderColor: "border-blue-200 dark:border-blue-800",
    hoverBg: "hover:bg-blue-100 dark:hover:bg-blue-900/40",
    icon: "🇪🇸",
  },
  canarias: {
    label: "Canarias",
    shortLabel: "CAN",
    color: "text-amber-700 dark:text-amber-300",
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
    borderColor: "border-amber-200 dark:border-amber-800",
    hoverBg: "hover:bg-amber-100 dark:hover:bg-amber-900/40",
    icon: "🏖️",
  },
};

export function ContasimpleSync() {
  const [activeTab, setActiveTab] = useState<Tab>("estimates");
  const [selectedCompany, setSelectedCompany] = useState<CompanyKey>("peninsula");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  // Company info
  const [companyInfo, setCompanyInfo] = useState<Record<CompanyKey, CompanyInfo | null>>({
    peninsula: null,
    canarias: null,
  });
  const [loadingCompanyInfo, setLoadingCompanyInfo] = useState<Record<CompanyKey, boolean>>({
    peninsula: false,
    canarias: false,
  });

  // Estimates state
  const [estimates, setEstimates] = useState<ContasimpleEstimate[]>([]);
  const [estimatesTotal, setEstimatesTotal] = useState(0);
  const [estimatesPage, setEstimatesPage] = useState(1);
  const [selectedEstimates, setSelectedEstimates] = useState<Set<number>>(new Set());

  // Customers state
  const [customers, setCustomers] = useState<ContasimpleCustomer[]>([]);
  const [customersTotal, setCustomersTotal] = useState(0);
  const [customersPage, setCustomersPage] = useState(1);
  const [selectedCustomers, setSelectedCustomers] = useState<Set<number>>(new Set());

  // Products state
  const [products, setProducts] = useState<ContasimpleProduct[]>([]);
  const [productsTotal, setProductsTotal] = useState(0);
  const [productsPage, setProductsPage] = useState(1);

  const [searchTerm, setSearchTerm] = useState("");
  const pageSize = 20;

  // Load company info on mount
  useEffect(() => {
    const loadInfo = async (company: CompanyKey) => {
      setLoadingCompanyInfo(prev => ({ ...prev, [company]: true }));
      try {
        const res = await fetch(`/api/contasimple/company?company=${company}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setCompanyInfo(prev => ({ ...prev, [company]: data.info }));
      } catch {
        // silently fail
      } finally {
        setLoadingCompanyInfo(prev => ({ ...prev, [company]: false }));
      }
    };
    loadInfo("peninsula");
    loadInfo("canarias");
  }, []);

  // Reset data when switching company
  const switchCompany = (company: CompanyKey) => {
    if (company === selectedCompany) return;
    setSelectedCompany(company);
    setEstimates([]);
    setEstimatesTotal(0);
    setEstimatesPage(1);
    setSelectedEstimates(new Set());
    setCustomers([]);
    setCustomersTotal(0);
    setCustomersPage(1);
    setSelectedCustomers(new Set());
    setProducts([]);
    setProductsTotal(0);
    setProductsPage(1);
    setSearchTerm("");
  };

  const fetchEstimates = async (page: number = 1) => {
    setLoading(true);
    try {
      const q = searchTerm.trim();
      const url = q
        ? `/api/contasimple/estimates?company=${selectedCompany}&query=${encodeURIComponent(q)}`
        : `/api/contasimple/estimates?company=${selectedCompany}&page=${page}&pageSize=${pageSize}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error");
      }
      const data = await res.json();
      setEstimates(data.estimates);
      setEstimatesTotal(data.total);
      setEstimatesPage(q ? 1 : page);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar presupuestos");
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async (page: number = 1) => {
    setLoading(true);
    try {
      const q = searchTerm.trim();
      const url = q
        ? `/api/contasimple/customers?company=${selectedCompany}&query=${encodeURIComponent(q)}`
        : `/api/contasimple/customers?company=${selectedCompany}&page=${page}&pageSize=${pageSize}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error");
      }
      const data = await res.json();
      setCustomers(data.customers);
      setCustomersTotal(data.total);
      setCustomersPage(q ? 1 : page);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar clientes");
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async (page: number = 1) => {
    setLoading(true);
    try {
      const q = searchTerm.trim();
      const url = q
        ? `/api/contasimple/products?company=${selectedCompany}&query=${encodeURIComponent(q)}`
        : `/api/contasimple/products?company=${selectedCompany}&page=${page}&pageSize=${pageSize}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error");
      }
      const data = await res.json();
      setProducts(data.products);
      setProductsTotal(data.total);
      setProductsPage(q ? 1 : page);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar productos");
    } finally {
      setLoading(false);
    }
  };

  const handleLoad = () => {
    if (activeTab === "estimates") fetchEstimates(1);
    else if (activeTab === "customers") fetchCustomers(1);
    else fetchProducts(1);
  };

  const handleImportEstimates = async () => {
    const ids = selectedEstimates.size > 0 ? Array.from(selectedEstimates) : undefined;
    const companyLabel = COMPANY_CONFIG[selectedCompany].label;
    if (!ids && estimates.length > 0) {
      if (!confirm(`¿Importar los ${estimatesTotal} presupuestos de ${companyLabel}?`)) return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/contasimple/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimateIds: ids, company: selectedCompany }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Error");
      const data = await res.json();
      toast.success(
        `${companyLabel}: ${data.imported} nuevos, ${data.updated} actualizados${data.skipped > 0 ? `, ${data.skipped} omitidos` : ""}`
      );
      setSelectedEstimates(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al importar");
    } finally {
      setImporting(false);
    }
  };

  const handleImportCustomers = async () => {
    const ids = selectedCustomers.size > 0 ? Array.from(selectedCustomers) : undefined;
    const companyLabel = COMPANY_CONFIG[selectedCompany].label;
    if (!ids && customers.length > 0) {
      if (!confirm(`¿Importar los ${customersTotal} clientes de ${companyLabel}?`)) return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/contasimple/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerIds: ids, company: selectedCompany }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Error");
      const data = await res.json();
      toast.success(
        `${companyLabel}: ${data.imported} nuevos, ${data.updated} actualizados${data.skipped > 0 ? `, ${data.skipped} omitidos` : ""}`
      );
      setSelectedCustomers(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al importar");
    } finally {
      setImporting(false);
    }
  };

  const toggleEstimate = (id: number) => {
    setSelectedEstimates((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCustomer = (id: number) => {
    setSelectedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllEstimates = () => {
    if (selectedEstimates.size === estimates.length) {
      setSelectedEstimates(new Set());
    } else {
      setSelectedEstimates(new Set(estimates.map((e) => e.id)));
    }
  };

  const selectAllCustomers = () => {
    if (selectedCustomers.size === customers.length) {
      setSelectedCustomers(new Set());
    } else {
      setSelectedCustomers(new Set(customers.map((c) => c.id)));
    }
  };

  // Search is performed server-side (across ALL pages), so render the results
  // returned by the API directly instead of re-filtering the loaded page.
  const filteredEstimates = estimates;
  const filteredCustomers = customers;

  const totalPages = searchTerm.trim()
    ? 1
    : activeTab === "estimates"
    ? Math.ceil(estimatesTotal / pageSize)
    : activeTab === "customers"
    ? Math.ceil(customersTotal / pageSize)
    : Math.ceil(productsTotal / pageSize);
  const currentPage =
    activeTab === "estimates" ? estimatesPage : activeTab === "customers" ? customersPage : productsPage;
  const config = COMPANY_CONFIG[selectedCompany];

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-6">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver al Dashboard
          </Button>
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">CS</span>
          </div>
          Contasimple
        </h1>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-1">
          <p className="text-gray-600 dark:text-gray-400">
            Importa presupuestos y clientes desde Contasimple
          </p>
          <Link href="/contasimple/nuevo">
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <FileText className="h-4 w-4" />
              Nuevo presupuesto
            </Button>
          </Link>
        </div>
      </div>

      {/* Company Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {(["peninsula", "canarias"] as CompanyKey[]).map((key) => {
          const cfg = COMPANY_CONFIG[key];
          const info = companyInfo[key];
          const isActive = selectedCompany === key;
          const isLoading = loadingCompanyInfo[key];

          return (
            <button
              key={key}
              onClick={() => switchCompany(key)}
              className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                isActive
                  ? `${cfg.borderColor} ${cfg.bgColor} ring-2 ring-offset-2 ${
                      key === "peninsula" ? "ring-blue-400" : "ring-amber-400"
                    }`
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              {isActive && (
                <div className="absolute top-3 right-3">
                  <div className={`h-3 w-3 rounded-full ${
                    key === "peninsula" ? "bg-blue-500" : "bg-amber-500"
                  } animate-pulse`} />
                </div>
              )}
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{cfg.icon}</span>
                <div>
                  <h3 className={`text-lg font-bold ${
                    isActive ? cfg.color : "text-gray-700 dark:text-gray-300"
                  }`}>
                    {cfg.label}
                  </h3>
                  {isLoading ? (
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Conectando...
                    </div>
                  ) : info ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {info.name}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">No conectada</p>
                  )}
                </div>
              </div>
              {info && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                  <span>NIF: {info.nif}</span>
                  <span>{info.email}</span>
                  <span className="italic">{info.region}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 sm:flex gap-2 mb-6">
        <Button
          variant={activeTab === "estimates" ? "default" : "outline"}
          onClick={() => {
            setActiveTab("estimates");
            setSearchTerm("");
          }}
          className="gap-2 px-2 sm:px-4"
        >
          <FileText className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">Presupuestos</span>
        </Button>
        <Button
          variant={activeTab === "customers" ? "default" : "outline"}
          onClick={() => {
            setActiveTab("customers");
            setSearchTerm("");
          }}
          className="gap-2 px-2 sm:px-4"
        >
          <Users className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">Clientes</span>
        </Button>
        <Button
          variant={activeTab === "products" ? "default" : "outline"}
          onClick={() => {
            setActiveTab("products");
            setSearchTerm("");
          }}
          className="gap-2 px-2 sm:px-4"
        >
          <Package className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">Productos</span>
        </Button>
      </div>

      {/* Action bar */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <Button onClick={handleLoad} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Cargando..." : `Cargar de ${config.label}`}
            </Button>

            {activeTab === "estimates" && estimates.length > 0 && (
              <Button
                onClick={handleImportEstimates}
                disabled={importing}
                variant="outline"
                className="gap-2 text-emerald-600 border-emerald-300 hover:bg-emerald-50"
              >
                <Download className="h-4 w-4" />
                {importing
                  ? "Importando..."
                  : selectedEstimates.size > 0
                  ? `Importar ${selectedEstimates.size} seleccionados`
                  : `Importar todos (${estimatesTotal})`}
              </Button>
            )}

            {activeTab === "customers" && customers.length > 0 && (
              <Button
                onClick={handleImportCustomers}
                disabled={importing}
                variant="outline"
                className="gap-2 text-emerald-600 border-emerald-300 hover:bg-emerald-50"
              >
                <Download className="h-4 w-4" />
                {importing
                  ? "Importando..."
                  : selectedCustomers.size > 0
                  ? `Importar ${selectedCustomers.size} seleccionados`
                  : `Importar todos (${customersTotal})`}
              </Button>
            )}

            {(estimates.length > 0 || customers.length > 0 || activeTab === "products" || searchTerm.trim()) && (
              <div className="relative w-full sm:w-64 sm:ml-auto">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleLoad();
                    }
                  }}
                  placeholder="Buscar y pulsa Enter..."
                  className="pl-9 w-full"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {activeTab === "estimates" && estimates.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg flex items-center gap-2">
                <span>{config.icon}</span>
                Presupuestos de {config.label} ({estimatesTotal})
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={selectAllEstimates}>
                {selectedEstimates.size === estimates.length
                  ? "Deseleccionar todo"
                  : "Seleccionar todo"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filteredEstimates.map((est) => (
                <div
                  key={est.id}
                  onClick={() => toggleEstimate(est.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedEstimates.has(est.id)
                      ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  }`}
                >
                  <div
                    className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedEstimates.has(est.id)
                        ? "bg-emerald-500 border-emerald-500"
                        : "border-gray-300 dark:border-gray-600"
                    }`}
                  >
                    {selectedEstimates.has(est.id) && (
                      <Check className="h-3 w-3 text-white" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-blue-600 dark:text-blue-400">
                        {est.number}
                      </span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {est.entityString}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                      <span>
                        {new Date(est.presupuestoDate).toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          timeZone: "UTC",
                        })}
                      </span>
                      <span>{est.target?.city}, {est.target?.province}</span>
                      {est.lines.length > 0 && (
                        <span className="truncate max-w-[300px]">
                          {est.lines[0].concept.trim()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {est.totalAmount.toLocaleString("es-ES", {
                        style: "currency",
                        currency: "EUR",
                      })}
                    </p>
                    <p className="text-xs text-gray-500">{est.status}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-3 mt-6 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1 || loading}
                  onClick={() => fetchEstimates(currentPage - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-gray-600">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages || loading}
                  onClick={() => fetchEstimates(currentPage + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "customers" && customers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg flex items-center gap-2">
                <span>{config.icon}</span>
                Clientes de {config.label} ({customersTotal})
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={selectAllCustomers}>
                {selectedCustomers.size === customers.length
                  ? "Deseleccionar todo"
                  : "Seleccionar todo"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filteredCustomers.map((cust) => (
                <div
                  key={cust.id}
                  onClick={() => toggleCustomer(cust.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedCustomers.has(cust.id)
                      ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  }`}
                >
                  <div
                    className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedCustomers.has(cust.id)
                        ? "bg-emerald-500 border-emerald-500"
                        : "border-gray-300 dark:border-gray-600"
                    }`}
                  >
                    {selectedCustomers.has(cust.id) && (
                      <Check className="h-3 w-3 text-white" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <span className="font-semibold text-gray-900 dark:text-white truncate">
                        {cust.organization}
                      </span>
                      {cust.nif && (
                        <span className="text-xs text-gray-500 font-mono flex-shrink-0">
                          {cust.nif}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 mt-1 flex-wrap">
                      {cust.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {cust.city}, {cust.province}
                        </span>
                      )}
                      {cust.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {cust.phone}
                        </span>
                      )}
                      {cust.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {cust.email}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-3 mt-6 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1 || loading}
                  onClick={() => fetchCustomers(currentPage - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-gray-600">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages || loading}
                  onClick={() => fetchCustomers(currentPage + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "products" && products.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <span>{config.icon}</span>
              Productos de {config.label} ({productsTotal})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {products.map((prod) => (
                <div
                  key={prod.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <Package className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">{prod.name}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                      {prod.internalCode && <span className="font-mono">SKU: {prod.internalCode}</span>}
                      {prod.description && <span className="truncate max-w-[400px]">{prod.description}</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {(prod.price ?? 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
                    </p>
                    <p className="text-xs text-gray-500">
                      {selectedCompany === "canarias" ? "IGIC" : "IVA"} {prod.vat}%
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-3 mt-6 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1 || loading}
                  onClick={() => fetchProducts(currentPage - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-gray-600">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages || loading}
                  onClick={() => fetchProducts(currentPage + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {((activeTab === "estimates" && estimates.length === 0) ||
        (activeTab === "customers" && customers.length === 0) ||
        (activeTab === "products" && products.length === 0)) &&
        !loading && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              {activeTab === "estimates" ? (
                <FileText className="h-16 w-16 text-gray-300 mb-4" />
              ) : activeTab === "customers" ? (
                <Users className="h-16 w-16 text-gray-300 mb-4" />
              ) : (
                <Package className="h-16 w-16 text-gray-300 mb-4" />
              )}
              <p className="text-gray-500 dark:text-gray-400 text-lg mb-2">
                {activeTab === "estimates"
                  ? "No se han cargado presupuestos aún"
                  : activeTab === "customers"
                  ? "No se han cargado clientes aún"
                  : "No se han cargado productos aún"}
              </p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mb-6">
                Selecciona una empresa arriba y pulsa &quot;Cargar&quot; para ver los datos
              </p>
              <Button onClick={handleLoad} disabled={loading} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Cargar de {config.label}
              </Button>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
