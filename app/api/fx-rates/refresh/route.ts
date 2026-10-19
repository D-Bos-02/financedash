import { prisma } from "@/lib/prisma";
import { getQuote } from "@/lib/quote";

// Refresh every saved FX rate from the live market rate. Rates that can't be fetched keep their last value.
export async function POST() {
  const rates = await prisma.fxRate.findMany();
  const results = await Promise.all(
    rates.map(async (r) => {
      const quote = await getQuote(`${r.fromCurrency}${r.toCurrency}=X`, 6);
      if (!quote) return { pair: `${r.fromCurrency}/${r.toCurrency}`, ok: false };
      await prisma.fxRate.update({ where: { id: r.id }, data: { rate: quote.price } });
      return { pair: `${r.fromCurrency}/${r.toCurrency}`, ok: true, rate: quote.price, previous: r.rate };
    })
  );
  return Response.json({ results });
}
