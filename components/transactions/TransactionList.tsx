"use client";

import { useEffect, useRef, useState } from "react";
import { Transaction } from "@/types";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Badge } from "@/components/ui/Badge";
import { DEFAULT_CATEGORIES } from "@/lib/categories";

interface TransactionListProps {
  transactions: Transaction[];
  onEdit?: (tx: Transaction) => void;
  onDelete?: (id: string) => void;
  onCategoryChange?: (id: string, category: string) => void;
  compact?: boolean;
}

function CategoryPicker({
  current,
  onSelect,
  onClose,
}: {
  current: string;
  onSelect: (cat: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full mt-1 z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1 min-w-44 max-h-64 overflow-y-auto"
    >
      {DEFAULT_CATEGORIES.map((cat) => (
        <button
          key={cat}
          onMouseDown={(e) => { e.preventDefault(); onSelect(cat); }}
          className={`w-full text-left px-3 py-1.5 text-sm transition-colors cursor-pointer ${
            cat === current
              ? "text-violet-300 bg-violet-900/30"
              : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}

export function TransactionList({
  transactions,
  onEdit,
  onDelete,
  onCategoryChange,
  compact = false,
}: TransactionListProps) {
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <p className="text-sm">No transactions yet — add one manually or import a CSV.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-zinc-800">
      {transactions.map((tx) => (
        <div key={tx.id} className="flex items-center gap-3 py-3 group">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-200 truncate">{tx.merchant}</span>
              {tx.isTransfer && <Badge variant="blue">Transfer</Badge>}
            </div>
            {!compact && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-zinc-500">{formatDate(tx.date)}</span>
                <span className="text-xs text-zinc-600">·</span>

                {/* Inline category picker */}
                <div className="relative">
                  {onCategoryChange ? (
                    <button
                      onClick={() => setOpenPickerId(openPickerId === tx.id ? null : tx.id)}
                      className="rounded focus:outline-none group/cat"
                      title="Click to change category"
                    >
                      <Badge variant="default" className="cursor-pointer group-hover/cat:ring-1 group-hover/cat:ring-violet-500/60 transition-all">
                        {tx.category}
                        <svg className="w-2.5 h-2.5 ml-1 opacity-40 group-hover/cat:opacity-80 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                      </Badge>
                    </button>
                  ) : (
                    <Badge variant="default">{tx.category}</Badge>
                  )}

                  {openPickerId === tx.id && onCategoryChange && (
                    <CategoryPicker
                      current={tx.category}
                      onSelect={(cat) => {
                        onCategoryChange(tx.id, cat);
                        setOpenPickerId(null);
                      }}
                      onClose={() => setOpenPickerId(null)}
                    />
                  )}
                </div>

                {tx.account && (
                  <>
                    <span className="text-xs text-zinc-600">·</span>
                    <span className="text-xs text-zinc-500">{tx.account.name}</span>
                  </>
                )}
              </div>
            )}
            {compact && <span className="text-xs text-zinc-500">{formatDate(tx.date)}</span>}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span
              className={`text-sm font-semibold tabular-nums ${
                tx.amount >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {tx.amount >= 0 ? "+" : ""}{formatCurrency(tx.amount, tx.currency)}
            </span>
            {(onEdit || onDelete) && (
              <div className="hidden group-hover:flex items-center gap-1">
                {onEdit && (
                  <button
                    onClick={() => onEdit(tx)}
                    className="p-1 text-zinc-500 hover:text-zinc-100 transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => onDelete(tx.id)}
                    className="p-1 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
