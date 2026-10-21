// Same checks as InsureBot step 02: signature, issuer, audience, expiry, RS256 only.
import { createRemoteJWKSet, jwtVerify } from "jose";
import { OAuthError, OAuthErrorCode, type AuthInfo, type OAuthTokenVerifier } from "@modelcontextprotocol/server";
import { config } from "./config.js";

const jwks = createRemoteJWKSet(new URL(`${config.oidcInternalUrl}/protocol/openid-connect/certs`));

export const verifier: OAuthTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    try {
      const { payload } = await jwtVerify(token, jwks, { issuer: config.oidcIssuer, audience: config.resourceUrl, algorithms: ["RS256"] });
      if (typeof payload.sub !== "string") throw new Error("no sub");
      const roles = ((payload as { realm_access?: { roles?: string[] } }).realm_access?.roles ?? []).filter((r) => r === "student" || r === "teacher");
      return {
        token,
        clientId: String(payload.azp ?? ""),
        scopes: typeof payload.scope === "string" ? payload.scope.split(" ") : [],
        expiresAt: payload.exp,
        resource: new URL(config.resourceUrl),
        extra: { sub: payload.sub, roles },
      };
    } catch (err) {
      console.warn("token rejected:", err instanceof Error ? err.message : err);
      throw new OAuthError(OAuthErrorCode.InvalidToken, "Invalid or expired token");
    }
  },
};

export type Principal = { sub: string; roles: string[] };

/** Who is calling: ONLY from the verified token. Never from arguments, URIs or clientInfo. */
export function principal(authInfo: AuthInfo | undefined): Principal {
  const extra = authInfo?.extra as Partial<Principal> | undefined;
  if (!extra?.sub) throw new Error("Unauthenticated");
  return { sub: extra.sub, roles: extra.roles ?? [] };
}
