"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Household } from "./useHousehold";

const field = "bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500";

// The people whose money this is. A solo profile has exactly one.
export function MembersEditor({ h, solo }: { h: Household; solo: boolean }) {
  const [name, setName] = useState("");
  const canAdd = !solo || h.members.length === 0;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (await h.addMember(name.trim())) setName("");
  }

  async function remove(id: string, memberName: string) {
    const income = h.sources.filter((s) => s.memberId === id).length;
    const accounts = h.accounts.filter((a) => a.ownerId === id).length;
    const effects = [income && `their ${income} income source${income > 1 ? "s" : ""} will be deleted`, accounts && `their ${accounts} account${accounts > 1 ? "s become" : " becomes"} shared`]
      .filter(Boolean).join(" and ");
    if (confirm(`Remove ${memberName}?${effects ? ` ${effects[0].toUpperCase()}${effects.slice(1)}.` : ""}`)) await h.removeMember(id);
  }

  return (
    <div className="space-y-3">
      {h.members.map((m) => (
        <div key={m.id} className="flex items-center gap-2">
          <input
            type="color"
            value={m.color}
            onChange={(e) => h.updateMember(m.id, { color: e.target.value })}
            className="w-9 h-9 rounded-lg bg-transparent border border-zinc-700 cursor-pointer shrink-0"
            aria-label={`${m.name}'s colour`}
          />
          <input
            value={m.name}
            onChange={(e) => h.updateMember(m.id, { name: e.target.value })}
            className={`flex-1 min-w-0 ${field}`}
            aria-label="Name"
            maxLength={60}
          />
          {(h.members.length > 1 || !solo) && (
            <Button variant="ghost" size="sm" onClick={() => remove(m.id, m.name)}>Remove</Button>
          )}
        </div>
      ))}
      {canAdd && (
        <form onSubmit={add} className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={h.members.length ? "Another person's name" : "Your name"}
            className={`flex-1 min-w-0 ${field}`}
            maxLength={60}
            aria-label="New person's name"
          />
          <Button type="submit" variant="secondary" disabled={!name.trim()}>{solo ? "Add" : "Add person"}</Button>
        </form>
      )}
      <p className="text-[11px] text-zinc-500">
        {solo ? "Used to label your income and accounts." : "Accounts can belong to one person or be shared. Shared balances are split equally in plans."}
      </p>
    </div>
  );
}
