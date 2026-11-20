import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { NotFound } from "@/components/not-found";
import { BudgetDetail } from "@/components/budget-detail";

export const dynamic = "force-dynamic";

interface BudgetPageProps {
  params: { id: string };
}

export default async function BudgetPage({ params }: BudgetPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const budget = await prisma.budget.findUnique({
    where: { id: params.id },
    include: {
      user: true,
      files: true,
      auditLogs: {
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      },
      notes: {
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!budget) {
    return <NotFound />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
        <BudgetDetail budget={budget} />
      </div>
    </div>
  );
}
