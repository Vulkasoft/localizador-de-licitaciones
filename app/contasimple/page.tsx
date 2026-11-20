import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ContasimpleSync } from "@/components/contasimple-sync";

export const dynamic = "force-dynamic";

export default async function ContasimplePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <ContasimpleSync />
    </div>
  );
}
