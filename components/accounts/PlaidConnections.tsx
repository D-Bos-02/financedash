"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink, PlaidLinkOnSuccess, PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { Member } from "@/lib/household";
import { PlaidSetupGuide } from "./PlaidSetupGuide";

const TRIAL_ITEM_LIMIT = 10;

interface PlaidItemRow {
  id: string;
  institutionName: string | null;
  status: string;
  errorCode: string | null;
  lastSyncedAt: string | null;
  _count: { accounts: number };
}

interface ItemsResponse {
  configured: boolean;
  environment: "sandbox" | "production";
  items: PlaidItemRow[];
  productionItemsUsed: number;
}

interface SyncResult {
  institution: string | null;
  ok: boolean;
  added: number;
  modified: number;
  removed: number;
  updateStatus?: string;
  error?: string;
}

function summarise(results: SyncResult[]): string {
  return results
    .map((r) => {
      const name = r.institution ?? "Item";
      if (!r.ok) return `${name}: ${r.error}`;
      const pending = r.updateStatus === "NOT_READY" ? " (still pulling history — sync again in a minute)" : "";
      return `${name}: +${r.added} / ~${r.modified} / −${r.removed}${pending}`;
    })
    .join(" · ");
}

// Mounted only while connecting, so Plaid's script is fetched only when someone actually links a bank,
// never just from visiting the page (or at all, for people who don't use Plaid).
function LinkLauncher({ token, onSuccess, onExit }: {
  token: string;
  onSuccess: PlaidLinkOnSuccess;
  onExit: () => void;
}) {
  const { open, ready } = usePlaidLink({ token, onSuccess, onExit });
  useEffect(() => {
    if (ready) open();
  }, [ready, open]);
  return null;
}

// setupOpen: when bank sync isn't set up yet, show the setup steps expanded (the wizard) or collapsed (Accounts).
export function PlaidConnections({ onChange, members, setupOpen = false }: { onChange: () => void; members: Member[]; setupOpen?: boolean }) {
  const [data, setData] = useState<ItemsResponse | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [updateItemId, setUpdateItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // Whose accounts the next connection is for; "" = shared. Defaults to the first member.
  const [chosenOwner, setOwner] = useState<string | null>(null);
  const memberId = chosenOwner ?? members[0]?.id ?? "";

  const load = useCallback(async () => {
    const res = await fetch("/api/plaid/items");
    setData(await res.json());
  }, []);

  // State is set when the data arrives, not during the effect itself.
  useEffect(() => {
    fetch("/api/plaid/items").then((r) => r.json()).then(setData);
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string | null, metadata: PlaidLinkOnSuccessMetadata) => {
      setLinkToken(null);
      setBusy(true);
      try {
        if (updateItemId) {
          const res = await fetch(`/api/plaid/items/${updateItemId}`, { method: "PATCH" });
          const body = await res.json();
          setMessage(body.sync ? summarise([body.sync]) : body.error);
        } else {
          const res = await fetch("/api/plaid/exchange", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ publicToken, institution: metadata.institution, memberId }),
          });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error);
          setMessage(
            (body.duplicate ? "Warning: this institution was already linked. " : "") +
              summarise([body.sync])
          );
        }
      } catch (e) {
        setMessage(`Link failed: ${e instanceof Error ? e.message : e}`);
      } finally {
        setUpdateItemId(null);
        setBusy(false);
        load();
        onChange();
      }
    },
    [updateItemId, memberId, load, onChange]
  );

  const onExit = useCallback(() => { setLinkToken(null); setUpdateItemId(null); }, []);

  async function startLink(itemId?: string) {
    if (!itemId && data?.environment === "production") {
      const linked = data.items.filter((i) => i.status !== "removed").map((i) => i.institutionName);
      const ok = confirm(
        `This permanently uses 1 of your ${TRIAL_ITEM_LIMIT} Trial Items ` +
          `(${data.productionItemsUsed} used so far).\n\n` +
          `Already linked: ${linked.join(", ") || "none"}.\n\n` +
          `To fix a broken connection, use Reconnect instead. Continue?`
      );
      if (!ok) return;
    }
    setMessage("");
    setUpdateItemId(itemId ?? null);
    const res = await fetch("/api/plaid/link-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(itemId ? { itemId } : { memberId }),
    });
    const body = await res.json();
    if (!res.ok) { setMessage(`Couldn't start Link: ${body.error}`); return; }
    setLinkToken(body.linkToken);
  }

  async function syncAll() {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/plaid/sync", { method: "POST" });
    const body = await res.json();
    setMessage(res.ok ? summarise(body.results) || "Nothing to sync." : body.error);
    setBusy(false);
    load();
    onChange();
  }

  async function removeItem(item: PlaidItemRow) {
    const msg =
      data?.environment === "production"
        ? `Disconnect ${item.institutionName}? Its accounts and transactions are kept as manual.\n\nThis will NOT free up a Trial Item slot.`
        : `Disconnect ${item.institutionName}? Its Sandbox test accounts and transactions will be deleted.`;
    if (!confirm(msg)) return;
    await fetch(`/api/plaid/items/${item.id}`, { method: "DELETE" });
    load();
    onChange();
  }

  if (!data) return null;

  if (!data.configured) {
    return (
      <PlaidSetupGuide
        defaultOpen={setupOpen}
        onCheck={async () => {
          const fresh: ItemsResponse = await fetch("/api/plaid/items").then((r) => r.json());
          if (fresh.configured) setData(fresh);
          return fresh.configured;
        }}
      />
    );
  }

  const active = data.items.filter((i) => i.status !== "removed");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Connected institutions
          <Badge variant={data.environment === "production" ? "green" : "amber"}>{data.environment}</Badge>
        </CardTitle>
        <div className="flex gap-2">
          {linkToken && <LinkLauncher token={linkToken} onSuccess={onSuccess} onExit={onExit} />}
          {active.length > 0 && (
            <Button variant="secondary" size="sm" onClick={syncAll} disabled={busy}>
              {busy ? "Syncing…" : "Sync now"}
            </Button>
          )}
          {members.length > 1 && (
            <select
              aria-label="Connect accounts for"
              value={memberId}
              onChange={(e) => setOwner(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
            >
              {members.map((m) => <option key={m.id} value={m.id}>For {m.name}</option>)}
              <option value="">Shared</option>
            </select>
          )}
          <Button size="sm" onClick={() => startLink()} disabled={busy}>+ Connect</Button>
        </div>
      </CardHeader>

      {data.environment === "sandbox" && (
        <p className="text-xs text-zinc-500 mb-3">
          Using Plaid&apos;s test banks (sign in with <code className="text-zinc-400">user_good</code> / <code className="text-zinc-400">pass_good</code>).
          To connect your real bank, get Production access from Plaid, then set <code className="text-zinc-400">PLAID_ENV=production</code> and
          your Production secret in <code className="text-zinc-400">.env</code>. The free trial allows 10 real connections in total, and removing
          one doesn&apos;t free its slot, so connect each bank once.
        </p>
      )}

      {data.environment === "production" && (
        <p className="text-xs text-zinc-500 mb-3">
          Trial Items used: {data.productionItemsUsed} / {TRIAL_ITEM_LIMIT} (removed Items still count)
        </p>
      )}

      {active.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No institutions connected.
          {data.environment === "sandbox" && " In Sandbox, sign in with user_good / pass_good."}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800">
          {active.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-100">{item.institutionName ?? "Unknown"}</span>
                  {item.status === "ok" ? (
                    <Badge variant="green">connected</Badge>
                  ) : item.status === "login_required" ? (
                    <Badge variant="amber">needs login</Badge>
                  ) : (
                    <Badge variant="red" title={item.errorCode ?? undefined}>error</Badge>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {item._count.accounts} accounts ·{" "}
                  {item.lastSyncedAt ? `synced ${new Date(item.lastSyncedAt).toLocaleString()}` : "never synced"}
                </p>
              </div>
              {item.status !== "ok" && (
                <Button variant="secondary" size="sm" onClick={() => startLink(item.id)} disabled={busy}>
                  Reconnect
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => removeItem(item)} className="hover:text-red-400">
                Disconnect
              </Button>
            </li>
          ))}
        </ul>
      )}

      {message && <p className="text-xs text-zinc-400 mt-3">{message}</p>}
    </Card>
  );
}
