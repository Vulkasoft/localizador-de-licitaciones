import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { RcForm } from "@/components/rc-form";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EditRcPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const item = await prisma.creditRetention.findUnique({
    where: { id: params.id },
  });

  if (!item) {
    notFound();
  }

  const initialData = {
    id: item.id,
    organismo: item.organismo,
    expediente: item.expediente,
    referencia: item.referencia,
    importe: item.importe,
    fechaSolicitud: item.fechaSolicitud ? item.fechaSolicitud.toISOString() : null,
    fechaConcesion: item.fechaConcesion ? item.fechaConcesion.toISOString() : null,
    numeroRC: item.numeroRC,
    estado: item.estado,
    descripcion: item.descripcion,
    notas: item.notas,
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 px-4 sm:px-6 py-6 sm:py-8">
      <div className="max-w-4xl mx-auto mb-4">
        <Link
          href="/rc"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a Pendiente de RC
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mt-2">
          Editar retención de crédito
        </h1>
      </div>
      <RcForm initialData={initialData} />
    </div>
  );
}
