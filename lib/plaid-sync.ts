import type { AccountBase, RemovedTransaction, Transaction as PlaidTransaction } from "plaid";
import type { PlaidItem } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { plaidClient, decryptToken, plaidErrorCode } from "@/lib/plaid";
import { applyRulesToMerchant } from "@/lib/rules";
import { MONEY_MOVEMENT } from "@/lib/categories";

const RETIREMENT_SUBTYPES = new Set([
  "401a", "401k", "403b", "457b", "ira", "roth", "roth 401k", "sep ira", "simple ira",
  "pension", "retirement", "keogh", "thrift savings plan", "rrsp", "tfsa",
]);

function mapAccountType(a: AccountBase): string {
  const subtype = a.subtype ?? "";
  switch (a.type) {
    case "depository":
      return ["savings", "money market", "cd", "hsa"].includes(subtype) ? "savings" : "checking";
    case "credit":
      return "credit";
    case "loan":
      return "loan";
    case "investment":
      if (RETIREMENT_SUBTYPES.has(subtype)) return "retirement";
      if (subtype === "crypto exchange") return "crypto";
      return "investment";
    default:
      return "other";
  }
}

function accountBalance(a: AccountBase, type: string): number {
  const current = a.balances.current ?? a.balances.available ?? 0;
  // Plaid reports amounts owed as positive; store liabilities as negative.
  return type === "credit" || type === "loan" ? -Math.abs(current) : current;
}

// Map Plaid's personal_finance_category onto the app's categories.
function mapCategory(t: PlaidTransaction): { category: string; isTransfer: boolean } {
  const primary = t.personal_finance_category?.primary ?? "";
  const detailed = t.personal_finance_category?.detailed ?? "";

  if (detailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT") return { category: MONEY_MOVEMENT, isTransfer: true };
  if (detailed === "LOAN_PAYMENTS_MORTGAGE_PAYMENT") return { category: "Housing", isTransfer: false };
  if (detailed.includes("INVESTMENT_AND_RETIREMENT_FUNDS")) return { category: MONEY_MOVEMENT, isTransfer: true };
  if (detailed === "RENT_AND_UTILITIES_RENT") return { category: "Housing", isTransfer: false };
  if (detailed === "GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT") return { category: "Tax", isTransfer: false };
  if (detailed === "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS") return { category: "Fitness", isTransfer: false };

  const byPrimary: Record<string, string> = {
    INCOME: "Income",
    TRANSFER_IN: MONEY_MOVEMENT,
    TRANSFER_OUT: MONEY_MOVEMENT,
    FOOD_AND_DRINK: "Food & Dining",
    GENERAL_MERCHANDISE: "Shopping",
    ENTERTAINMENT: "Entertainment",
    TRANSPORTATION: "Transport",
    TRAVEL: "Travel",
    MEDICAL: "Health & Medical",
    RENT_AND_UTILITIES: "Utilities",
    HOME_IMPROVEMENT: "Housing",
  };
  return {
    category: byPrimary[primary] ?? "Other",
    isTransfer: primary === "TRANSFER_IN" || primary === "TRANSFER_OUT",
  };
}

// Fields Plaid owns and may revise (pending → posted, amount corrections).
// Category/notes are left alone on updates so user edits survive re-syncs.
function plaidFields(t: PlaidTransaction) {
  return {
    date: new Date(t.date),
    merchant: t.merchant_name ?? t.name,
    // Plaid: positive = money out. App: negative = money out.
    amount: -t.amount,
    currency: t.iso_currency_code ?? t.unofficial_currency_code ?? "USD",
    pending: t.pending,
  };
}

async function fetchTransactionChanges(accessToken: string, startCursor: string | null) {
  const client = plaidClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const added: PlaidTransaction[] = [];
    const modified: PlaidTransaction[] = [];
    const removed: RemovedTransaction[] = [];
    let cursor = startCursor ?? undefined;
    let status = "";
    try {
      let hasMore = true;
      while (hasMore) {
        const { data } = await client.transactionsSync({
          access_token: accessToken,
          cursor,
          count: 500,
        });
        added.push(...data.added);
        modified.push(...data.modified);
        removed.push(...data.removed);
        cursor = data.next_cursor;
        hasMore = data.has_more;
        status = data.transactions_update_status;
      }
      return { added, modified, removed, cursor: cursor ?? null, status };
    } catch (err) {
      // Data changed mid-pagination: restart from the original cursor.
      if (plaidErrorCode(err) === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") continue;
      throw err;
    }
  }
  throw new Error("Transactions kept changing during sync; try again shortly");
}

export interface SyncResult {
  itemId: string;
  institution: string | null;
  ok: boolean;
  added: number;
  modified: number;
  removed: number;
  updateStatus?: string;
  error?: string;
}

export async function syncItem(item: PlaidItem): Promise<SyncResult> {
  const result: SyncResult = {
    itemId: item.id,
    institution: item.institutionName,
    ok: false,
    added: 0,
    modified: 0,
    removed: 0,
  };
  if (item.status === "removed") return { ...result, error: "Item was removed" };

  try {
    const accessToken = decryptToken(item.accessToken);

    // /accounts/get is free and returns Plaid's cached balances.
    // (/accounts/balance/get forces a live refresh but is billed per call.)
    const { data: acctData } = await plaidClient().accountsGet({ access_token: accessToken });
    const accountIdMap = new Map<string, { id: string; currency: string }>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const a of acctData.accounts) {
      const type = mapAccountType(a);
      const balance = accountBalance(a, type);
      const currency = a.balances.iso_currency_code ?? "USD";
      const account = await prisma.account.upsert({
        where: { plaidAccountId: a.account_id },
        update: { balance, balanceMode: "plaid", plaidItemId: item.id, isActive: true },
        create: {
          name: `${a.name}${a.mask ? ` ••${a.mask}` : ""}`,
          type,
          currency,
          institution: item.institutionName,
          balance,
          balanceMode: "plaid",
          plaidAccountId: a.account_id,
          plaidItemId: item.id,
        },
      });
      accountIdMap.set(a.account_id, { id: account.id, currency: account.currency });

      // One balance snapshot per account per day, for net-worth history.
      const snap = await prisma.balanceSnapshot.findFirst({
        where: { accountId: account.id, date: { gte: today } },
      });
      if (snap) {
        await prisma.balanceSnapshot.update({ where: { id: snap.id }, data: { balance } });
      } else {
        await prisma.balanceSnapshot.create({
          data: { accountId: account.id, date: new Date(), balance, currency },
        });
      }
    }

    const changes = await fetchTransactionChanges(accessToken, item.cursor);
    const rules = await prisma.categoryRule.findMany();

    // Apply all changes and advance the cursor atomically, so a failure
    // part-way through never skips transactions on the next sync.
    await prisma.$transaction(
      async (tx) => {
        for (const t of changes.added) {
          const acct = accountIdMap.get(t.account_id);
          if (!acct) continue;
          const fields = plaidFields(t);
          const rule = applyRulesToMerchant(fields.merchant, rules);
          const mapped = rule ?? mapCategory(t);
          await tx.transaction.upsert({
            where: { plaidTransactionId: t.transaction_id },
            update: fields,
            create: {
              ...fields,
              accountId: acct.id,
              category: mapped.category,
              subCategory: rule?.subCategory ?? null,
              isTransfer: mapped.isTransfer,
              source: "plaid",
              plaidTransactionId: t.transaction_id,
            },
          });
        }
        for (const t of changes.modified) {
          await tx.transaction.updateMany({
            where: { plaidTransactionId: t.transaction_id },
            data: plaidFields(t),
          });
        }
        const removedIds = changes.removed.map((r) => r.transaction_id);
        if (removedIds.length) {
          await tx.transaction.deleteMany({ where: { plaidTransactionId: { in: removedIds } } });
        }
        await tx.plaidItem.update({
          where: { id: item.id },
          data: { cursor: changes.cursor, status: "ok", errorCode: null, lastSyncedAt: new Date() },
        });
      },
      { timeout: 120_000 }
    );

    return {
      ...result,
      ok: true,
      added: changes.added.length,
      modified: changes.modified.length,
      removed: changes.removed.length,
      updateStatus: changes.status,
    };
  } catch (err) {
    const code = plaidErrorCode(err);
    const status =
      code === "ITEM_LOGIN_REQUIRED" || code === "PENDING_EXPIRATION" ? "login_required" : "error";
    await prisma.plaidItem.update({
      where: { id: item.id },
      data: { status, errorCode: code ?? (err instanceof Error ? err.message : "UNKNOWN") },
    });
    return { ...result, error: code ?? (err instanceof Error ? err.message : String(err)) };
  }
}
