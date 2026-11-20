import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ProfitForm } from "@/components/profit-form";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EditBeneficioPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const profit = await prisma.profitShare.findUnique({
    where: { id: params.id },
    include: {
      files: { orderBy: { uploadedAt: "desc" } },
      budget: {
        select: {
          id: true,
          contasimpleNumber: true,
          numeroFactura: true,
          contasimpleCompany: true,
        },
      },
    },
  });

  if (!profit) {
    notFound();
  }

  const initialData = {
    id: profit.id,
    concepto: profit.concepto,
    referencia: profit.referencia,
    referenciaTipo: profit.referenciaTipo,
    budgetId: profit.budgetId,
    budget: profit.budget,
    importeVenta: profit.importeVenta,
    beneficio: profit.beneficio,
    estado: profit.estado,
    fechaVenta: profit.fechaVenta ? profit.fechaVenta.toISOString() : null,
    fechaPago: profit.fechaPago ? profit.fechaPago.toISOString() : null,
    notas: profit.notas,
    files: profit.files.map((f) => ({
      id: f.id,
      filename: f.filename,
      tipo: f.tipo,
    })),
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 px-4 sm:px-6 py-6 sm:py-8">
      <div className="max-w-4xl mx-auto mb-4">
        <Link
          href="/beneficios"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a beneficios
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mt-2">
          Editar beneficio
        </h1>
      </div>
      <ProfitForm initialData={initialData} />
    </div>
  );
}
