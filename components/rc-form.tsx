"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RC_STATUSES, RC_STATUS_LABELS } from "@/lib/rc-utils";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface RcInitial {
  id?: string;
  organismo?: string | null;
  expediente?: string | null;
  referencia?: string | null;
  importe?: number | null;
  fechaSolicitud?: string | null;
  fechaConcesion?: string | null;
  numeroRC?: string | null;
  estado?: string;
  descripcion?: string | null;
  notas?: string | null;
}

function toDateInput(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function RcForm({ initialData }: { initialData?: RcInitial }) {
  const router = useRouter();
  const isEdit = Boolean(initialData?.id);

  const [organismo, setOrganismo] = useState(initialData?.organismo ?? "");
  const [expediente, setExpediente] = useState(initialData?.expediente ?? "");
  const [referencia, setReferencia] = useState(initialData?.referencia ?? "");
  const [importe, setImporte] = useState(
    initialData?.importe != null ? String(initialData.importe) : ""
  );
  const [fechaSolicitud, setFechaSolicitud] = useState(
    toDateInput(initialData?.fechaSolicitud)
  );
  const [fechaConcesion, setFechaConcesion] = useState(
    toDateInput(initialData?.fechaConcesion)
  );
  const [numeroRC, setNumeroRC] = useState(initialData?.numeroRC ?? "");
  const [estado, setEstado] = useState(initialData?.estado ?? "PENDIENTE");
  const [descripcion, setDescripcion] = useState(initialData?.descripcion ?? "");
  const [notas, setNotas] = useState(initialData?.notas ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        organismo,
        expediente,
        referencia,
        importe: importe.trim() === "" ? null : importe,
        fechaSolicitud: fechaSolicitud || null,
        fechaConcesion: fechaConcesion || null,
        numeroRC,
        estado,
        descripcion,
        notas,
      };
      const url = isEdit
        ? `/api/credit-retentions/${initialData!.id}`
        : "/api/credit-retentions";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      toast.success(isEdit ? "Retención actualizada" : "Retención creada");
      router.push("/rc");
      router.refresh();
    } catch {
      toast.error("Error al guardar la retención de crédito");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
      <Card className="p-5 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Administración / organismo
            </label>
            <Input
              value={organismo}
              onChange={(e) => setOrganismo(e.target.value)}
              placeholder="Ej. Ayuntamiento de Las Palmas, GESPLAN, Cabildo de Tenerife..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nº de expediente / licitación
            </label>
            <Input
              value={expediente}
              onChange={(e) => setExpediente(e.target.value)}
              placeholder="Ej. 2026/CON-045"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nº de presupuesto / factura
            </label>
            <Input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Ej. C-2026-045"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Importe de la RC (€)
            </label>
            <Input
              type="text"
              inputMode="decimal"
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              placeholder="Ej. 12500.00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nº de RC
            </label>
            <Input
              value={numeroRC}
              onChange={(e) => setNumeroRC(e.target.value)}
              placeholder="Número del documento de retención de crédito"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Fecha de solicitud
            </label>
            <Input
              type="date"
              value={fechaSolicitud}
              onChange={(e) => setFechaSolicitud(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Fecha de concesión
            </label>
            <Input
              type="date"
              value={fechaConcesion}
              onChange={(e) => setFechaConcesion(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Estado
            </label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                {RC_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {RC_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Drones / material a pedir
            </label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Modelo(s) de dron y material que se pedirá al conceder la RC"
              rows={2}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notas internas
            </label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones, contacto en la administración, seguimiento..."
              rows={3}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-6">
          <Button type="submit" disabled={saving} className="sm:w-auto">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? "Guardar cambios" : "Crear retención"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/rc")}
            disabled={saving}
            className="sm:w-auto"
          >
            Cancelar
          </Button>
        </div>
      </Card>
    </form>
  );
}
