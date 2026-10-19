import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { AutoSync } from "@/components/layout/AutoSync";
import { SetupWizard } from "@/components/onboarding/SetupWizard";
import { loadSetup } from "@/lib/household-data";
import { isLocalHost } from "@/scripts/host.mjs";
import { DEMO } from "@/lib/demo/mode";
import { VISITOR_TTL_HOURS } from "@/lib/demo/visitor-db";
import { DemoBanner } from "@/components/layout/DemoBanner";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "FinanceDash",
  description: "Personal finance dashboard — self-hosted",
};

// Until setup is finished, every page shows the setup wizard instead (API routes are unaffected).
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const setup = await loadSetup();
  // HOST comes from .env via scripts/serve.mjs. The bar is a reminder, since there's no login.
  const host = process.env.HOST?.trim() || "127.0.0.1";
  const exposed = !DEMO && !isLocalHost(host);
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="h-full flex flex-col bg-zinc-950 text-zinc-100 antialiased font-sans">
        {DEMO && <DemoBanner hours={VISITOR_TTL_HOURS} />}
        {exposed && (
          <div role="alert" className="shrink-0 px-4 py-1.5 text-xs text-center text-amber-200 bg-amber-900/60 border-b border-amber-700/60">
            Reachable from your network (HOST={host}) with no login. Anyone on this network can see your finances.
            Set HOST=127.0.0.1 in .env to turn this off.
          </div>
        )}
        {setup ? (
          <main className="flex-1 min-h-0 overflow-y-auto">
            <SetupWizard initial={setup.household} planner={setup.planner} />
          </main>
        ) : (
          <>
            <div className="flex flex-1 min-h-0">
              <Sidebar />
              <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
                {children}
              </main>
            </div>
            <BottomNav />
            {!DEMO && <AutoSync />}
          </>
        )}
      </body>
    </html>
  );
}
