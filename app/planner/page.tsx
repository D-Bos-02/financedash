import { loadFinanceData } from "@/lib/finance-data";
import { PortfolioPlanner } from "@/components/planner/PortfolioPlanner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planner · FinanceDash" };

export default async function PlannerPage() {
  const d = await loadFinanceData();
  return (
    <PortfolioPlanner
      settings={d.settings}
      members={d.members}
      initialSources={d.sources}
      initialGoals={d.goals}
      goalPositions={d.goalPositions}
      goalDebts={d.goalDebts}
      position={d.position}
      quotes={d.quotes}
      actuals={d.actuals}
      pay={d.pay}
      basis={d.basis}
      initialInputs={d.savedInputs}
    />
  );
}
