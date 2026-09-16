import { BrainExport } from "./types.js";

export interface FetchOptions {
  /** Base do endpoint /pull (emulador em dev, prod por padrão). */
  apiUrl?: string;
  /** Token de capacidade com escopo de leitura. */
  token: string;
}

const DEFAULT_API = "https://origem-ai.web.app";

/**
 * Puxa o Brain compilado em JSON (o mesmo payload que os adapters consomem).
 * Usa um token de LEITURA — nunca escreve nada.
 */
export async function fetchBrain(opts: FetchOptions): Promise<BrainExport> {
  const apiUrl = (opts.apiUrl ?? DEFAULT_API).replace(/\/$/, "");
  if (!opts.token) {
    throw new Error("Token ausente. Gere um link em 'Conectar com IA' no app Origem.");
  }
  const url = `${apiUrl}/pull?k=${encodeURIComponent(opts.token)}&format=json`;
  const res = await fetch(url);
  if (res.status === 401) {
    throw new Error("Token is invalid, expired or revoked. Run `origem connect` again.");
  }
  if (!res.ok) {
    throw new Error(`Falha ao puxar o Brain do Origem (HTTP ${res.status}).`);
  }
  return (await res.json()) as BrainExport;
}
