import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AlarmForm } from "@/components/alarm-form";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewAlarmPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  // Fetch budgets for the dropdown
  const budgets = await prisma.budget.findMany({
    select: { id: true, nombre: true, cliente: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AlarmForm budgets={budgets} />
    </div>
  );
}
