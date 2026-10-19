"use client";

import { useEffect, useState } from "react";
import { Account } from "@/types";
import type { Member } from "@/lib/household";
import { formatCurrency } from "@/lib/formatters";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { PlaidConnections } from "@/components/accounts/PlaidConnections";
import { AccountForm } from "@/components/accounts/AccountForm";

// Manual balances go stale, so show how long ago each was last updated.
function updatedAgo(iso: string): string {
  const days = Math.floor((new Date().getTime() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

async function fetchPage() {
  const [accounts, members, settings] = await Promise.all(
    ["/api/accounts", "/api/members", "/api/settings"].map((u) => fetch(u).then((r) => r.json()))
  );
  return { accounts: accounts as Account[], members: members as Member[], baseCurrency: (settings.baseCurrency as string) ?? "USD" };
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Account | undefined>();
  const [members, setMembers] = useState<Member[]>([]);
  const [baseCurrency, setBaseCurrency] = useState("USD");

  function apply(d: Awaited<ReturnType<typeof fetchPage>>) {
    setAccounts(d.accounts);
    setMembers(d.members);
    setBaseCurrency(d.baseCurrency);
    setLoading(false);
  }
  const load = () => fetchPage().then(apply);

  // State is set when the data arrives, not during the effect itself.
  useEffect(() => { fetchPage().then(apply); }, []);

  async function deleteAccount(id: string) {
    if (!confirm("Archive this account?")) return;
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }

  function openNew() { setEditing(undefined); setModalOpen(true); }
  function openEdit(a: Account) { setEditing(a); setModalOpen(true); }

  function onSave(a: Account) {
    setAccounts((prev) => {
      const idx = prev.findIndex((x) => x.id === a.id);
      return idx >= 0 ? prev.map((x) => (x.id === a.id ? a : x)) : [...prev, a];
    });
    setModalOpen(false);
  }

  return (
    <div className="px-4 py-6 lg:px-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-100">Accounts</h1>
        <Button onClick={openNew}>+ Add Account</Button>
      </div>

      <PlaidConnections onChange={load} members={members} />

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-zinc-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-500 text-center py-6">No accounts yet. Add one to get started.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {accounts.map((acc) => (
            <Card key={acc.id} className="flex items-center gap-4 group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-100">{acc.name}</span>
                  <Badge>{acc.type}</Badge>
                  {acc.currency !== baseCurrency && <Badge variant="blue">{acc.currency}</Badge>}
                  {members.length > 1 && <Badge variant="green">{members.find((m) => m.id === acc.ownerId)?.name ?? "Shared"}</Badge>}
                </div>
                {acc.institution && <p className="text-xs text-zinc-500 mt-0.5">{acc.institution}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className={`font-semibold tabular-nums ${acc.balance >= 0 ? "text-zinc-100" : "text-red-400"}`}>
                  {formatCurrency(acc.balance, acc.currency)}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {acc.balanceMode === "manual" ? `manual · updated ${updatedAgo(acc.updatedAt)}` : acc.balanceMode}
                </p>
              </div>
              <div className="hidden group-hover:flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => openEdit(acc)}>Edit</Button>
                <Button variant="ghost" size="sm" onClick={() => deleteAccount(acc.id)} className="hover:text-red-400">Archive</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Account" : "Add Account"}>
        <AccountForm initial={editing} members={members} baseCurrency={baseCurrency} onSave={onSave} onCancel={() => setModalOpen(false)} />
      </Modal>
    </div>
  );
}
