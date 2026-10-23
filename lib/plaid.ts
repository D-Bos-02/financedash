import crypto from "crypto";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

export type PlaidEnv = "sandbox" | "production";

export function plaidEnv(): PlaidEnv {
  // Production must be opted into explicitly — every Production Item counts
  // against the Trial plan's 10-Item limit, even after removal.
  return process.env.PLAID_ENV === "production" ? "production" : "sandbox";
}

export function plaidConfigured(): boolean {
  return Boolean(
    process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET && process.env.PLAID_TOKEN_KEY
  );
}

const globalForPlaid = globalThis as unknown as { plaid?: PlaidApi; plaidKey?: string };

export function plaidClient(): PlaidApi {
  if (!plaidConfigured()) throw new Error("Plaid is not configured — set PLAID_* in .env");
  // Rebuilt when the keys or environment change, since .env is reloaded while the dev server runs.
  const key = `${plaidEnv()}:${process.env.PLAID_CLIENT_ID}:${process.env.PLAID_SECRET}`;
  if (!globalForPlaid.plaid || globalForPlaid.plaidKey !== key) {
    globalForPlaid.plaidKey = key;
    globalForPlaid.plaid = new PlaidApi(
      new Configuration({
        basePath: PlaidEnvironments[plaidEnv()],
        baseOptions: {
          headers: {
            "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
            "PLAID-SECRET": process.env.PLAID_SECRET,
          },
        },
      })
    );
  }
  return globalForPlaid.plaid;
}

// Access tokens are stored encrypted (AES-256-GCM) so a copied dev.db alone
// can't be used to pull bank data.
function tokenKey(): Buffer {
  const key = Buffer.from(process.env.PLAID_TOKEN_KEY ?? "", "hex");
  if (key.length !== 32) throw new Error("PLAID_TOKEN_KEY must be 64 hex characters");
  return key;
}

export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenKey(), iv);
  const enc = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptToken(stored: string): string {
  const [iv, tag, enc] = stored.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", tokenKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function plaidErrorCode(err: unknown): string | null {
  const data = (err as { response?: { data?: { error_code?: string } } })?.response?.data;
  return data?.error_code ?? null;
}
