import { OutputFile, Risk, TargetId, WriteStrategy } from "./types.js";

/**
 * Aplicação de um Brain no disco — o INVERSO da ingestão.
 *
 * O engine é PURO: recebe o conteúdo atual do arquivo (ou null se não existe) e
 * devolve o conteúdo final a gravar, sem tocar no filesystem. Quem faz IO é o CLI.
 * Isso mantém tudo testável e determinístico.
 */

/** Marcadores do bloco gerenciado pelo Origem em arquivos compartilhados (markdown). */
export const BLOCK_START =
  "<!-- ORIGEM:START — bloco gerenciado pelo Origem. Não edite aqui dentro; edite no app. -->";
export const BLOCK_END = "<!-- ORIGEM:END -->";

export type ApplyAction = "create" | "update" | "unchanged";

export interface PlannedFile {
  path: string;
  target: TargetId;
  risk: Risk;
  strategy: WriteStrategy;
  action: ApplyAction;
  /** Conteúdo final pronto pra gravar. */
  content: string;
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith("\n") ? s : s + "\n";
}

/**
 * Injeta/atualiza o bloco gerenciado preservando o resto do arquivo do usuário.
 * Idempotente: reaplicar o mesmo Brain não muda o arquivo (todas as ramificações
 * normalizam o miolo do mesmo jeito e não colapsam nada fora do bloco).
 */
export function injectManagedBlock(existing: string | null, generated: string): string {
  // Miolo normalizado uma única vez (some com excesso de linhas em branco geradas).
  const core = generated.trim().replace(/\n{3,}/g, "\n\n");
  const block = `${BLOCK_START}\n${core}\n${BLOCK_END}`;

  if (existing == null || existing.trim() === "") return `${block}\n`;

  const start = existing.indexOf(BLOCK_START);
  const end = existing.indexOf(BLOCK_END);
  if (start !== -1 && end !== -1 && end > start) {
    const before = existing.slice(0, start);
    const after = existing.slice(end + BLOCK_END.length);
    return `${before}${block}${after}`;
  }
  // Sem bloco ainda: anexa ao fim, preservando o conteúdo existente.
  return `${existing.trimEnd()}\n\n${block}\n`;
}

/**
 * Deep-merge genérico pra merge-json:
 * - objetos: mescla recursivamente
 * - arrays: concatena e deduplica (permissões, allow-lists…)
 * - escalares: o gerado (Origem) vence, mas chaves não-tocadas do disco ficam.
 */
export function deepMerge(
  base: Record<string, unknown>,
  add: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(add)) {
    const cur = out[k];
    if (Array.isArray(v)) {
      const prev = Array.isArray(cur) ? cur : [];
      out[k] = Array.from(new Set([...prev, ...v]));
    } else if (v && typeof v === "object") {
      const prev =
        cur && typeof cur === "object" && !Array.isArray(cur)
          ? (cur as Record<string, unknown>)
          : {};
      out[k] = deepMerge(prev, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function mergeJson(existing: string | null, generated: string): string {
  let base: Record<string, unknown> = {};
  if (existing && existing.trim()) {
    try {
      const parsed = JSON.parse(existing);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        base = parsed as Record<string, unknown>;
      }
    } catch {
      // Disco com JSON inválido: não sobrescrevemos às cegas — tratamos como vazio
      // e o merge vira o conteúdo gerado (o usuário revê no diff/dry-run).
    }
  }
  let gen: Record<string, unknown> = {};
  try {
    gen = JSON.parse(generated) as Record<string, unknown>;
  } catch {
    return ensureTrailingNewline(generated);
  }
  return JSON.stringify(deepMerge(base, gen), null, 2) + "\n";
}

/** Calcula o conteúdo final de UM arquivo, dado o que já existe no disco. */
export function planFile(file: OutputFile, existing: string | null): PlannedFile {
  const strategy = file.strategy ?? "whole-file";
  let content: string;
  switch (strategy) {
    case "managed-block":
      content = injectManagedBlock(existing, file.content);
      break;
    case "merge-json":
      content = mergeJson(existing, file.content);
      break;
    case "whole-file":
    default:
      content = ensureTrailingNewline(file.content);
      break;
  }
  const action: ApplyAction =
    existing == null ? "create" : existing === content ? "unchanged" : "update";
  return {
    path: file.path,
    target: file.target,
    risk: file.risk ?? "safe",
    strategy,
    action,
    content,
  };
}

/**
 * Monta o plano de aplicação. `read(path)` devolve o conteúdo atual do arquivo
 * (ou null se não existe) — injetado pelo CLI pra manter o engine sem IO.
 */
export function plan(
  files: OutputFile[],
  read: (path: string) => string | null
): PlannedFile[] {
  return files.map((f) => planFile(f, read(f.path)));
}
