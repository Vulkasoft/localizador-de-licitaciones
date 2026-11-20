import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ProductSearch } from "@/components/product-search";

export const dynamic = "force-dynamic";

export default async function ProductosPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            Buscar Producto
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Busca un producto por nombre, referencia o concepto y descubre en qué
            presupuestos y facturas aparece, tanto en Canarias como en Península.
          </p>
        </div>

        <ProductSearch />
      </div>
    </div>
  );
}
