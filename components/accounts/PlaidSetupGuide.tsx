"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const field = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 font-mono focus:outline-none focus:border-violet-500";

// 32 random bytes as hex: the key that encrypts stored bank tokens (what `openssl rand -hex 32` makes).
function newTokenKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 border border-violet-500/40 bg-violet-500/10 text-violet-300">{n}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm text-zinc-200">{title}</p>
        {children}
      </div>
    </li>
  );
}

const link = "text-violet-400 hover:text-violet-300 underline-offset-2 hover:underline";

// Walks someone through getting free Plaid keys and into .env, shown wherever bank sync is off.
// Only rendered after the page has loaded data in the browser, so the random key never differs from a
// server render. Nothing typed here leaves the page.
export function PlaidSetupGuide({ defaultOpen = false, onCheck }: { defaultOpen?: boolean; onCheck: () => Promise<boolean> }) {
  const [open, setOpen] = useState(defaultOpen);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [env, setEnv] = useState<"sandbox" | "production">("sandbox");
  const envName = env === "sandbox" ? "Sandbox" : "Production";
  const [tokenKey] = useState(newTokenKey);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notYet, setNotYet] = useState(false);

  const snippet = [
    `PLAID_CLIENT_ID=${clientId.trim() || "your-client-id"}`,
    `PLAID_SECRET=${secret.trim() || `your-${env}-secret`}`,
    `PLAID_ENV=${env}`,
    `PLAID_TOKEN_KEY=${tokenKey}`,
  ].join("\n");

  async function copy(e: React.MouseEvent<HTMLButtonElement>) {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The clipboard needs a secure page (127.0.0.1 is fine); otherwise select the text to copy by hand.
      const area = e.currentTarget.parentElement?.querySelector("textarea");
      area?.select();
    }
  }

  async function check() {
    setChecking(true);
    setNotYet(false);
    const ok = await onCheck().catch(() => false);
    setChecking(false);
    if (!ok) setNotYet(true);
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-100">Connect your bank automatically</p>
          <p className="text-sm text-zinc-400 mt-0.5">
            FinanceDash can pull in balances and transactions through Plaid. Getting your own free Plaid keys takes about five minutes.
          </p>
        </div>
        {!open && <Button size="sm" onClick={() => setOpen(true)}>Show me how</Button>}
      </div>

      {open && (
        <>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-xs text-zinc-400 space-y-1.5">
            {env === "sandbox" ? (
              <>
                <p>
                  <span className="text-zinc-200">Signing in to a test bank:</span> pick any bank in the Plaid window and use{" "}
                  <code className="text-zinc-300">user_good</code> / <code className="text-zinc-300">pass_good</code>.
                </p>
                <p>
                  <span className="text-zinc-200">Why Sandbox first:</span> Plaid&apos;s free trial allows 10 real bank connections, ever. Removing
                  one doesn&apos;t give its slot back. Each login to a bank counts as one connection, even if it brings in several accounts.
                  Get comfortable in Sandbox, which doesn&apos;t count toward that limit, before using up real ones.
                </p>
                <p>
                  <span className="text-zinc-200">Moving to your real bank later:</span> request Production access in the Plaid dashboard. Once it&apos;s
                  approved, come back here, choose Production, and swap in the new lines.
                </p>
              </>
            ) : (
              <p>
                <span className="text-zinc-200">Before you connect:</span> Plaid&apos;s free trial allows 10 bank connections in total, and removing one
                doesn&apos;t give its slot back. Each login to a bank counts once, however many accounts it brings in. If you haven&apos;t yet, try
                Sandbox first. Connect each bank only once, and use Reconnect (not a new connection) if a login stops working.
              </p>
            )}
          </div>

          <ol className="space-y-5">
            <Step n={1} title="Create a free Plaid account">
              <p className="text-xs text-zinc-500">
                Sign up at <a href="https://dashboard.plaid.com/signup" target="_blank" rel="noreferrer" className={link}>dashboard.plaid.com</a>. It&apos;s
                your own account, so your bank connections belong to you, not to FinanceDash.
              </p>
            </Step>

            <Step n={2} title="Choose test banks or your real bank, then copy your keys">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Plaid environment">
                {([
                  ["sandbox", "Sandbox: test banks (start here)", "Works straight away and doesn't use up any of the trial's real connections. Try FinanceDash with Plaid's made-up banks and data first."],
                  ["production", "Production: my real bank", "Needs Plaid's approval first. The free trial allows 10 bank connections in total, and a connection can't be removed to free up its slot."],
                ] as const).map(([value, title, note]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={env === value}
                    onClick={() => setEnv(value)}
                    className={`flex gap-2.5 text-left rounded-lg border px-3 py-2 transition-colors ${env === value ? "border-violet-500 bg-violet-500/15" : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"}`}
                  >
                    <span className={`mt-1 w-3.5 h-3.5 shrink-0 rounded-full border-2 ${env === value ? "border-violet-400 bg-violet-400 shadow-[inset_0_0_0_2px_rgb(24_24_27)]" : "border-zinc-600"}`} />
                    <span className="min-w-0">
                      <span className="block text-sm text-zinc-100">{title}</span>
                      <span className="block text-[11px] text-zinc-500 mt-0.5">{note}</span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500">
                In the Plaid dashboard, open <a href="https://dashboard.plaid.com/developers/keys" target="_blank" rel="noreferrer" className={link}>Developers › Keys</a> and
                paste your <span className="text-zinc-300">client_id</span> and <span className="text-zinc-300">{envName} secret</span> here.
                They stay on this page and are only used to fill in the lines below.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="client_id" aria-label="Plaid client_id" className={field} autoComplete="off" spellCheck={false} />
                <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={`${envName} secret`} aria-label={`Plaid ${envName} secret`} className={field} autoComplete="off" spellCheck={false} type="password" />
              </div>
            </Step>

            <Step n={3} title="Add these lines to .env">
              <p className="text-xs text-zinc-500">
                Open the <code className="text-zinc-300">.env</code> file in your FinanceDash folder, replace the empty PLAID lines with these, and save.
                The last line is a new key, made just now, that encrypts your bank connections. Keep a copy of it somewhere safe:
                if it&apos;s lost, every bank has to be connected again.
              </p>
              <div className="relative">
                <textarea readOnly value={snippet} rows={5} wrap="off" className={`${field} resize-none pr-20 text-xs leading-relaxed overflow-x-auto whitespace-pre`} aria-label=".env lines" onFocus={(e) => e.currentTarget.select()} />
                <Button size="sm" variant="secondary" className="absolute top-2 right-2" onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
              </div>
            </Step>

            <Step n={4} title="Check it worked">
              <p className="text-xs text-zinc-500">
                If you started FinanceDash with <code className="text-zinc-300">npm run dev</code>, it picks up the change within a few seconds.
                With <code className="text-zinc-300">npm start</code>, stop it and start it again first.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" onClick={check} disabled={checking}>{checking ? "Checking…" : "Check again"}</Button>
                {notYet && <span className="text-xs text-amber-400">Not yet. Check that all four lines are in .env and the file is saved.</span>}
              </div>
            </Step>
          </ol>

          {!defaultOpen && (
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-zinc-500 hover:text-zinc-300">Hide</button>
          )}
        </>
      )}
    </Card>
  );
}
