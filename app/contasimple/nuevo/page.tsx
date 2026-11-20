import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ContasimpleEstimateForm } from "@/components/contasimple-estimate-form";

export const dynamic = "force-dynamic";

export default async function NuevoPresupuestoContasimplePage({
  searchParams,
}: {
  searchParams?: { tenderId?: string; nombre?: string };
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <ContasimpleEstimateForm
        tenderId={searchParams?.tenderId}
        prefillNombre={searchParams?.nombre}
      />
    </div>
  );
}
