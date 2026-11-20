"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Clock, CheckCircle, CreditCard, AlertTriangle } from "lucide-react";

interface BudgetStats {
  total: number;
  pendiente: number;
  entregado: number;
  pagado: number;
}

export function DashboardStats() {
  const router = useRouter();
  const [stats, setStats] = useState<BudgetStats>({
    total: 0,
    pendiente: 0,
    entregado: 0,
    pagado: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/budgets?limit=1000");
        const data = await response.json();
        const budgets = data.budgets ?? [];

        setStats({
          total: budgets.length,
          pendiente: budgets.filter((b: any) => b.estado === "PENDIENTE" || b.estado === "PENDIENTE_MORA" || b.estado === "PENDIENTE_OROZCO" || b.estado === "PENDIENTE_RETENCION_CREDITO").length,
          entregado: budgets.filter((b: any) => b.estado === "ENTREGADO").length,
          pagado: budgets.filter((b: any) => b.estado === "PAGADO").length,
        });
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const statItems = [
    {
      label: "Pendientes",
      key: "pendiente" as const,
      value: stats.pendiente,
      icon: AlertTriangle,
      accent: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/10",
      highlight: true,
      filter: "PENDIENTE",
    },
    {
      label: "Total",
      key: "total" as const,
      value: stats.total,
      icon: FileText,
      accent: "text-primary",
      bg: "bg-primary/10",
      highlight: false,
      filter: null,
    },
    {
      label: "Entregados",
      key: "entregado" as const,
      value: stats.entregado,
      icon: CheckCircle,
      accent: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
      highlight: false,
      filter: "ENTREGADO",
    },
    {
      label: "Pagados",
      key: "pagado" as const,
      value: stats.pagado,
      icon: CreditCard,
      accent: "text-sky-600 dark:text-sky-400",
      bg: "bg-sky-500/10",
      highlight: false,
      filter: "PAGADO",
    },
  ];

  const handleStatClick = (filter: string | null) => {
    if (filter) {
      router.push(`/budgets?estado=${filter}`);
    } else {
      router.push("/budgets");
    }
  };

  return (
    <div className="flex flex-wrap gap-3">
      {statItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            onClick={() => handleStatClick(item.filter)}
            className={`group flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-200 hover:shadow-md cursor-pointer ${
              item.highlight
                ? "border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-950/30 hover:border-amber-400"
                : "border-border bg-card hover:border-primary/30"
            }`}
          >
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${item.bg}`}>
              <Icon className={`h-4 w-4 ${item.accent}`} />
            </div>
            <div className="text-left">
              <p className="text-2xl font-bold text-foreground leading-none">
                {loading ? "—" : item.value}
              </p>
              <p className={`text-xs font-medium mt-0.5 ${
                item.highlight ? item.accent : "text-muted-foreground"
              }`}>
                {item.label}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
