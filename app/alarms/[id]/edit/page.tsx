import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AlarmForm } from "@/components/alarm-form";
import { NotFound } from "@/components/not-found";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function EditAlarmPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const alarm = await prisma.alarm.findUnique({
    where: { id: params.id },
    include: {
      budget: { select: { id: true, nombre: true, cliente: true } },
      alarmFiles: true,
    },
  });

  if (!alarm) {
    return <NotFound />;
  }

  const budgets = await prisma.budget.findMany({
    select: { id: true, nombre: true, cliente: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AlarmForm
        initialData={{
          id: alarm.id,
          titulo: alarm.titulo,
          descripcion: alarm.descripcion,
          fechaLimite: alarm.fechaLimite.toISOString(),
          diasAntelacion: alarm.diasAntelacion,
          emailsDestino: alarm.emailsDestino,
          documentos: alarm.documentos,
          budgetId: alarm.budgetId,
          budget: alarm.budget,
          alarmFiles: alarm.alarmFiles,
        }}
        budgets={budgets}
      />
    </div>
  );
}
