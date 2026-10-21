// Creates the "campus" realm through Keycloak's admin API (no clicking), and is safe to run twice.
// Users' passwords come from .env.test, which this repo never commits (it is PUBLIC).
const KC = process.env.KEYCLOAK_URL ?? "http://127.0.0.1:8090";
const REALM = "campus";
const RESOURCE_URL = process.env.RESOURCE_URL ?? "http://localhost:4000/mcp"; // the future gateway: tokens are made for it
const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;
if (!adminPassword) throw new Error("KEYCLOAK_ADMIN_PASSWORD is not set (run scripts/setup.sh)");

const USERS = [
  { username: "sara", first: "Sara", last: "Ben Ali", role: "student" },
  { username: "bilal", first: "Bilal", last: "Haddad", role: "student" },
  { username: "mallory", first: "Mallory", last: "Grant", role: "student" },
  { username: "tom", first: "Tom", last: "Weber", role: "teacher" },
  { username: "lina", first: "Lina", last: "Saidi", role: "teacher" },
];

async function adminToken() {
  const res = await fetch(`${KC}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    body: new URLSearchParams({ grant_type: "password", client_id: "admin-cli", username: "admin", password: adminPassword }),
  });
  if (!res.ok) throw new Error(`Keycloak admin login failed: ${res.status}`);
  return (await res.json()).access_token;
}

const token = await adminToken();
async function api(method, path, body) {
  const res = await fetch(`${KC}/admin/realms${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 409) return null; // already exists: fine, we're idempotent
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// 1. realm
await api("POST", "", {
  realm: REALM,
  enabled: true,
  displayName: "CampusHub",
  registrationAllowed: false,
  loginWithEmailAllowed: false,
  bruteForceProtected: true,
  accessTokenLifespan: 300,
});

// 2. realm roles
for (const role of ["student", "teacher"]) await api("POST", `/${REALM}/roles`, { name: role });

// 3. a default client scope that puts CampusHub in every token's audience
await api("POST", `/${REALM}/client-scopes`, {
  name: "campushub-audience",
  protocol: "openid-connect",
  attributes: { "include.in.token.scope": "false" },
  protocolMappers: [
    {
      name: "campushub audience",
      protocol: "openid-connect",
      protocolMapper: "oidc-audience-mapper",
      config: { "included.custom.audience": RESOURCE_URL, "access.token.claim": "true", "id.token.claim": "false" },
    },
  ],
});
const scopes = await api("GET", `/${REALM}/client-scopes`);
const audienceScope = scopes.find((s) => s.name === "campushub-audience");
await api("PUT", `/${REALM}/default-default-client-scopes/${audienceScope.id}`);

// 4. the test client (password grant): lab and tests only. Real clients use browser login with PKCE.
await api("POST", `/${REALM}/clients`, {
  clientId: "campushub-tests",
  publicClient: true,
  standardFlowEnabled: false,
  directAccessGrantsEnabled: true,
});

// 5. users, with passwords from .env.test and one role each
const roles = Object.fromEntries((await api("GET", `/${REALM}/roles`)).map((r) => [r.name, r]));
const subs = {};
for (const u of USERS) {
  const password = process.env[`${u.username.toUpperCase()}_PASSWORD`];
  if (!password) throw new Error(`${u.username.toUpperCase()}_PASSWORD is not set`);
  await api("POST", `/${REALM}/users`, {
    username: u.username,
    enabled: true,
    email: `${u.username}@campus.test`,
    emailVerified: true,
    firstName: u.first,
    lastName: u.last,
    credentials: [{ type: "password", value: password, temporary: false }],
  });
  const [user] = await api("GET", `/${REALM}/users?username=${u.username}&exact=true`);
  // keep the password in sync with .env.test even if the user already existed
  await api("PUT", `/${REALM}/users/${user.id}/reset-password`, { type: "password", value: password, temporary: false });
  await api("POST", `/${REALM}/users/${user.id}/role-mappings/realm`, [roles[u.role]]);
  subs[u.username] = user.id;
}

console.log(JSON.stringify(subs)); // setup.sh stores these Keycloak ids in Postgres (users.kc_sub)
