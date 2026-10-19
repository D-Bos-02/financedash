// Home purchase maths for goals using the house template, shared by the planner's Home Purchase tab and the chat assistant.

import { JOINT, type GoalContribution, type Member } from "@/lib/household";
import { sanitizeAgainst, type PlannerInputs, type PlannerPosition } from "@/lib/planner";

// Inputs stored in a house goal's details. The deadline (plan A) is the goal's own deadline.
export const HOUSE_DEFAULTS = {
  price: 600000,
  depPct: 20,
  closePct: 2.5,
  reserve: 30000,
  mortgageRate: 6.5,
  mortgageYears: 30,
  keepPct: 0, // % of investment portfolios left unsold
  fallbackMonths: 18, // plan B, if the purchase slips
  // Owning costs on top of the mortgage
  propTaxPct: 1.1, // effective property tax, % of price a year
  insuranceMonthly: 150,
  hoaMonthly: 0,
  maintenancePct: 1, // upkeep, % of price a year
  pmiPct: 0.5, // mortgage insurance, % of the loan a year, only below 20% down
};
export type HouseDetails = typeof HOUSE_DEFAULTS;

export function houseDetails(details: unknown): HouseDetails {
  return sanitizeAgainst(HOUSE_DEFAULTS, details);
}

export type HomePlanInputs = HouseDetails & Pick<PlannerInputs, "rent" | "lifestyle" | "retirementMonthly" | "taxDrag">;

// What owning costs each month once you've bought, against renting today.
export interface OwnershipCost {
  principalInterest: number;
  propertyTax: number;
  insurance: number;
  hoa: number;
  maintenance: number;
  pmi: number; // only below 20% down
  total: number;
  vsRent: number; // total minus current rent
  freeCashAfter: number; // take-home less owning costs, lifestyle and retirement contributions
}

export interface BuyerPosition {
  key: string; // member id, or JOINT when there are no members
  name: string;
  ownCash: number;
  ownInvested: number;
  jointShare: number; // an equal share of the shared accounts
  unvested: number;
  savings: number; // cash + investments sold after tax drag, including the shared share
  gift: number; // contributions still to come, attributed to this buyer
}

export interface HomePlan {
  deposit: number;
  closing: number;
  keptValue: number; // investments left unsold, counted as the reserve
  reserveCash: number;
  totalNeeded: number;
  gifts: number; // one-off contributions still to come, from anyone
  savings: number;
  availableNow: number;
  remainder: number; // positive = still short, negative = surplus
  loan: number;
  monthlyPayment: number; // principal + interest
  freeCashPerMonth: number; // take-home less rent, lifestyle and retirement contributions
  ownership: OwnershipCost;
  buyers: BuyerPosition[];
}

export function runHomePlan(
  inputs: HomePlanInputs,
  position: PlannerPosition,
  incomeTotal: number,
  members: Pick<Member, "id" | "name">[],
  contributions: Pick<GoalContribution, "memberId" | "amount" | "received">[]
): HomePlan {
  const { price, depPct, closePct, reserve, taxDrag, mortgageRate, mortgageYears, keepPct, rent, lifestyle, retirementMonthly } = inputs;
  const { propTaxPct, insuranceMonthly, hoaMonthly, maintenancePct, pmiPct } = inputs;
  const { holdings } = position;
  const none = { cash: 0, invested: 0, retirement: 0, unvested: 0 };
  const joint = holdings[JOINT] ?? none;

  const deposit = (price * depPct) / 100;
  const closing = (price * closePct) / 100;
  const totalInvested = Object.values(holdings).reduce((s, h) => s + h.invested, 0);
  const keptValue = (totalInvested * keepPct) / 100;
  // Investments left unsold act as the post-closing reserve, so they reduce the cash reserve needed.
  const reserveCash = Math.max(0, reserve - keptValue);
  const totalNeeded = deposit + closing + reserveCash;
  const loan = price - deposit;
  const mr = mortgageRate / 100 / 12;
  const n = Math.max(1, mortgageYears) * 12;
  const monthlyPayment = mr > 0 ? (loan * mr) / (1 - Math.pow(1 + mr, -n)) : loan / n;

  // Per-person view (shared accounts split equally); the plan itself uses the household totals.
  // With no members set up, the whole pot belongs to one "Household" buyer.
  const people = members.length
    ? members.map((m) => ({ key: m.id, name: m.name, own: holdings[m.id] ?? none, jointPart: 1 / members.length }))
    : [{ key: JOINT, name: "Household", own: none, jointPart: 1 }];
  const pending = contributions.filter((c) => !c.received);
  const buyers: BuyerPosition[] = people.map((p) => {
    const cash = p.own.cash + joint.cash * p.jointPart;
    const invested = p.own.invested + joint.invested * p.jointPart;
    return {
      key: p.key,
      name: p.name,
      ownCash: p.own.cash,
      ownInvested: p.own.invested,
      jointShare: (joint.cash + joint.invested) * p.jointPart,
      unvested: p.own.unvested,
      savings: cash + invested * (1 - keepPct / 100) * (1 - taxDrag / 100),
      gift: pending.filter((c) => c.memberId === p.key).reduce((s, c) => s + c.amount, 0),
    };
  });

  const owning = {
    principalInterest: monthlyPayment,
    propertyTax: (price * propTaxPct) / 100 / 12,
    insurance: insuranceMonthly,
    hoa: hoaMonthly,
    maintenance: (price * maintenancePct) / 100 / 12,
    pmi: depPct < 20 ? (loan * pmiPct) / 100 / 12 : 0,
  };
  const owningTotal = Object.values(owning).reduce((s, v) => s + v, 0);
  const ownership: OwnershipCost = {
    ...owning,
    total: owningTotal,
    vsRent: owningTotal - rent,
    freeCashAfter: incomeTotal - owningTotal - lifestyle - retirementMonthly,
  };

  const gifts = pending.reduce((s, c) => s + c.amount, 0);
  const savings = buyers.reduce((s, b) => s + b.savings, 0);

  return {
    deposit,
    closing,
    keptValue,
    reserveCash,
    totalNeeded,
    gifts,
    savings,
    availableNow: savings + gifts,
    remainder: totalNeeded - gifts - savings,
    loan,
    monthlyPayment,
    freeCashPerMonth: incomeTotal - rent - lifestyle - retirementMonthly,
    ownership,
    buyers,
  };
}

// Savings needed each month to close the gap within `months`, after any lump sums expected before then
// (e.g. equity vests). incomeTotal passed to runHomePlan should be regular monthly pay only.
export function monthlyNeeded(plan: HomePlan, months: number, lumpsBefore = 0): number {
  return Math.max(0, plan.remainder - lumpsBefore) / Math.max(1, months);
}
