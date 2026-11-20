"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, X, Upload, FileText, Trash2, Users, Search, ChevronDown } from "lucide-react";
import Link from "next/link";

interface CustomerOption {
  id: string;
  nombre: string;
  nif: string | null;
  email: string | null;
  telefono: string | null;
  movil: string | null;
  ciudad: string | null;
  provincia: string | null;
  direccion: string | null;
}

interface BudgetFormProps {
  budgetId?: string;
  initialData?: any;
}

const communities = [
  "Andalucia",
  "Aragon",
  "Asturias",
  "Baleares",
  "Canarias",
  "Cantabria",
  "Castilla y Leon",
  "Castilla-La Mancha",
  "Cataluna",
  "Extremadura",
  "Galicia",
  "Madrid",
  "Murcia",
  "Navarra",
  "Pais Vasco",
  "La Rioja",
  "Valencia",
];

export function BudgetForm({ budgetId, initialData }: BudgetFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // Customer dropdown state
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const customerSearchTimeout = useRef<NodeJS.Timeout | null>(null);

  const fetchCustomers = useCallback(async (search: string) => {
    setLoadingCustomers(true);
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = await res.json();
        setCustomers(data);
      }
    } catch (err) {
      console.error("Error fetching customers:", err);
    } finally {
      setLoadingCustomers(false);
    }
  }, []);

  // Load customers on mount
  useEffect(() => {
    fetchCustomers("");
  }, [fetchCustomers]);

  // Debounced search
  useEffect(() => {
    if (customerSearchTimeout.current) clearTimeout(customerSearchTimeout.current);
    customerSearchTimeout.current = setTimeout(() => {
      fetchCustomers(customerSearch);
    }, 300);
    return () => {
      if (customerSearchTimeout.current) clearTimeout(customerSearchTimeout.current);
    };
  }, [customerSearch, fetchCustomers]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectCustomer = (customer: CustomerOption) => {
    setFormData((prev) => ({
      ...prev,
      customerId: customer.id,
      cliente: customer.nombre,
      ciudad: customer.ciudad || prev.ciudad,
      comunidadAutonoma: customer.provincia || prev.comunidadAutonoma,
    }));
    setShowCustomerDropdown(false);
    setCustomerSearch("");
  };
  const [formData, setFormData] = useState({
    nombre: initialData?.nombre ?? "",
    customerId: initialData?.customerId ?? "",
    cliente: initialData?.cliente ?? "",
    comunidadAutonoma: initialData?.comunidadAutonoma ?? "",
    ciudad: initialData?.ciudad ?? "",
    tipo: initialData?.tipo ?? "NORMAL",
    tipoCustom: initialData?.tipoCustom ?? "",
    fechaSolicitud: initialData?.fechaSolicitud ? new Date(initialData.fechaSolicitud).toISOString().split("T")[0] : "",
    fechaEntrega: initialData?.fechaEntrega ? new Date(initialData.fechaEntrega).toISOString().split("T")[0] : "",
    fechaPlazo: initialData?.fechaPlazo ? new Date(initialData.fechaPlazo).toISOString().split("T")[0] : "",
    estado: initialData?.estado ?? "PENDIENTE",
    descripcion: initialData?.descripcion ?? "",
    notas: initialData?.notas ?? "",
  });

  const clearField = (field: keyof typeof formData) => {
    setFormData({ ...formData, [field]: "" });
  };

  const clearAll = () => {
    setFormData({
      nombre: "",
      customerId: "",
      cliente: "",
      comunidadAutonoma: "",
      ciudad: "",
      tipo: "NORMAL",
      tipoCustom: "",
      fechaSolicitud: "",
      fechaEntrega: "",
      fechaPlazo: "",
      estado: "PENDIENTE",
      descripcion: "",
      notas: "",
    });
    setPendingFiles([]);
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setPendingFiles((prev) => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const uploadPendingFiles = async (targetBudgetId: string) => {
    for (const file of pendingFiles) {
      try {
        const presignedRes = await fetch(`/api/budgets/${targetBudgetId}/files/presigned`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            fileType: "OTRO",
          }),
        });
        if (!presignedRes.ok) throw new Error("presigned failed");
        const { uploadUrl } = await presignedRes.json();
        const uploadHeaders: Record<string, string> = {
          "Content-Type": file.type || "application/octet-stream",
        };
        if (uploadUrl.includes("content-disposition")) {
          uploadHeaders["Content-Disposition"] = "attachment";
        }
        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: uploadHeaders,
          body: file,
        });
        if (!putRes.ok) throw new Error("upload failed");
      } catch (err) {
        console.error("File upload error:", file.name, err);
        toast.error(`Error subiendo ${file.name}`);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const method = budgetId ? "PUT" : "POST";
      const url = budgetId ? `/api/budgets/${budgetId}` : "/api/budgets";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          customerId: formData.customerId || null,
          fechaSolicitud: formData.fechaSolicitud || null,
          fechaEntrega: formData.fechaEntrega || null,
          fechaPlazo: formData.fechaPlazo || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save budget");
      }

      const data = await response.json();

      if (pendingFiles.length > 0) {
        toast.info(`Subiendo ${pendingFiles.length} archivo(s)...`);
        await uploadPendingFiles(data.id);
      }

      toast.success(budgetId ? "Presupuesto actualizado" : "Presupuesto creado");
      router.push(`/budgets/${data.id}`);
    } catch (error) {
      console.error("Error saving budget:", error);
      toast.error("Error al guardar el presupuesto");
    } finally {
      setLoading(false);
    }
  };

  const ClearBtn = ({ field }: { field: keyof typeof formData }) =>
    formData[field] ? (
      <button
        type="button"
        onClick={() => clearField(field)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        aria-label="Limpiar campo"
      >
        <X className="h-4 w-4" />
      </button>
    ) : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Link href="/budgets">
        <Button variant="outline" className="gap-2" type="button">
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Button>
      </Link>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">
            {budgetId ? "Editar Presupuesto" : "Nuevo Presupuesto"}
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={clearAll} className="gap-2">
            <Trash2 className="h-4 w-4" />
            Limpiar todo
          </Button>
        </div>

        <p className="text-sm text-gray-500 mb-6">
          Todos los campos son opcionales. Puedes dejarlos vacíos si no los necesitas.
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-2">Nombre</label>
            <div className="relative">
              <Input
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                placeholder="Ej: Presupuesto Proyecto X"
                className="pr-8"
              />
              <ClearBtn field="nombre" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Cliente</label>
            <div className="relative" ref={customerDropdownRef}>
              <div className="relative">
                <Input
                  value={formData.cliente}
                  onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
                  placeholder="Nombre del cliente"
                  className="pr-16"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  {formData.cliente && (
                    <button
                      type="button"
                      onClick={() => clearField("cliente")}
                      className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-0.5"
                      aria-label="Limpiar campo"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowCustomerDropdown(!showCustomerDropdown)}
                    className="text-primary/70 hover:text-primary p-0.5 rounded hover:bg-primary/5"
                    title="Seleccionar cliente importado"
                  >
                    <Users className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {showCustomerDropdown && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        placeholder="Buscar cliente..."
                        className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {loadingCustomers ? (
                      <div className="px-3 py-4 text-center text-sm text-muted-foreground">Cargando...</div>
                    ) : customers.length === 0 ? (
                      <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                        {customerSearch ? "Sin resultados" : "No hay clientes importados"}
                      </div>
                    ) : (
                      customers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectCustomer(c)}
                          className="w-full text-left px-3 py-2 hover:bg-muted/80 transition-colors border-b border-border/40 last:border-b-0"
                        >
                          <div className="font-medium text-sm text-foreground">{c.nombre}</div>
                          <div className="flex items-center gap-3 mt-0.5">
                            {c.nif && <span className="text-xs text-muted-foreground">NIF: {c.nif}</span>}
                            {c.ciudad && <span className="text-xs text-muted-foreground">{c.ciudad}</span>}
                            {c.email && <span className="text-xs text-muted-foreground truncate">{c.email}</span>}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                  {customers.length > 0 && (
                    <div className="px-3 py-1.5 border-t border-border bg-muted/30 text-[11px] text-muted-foreground text-center">
                      {customers.length} cliente{customers.length !== 1 ? "s" : ""} encontrado{customers.length !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Comunidad Autónoma</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Select
                  key={`com-${formData.comunidadAutonoma || "empty"}`}
                  value={formData.comunidadAutonoma || undefined}
                  onValueChange={(value) => setFormData({ ...formData, comunidadAutonoma: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona comunidad" />
                  </SelectTrigger>
                  <SelectContent>
                    {communities.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formData.comunidadAutonoma && (
                <Button type="button" variant="outline" size="icon" onClick={() => clearField("comunidadAutonoma")}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Ciudad</label>
            <div className="relative">
              <Input
                value={formData.ciudad}
                onChange={(e) => setFormData({ ...formData, ciudad: e.target.value })}
                placeholder="Ciudad"
                className="pr-8"
              />
              <ClearBtn field="ciudad" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Tipo</label>
            <Select
              value={formData.tipo}
              onValueChange={(value) => setFormData({ ...formData, tipo: value, tipoCustom: value === "OTRO" ? formData.tipoCustom : "" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LICITACION">Licitación</SelectItem>
                <SelectItem value="CONTRATO_MENOR">Contrato Menor</SelectItem>
                <SelectItem value="NORMAL">Normal</SelectItem>
                <SelectItem value="OTRO">Otro (escribir)</SelectItem>
              </SelectContent>
            </Select>
            {formData.tipo === "OTRO" && (
              <div className="relative mt-2">
                <Input
                  value={formData.tipoCustom}
                  onChange={(e) => setFormData({ ...formData, tipoCustom: e.target.value })}
                  placeholder="Escribe el tipo personalizado"
                  className="pr-8"
                />
                <ClearBtn field="tipoCustom" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Estado</label>
            <Select
              value={formData.estado}
              onValueChange={(value) => setFormData({ ...formData, estado: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDIENTE">Pendiente</SelectItem>
                <SelectItem value="PENDIENTE_MORA">Pendiente de Mora</SelectItem>
                <SelectItem value="PENDIENTE_OROZCO">Pendiente de Orozco</SelectItem>
                <SelectItem value="PENDIENTE_RETENCION_CREDITO">Pdte. Retención de Crédito</SelectItem>
                <SelectItem value="LICITACION_ENVIADA">Licitación Enviada</SelectItem>
                <SelectItem value="PRESUPUESTO_ENVIADO">Presupuesto Enviado</SelectItem>
                <SelectItem value="ENTREGADO">Entregado</SelectItem>
                <SelectItem value="PAGADO">Pagado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Fecha Solicitud</label>
            <div className="relative">
              <Input
                type="date"
                value={formData.fechaSolicitud}
                onChange={(e) => setFormData({ ...formData, fechaSolicitud: e.target.value })}
                className="pr-8"
              />
              <ClearBtn field="fechaSolicitud" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Fecha Entrega</label>
            <div className="relative">
              <Input
                type="date"
                value={formData.fechaEntrega}
                onChange={(e) => setFormData({ ...formData, fechaEntrega: e.target.value })}
                className="pr-8"
              />
              <ClearBtn field="fechaEntrega" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Fecha Plazo</label>
            <div className="relative">
              <Input
                type="date"
                value={formData.fechaPlazo}
                onChange={(e) => setFormData({ ...formData, fechaPlazo: e.target.value })}
                className="pr-8"
              />
              <ClearBtn field="fechaPlazo" />
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-2">Descripción</label>
            <div className="relative">
              <textarea
                rows={4}
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                placeholder="Descripción detallada del presupuesto"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 pr-8 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-950 dark:text-white"
              />
              {formData.descripcion && (
                <button
                  type="button"
                  onClick={() => clearField("descripcion")}
                  className="absolute right-2 top-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-2">Notas</label>
            <div className="relative">
              <textarea
                rows={3}
                value={formData.notas}
                onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                placeholder="Notas adicionales (opcional)"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 pr-8 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-950 dark:text-white"
              />
              {formData.notas && (
                <button
                  type="button"
                  onClick={() => clearField("notas")}
                  className="absolute right-2 top-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {!budgetId && (
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2">Documentos adjuntos (opcional)</label>
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt,.csv"
                  onChange={handleFilesSelected}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Añadir archivos (PDF, DOC, etc.)
                </Button>
                {pendingFiles.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {pendingFiles.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm bg-gray-50 dark:bg-gray-800 rounded px-3 py-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        <span className="flex-1 truncate">{f.name}</span>
                        <span className="text-xs text-gray-500">{(f.size / 1024).toFixed(1)} KB</span>
                        <button
                          type="button"
                          onClick={() => removePendingFile(i)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-gray-500 mt-2">Los archivos se subirán al crear el presupuesto.</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-8">
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? "Guardando..." : budgetId ? "Actualizar" : "Crear"}
          </Button>
          <Link href="/budgets" className="flex-1">
            <Button type="button" variant="outline" className="w-full">
              Cancelar
            </Button>
          </Link>
        </div>
      </Card>
    </form>
  );
}
