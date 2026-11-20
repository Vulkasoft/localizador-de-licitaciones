import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { BudgetForm } from "@/components/budget-form";
import { NotFound } from "@/components/not-found";

export const dynamic = "force-dynamic";

interface EditBudgetPageProps {
  params: { id: string };
}

export default async function EditBudgetPage({
  params,
}: EditBudgetPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const budget = await prisma.budget.findUnique({
    where: { id: params.id },
    include: { user: true, files: true },
  });

  if (!budget) {
    return <NotFound />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
        <BudgetForm budgetId={params.id} initialData={budget} />
      </div>
    </div>
  );
}
