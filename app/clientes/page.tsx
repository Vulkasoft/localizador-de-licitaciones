import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CustomersList } from "@/components/customers-list";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">👥 Clientes</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Organiza presupuestos, licitaciones y notas por cliente</p>
        </div>
        <CustomersList />
      </div>
    </div>
  );
}
