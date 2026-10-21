import { hostname } from "node:os";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const config = {
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  allowedHosts: (process.env.ALLOWED_HOSTS ?? "localhost,127.0.0.1").split(",").map((h) => h.trim()),
  databaseUrl: required("DATABASE_URL"),
  // Tokens say iss = oidcIssuer; the pod fetches keys from oidcInternalUrl (same realm, Docker network)
  oidcIssuer: required("OIDC_ISSUER"),
  oidcInternalUrl: process.env.OIDC_INTERNAL_URL ?? required("OIDC_ISSUER"),
  resourceUrl: required("RESOURCE_URL"),
  podName: process.env.POD_NAME ?? hostname(),
};
