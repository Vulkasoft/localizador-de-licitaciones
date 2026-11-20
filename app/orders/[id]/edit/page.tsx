import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { OrderForm } from "@/components/order-form";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EditOrderPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { files: { orderBy: { uploadedAt: "desc" } } },
  });

  if (!order) {
    notFound();
  }

  const initialData = {
    id: order.id,
    numeroAcopio: order.numeroAcopio,
    numeroPedido: order.numeroPedido,
    numeroSeguimiento: order.numeroSeguimiento,
    empresa: order.empresa,
    origen: order.origen,
    quienPidio: order.quienPidio,
    fechaSolicitud: order.fechaSolicitud ? order.fechaSolicitud.toISOString() : null,
    estado: order.estado,
    descripcion: order.descripcion,
    notas: order.notas,
    files: order.files.map((f) => ({
      id: f.id,
      filename: f.filename,
      tipo: f.tipo,
    })),
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 px-4 sm:px-6 py-6 sm:py-8">
      <div className="max-w-4xl mx-auto mb-4">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a pedidos
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mt-2">
          Editar pedido
        </h1>
      </div>
      <OrderForm initialData={initialData} />
    </div>
  );
}
