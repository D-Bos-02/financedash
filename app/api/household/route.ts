import { loadHousehold } from "@/lib/household-data";

// Profile, members, income sources, goals and accounts in one go, for the household editors.
export async function GET() {
  return Response.json(await loadHousehold());
}
