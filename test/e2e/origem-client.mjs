// Cliente de e2e do Origem: fala com a API REAL (produção por padrão).
// Usa só fetch; nenhuma dependência. Credenciais vêm do ambiente.
//
//   ORIGEM_E2E_EMAIL / ORIGEM_E2E_PASSWORD   conta de teste (obrigatório)
//   ORIGEM_E2E_MEMBER_EMAIL / _PASSWORD      segunda conta (testes de organização)
//   ORIGEM_API_URL                           default https://origem-ai.web.app
//   ORIGEM_CALLABLE_URL                      default …cloudfunctions.net/api
//   ORIGEM_FIREBASE_API_KEY                  web API key pública do projeto

export const API_URL = (process.env.ORIGEM_API_URL || "https://origem-ai.web.app").replace(/\/$/, "");
export const CALLABLE_URL =
  process.env.ORIGEM_CALLABLE_URL || "https://southamerica-east1-origem-ai.cloudfunctions.net/api";
const FIREBASE_KEY = process.env.ORIGEM_FIREBASE_API_KEY || "AIzaSyA83GHqlqJqT10p3HzsE8eMYjy_q4tAhPU";

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`e2e: defina ${name} (ver README, seção e2e)`);
  return v;
}

/** Sessão Firebase de uma conta de teste. */
export async function signIn(email, password) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Referer: `${API_URL}/` },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`signIn falhou: ${JSON.stringify(data.error ?? data)}`);
  const session = { uid: data.localId, email, idToken: data.idToken };
  session.call = (fn, payload = {}) => call(session, fn, payload);
  return session;
}

export async function adminSession() {
  return signIn(requireEnv("ORIGEM_E2E_EMAIL"), requireEnv("ORIGEM_E2E_PASSWORD"));
}

export async function memberSession() {
  return signIn(requireEnv("ORIGEM_E2E_MEMBER_EMAIL"), requireEnv("ORIGEM_E2E_MEMBER_PASSWORD"));
}

/** Chama um callable pelo roteador `api`, igual ao app web. */
export async function call(session, fn, payload = {}) {
  const res = await fetch(CALLABLE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.idToken}` },
    body: JSON.stringify({ data: { fn, data: payload } }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const e = new Error(`${fn}: ${body.error?.message ?? `HTTP ${res.status}`}`);
    e.status = body.error?.status;
    throw e;
  }
  return body.result?.data;
}

/** Harness de teste com peças. Devolve { brainId, cleanup }. */
export async function createHarness(session, name, pieces = []) {
  const brain = await session.call("createBrain", { name, description: "e2e — pode apagar" });
  for (const p of pieces) {
    await session.call("createCard", { brainId: brain.id, tags: [], folderId: null, ...p });
  }
  return {
    brainId: brain.id,
    cleanup: () => session.call("deleteBrain", { brainId: brain.id }).catch(() => undefined),
  };
}

/** Token de capacidade bruto (aparece uma vez só). */
export async function createToken(session, brainId, scopes = ["read"]) {
  const t = await session.call("createToken", { brainId, label: "e2e", expiresInDays: 1, scopes });
  const raw = t.token ?? t.rawToken ?? t.value;
  if (!raw) throw new Error(`createToken não devolveu o token: ${JSON.stringify(t)}`);
  return raw;
}

/**
 * Faz o papel do navegador no OAuth: segue o /oauth/authorize até a tela de
 * consentimento, aprova como o usuário logado (mesmo callable que o botão
 * "Autorizar" chama) e entrega o código no redirect_uri do cliente.
 */
export async function approveInBrowser(session, authorizeUrl, brainId, scopes) {
  const res = await fetch(authorizeUrl, { redirect: "manual" });
  const location = res.headers.get("location");
  if (res.status !== 302 || !location) {
    throw new Error(`authorize não redirecionou para o consentimento (HTTP ${res.status})`);
  }
  const q = new URL(location, API_URL).searchParams;
  const requested = (q.get("scope") || "read").split(/\s+/).filter(Boolean);
  const approved = await session.call("approveOAuth", {
    clientId: q.get("client_id"),
    redirectUri: q.get("redirect_uri"),
    codeChallenge: q.get("code_challenge"),
    state: q.get("state") ?? undefined,
    brainId,
    scopes: scopes ?? requested,
  });
  const back = await fetch(approved.redirectTo);
  return { status: back.status, redirectTo: approved.redirectTo };
}

export async function pull(token, format = "json") {
  const res = await fetch(`${API_URL}/pull?k=${encodeURIComponent(token)}&format=${format}`);
  if (!res.ok) throw new Error(`/pull HTTP ${res.status}`);
  return format === "json" ? res.json() : res.text();
}

export function assert(cond, msg) {
  if (!cond) throw new Error(`assert: ${msg}`);
}

/** Runner mínimo: cada teste roda, falha conta, exit code reflete. */
export async function run(tests) {
  let failed = 0;
  for (const [name, fn] of tests) {
    const t0 = Date.now();
    try {
      await fn();
      console.log(`  ✓ ${name} (${Date.now() - t0}ms)`);
    } catch (e) {
      failed++;
      console.log(`  ✗ ${name}\n      ${e.stack?.split("\n").slice(0, 3).join("\n      ")}`);
    }
  }
  console.log(failed ? `\n${failed} falha(s)` : `\n${tests.length} teste(s) ok`);
  process.exitCode = failed ? 1 : 0;
}
