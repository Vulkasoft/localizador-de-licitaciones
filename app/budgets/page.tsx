import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BudgetsList } from "@/components/budgets-list";

export const dynamic = "force-dynamic";

interface BudgetsPageProps {
  searchParams: {
    search?: string;
    estado?: string;
    tipo?: string;
    comunidad?: string;
    page?: string;
  };
}

export default async function BudgetsPage({
  searchParams,
}: BudgetsPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            Presupuestos
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Gestión completa de presupuestos y documentación
          </p>
        </div>

        <BudgetsList searchParams={searchParams} />
      </div>
    </div>
  );
}
