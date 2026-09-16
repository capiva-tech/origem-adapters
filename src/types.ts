/** Formato de entrada = o que o endpoint /pull?format=json do origem-api devolve. */
export interface BrainCard {
  type:
    | "instruction"
    | "spec"
    | "harness"
    | "boundary"
    | "rule"
    | "memory"
    | "knowledge"
    | "prompt"
    | "skill"
    | "agent"
    | "mcp"
    | "integration"
    | string;
  title: string;
  content: string;
  /** Como interpretar `content`. Ausente = heurística por tipo. */
  contentFormat?: "markdown" | "json" | "frontmatter" | null;
  tags?: string[];
  folder?: string | null;
}

export interface BrainExport {
  origem?: { version: number; revision?: number | null };
  brain: {
    id?: string;
    name: string;
    slug?: string;
    description?: string | null;
  };
  cards: BrainCard[];
  /** Assinatura HMAC opcional do payload (calculada sem este campo). */
  signature?: string;
}

/**
 * Nível de risco de aplicar o arquivo em disco.
 * - "safe": só instrui a IA (markdown, skills, comandos, subagents). Aplicável direto.
 * - "privileged": pode EXECUTAR algo na máquina (hooks de shell, env com segredos,
 *   servidores MCP com `command`). Exige confirmação humana explícita no applier.
 */
export type Risk = "safe" | "privileged";

/**
 * Estratégia de escrita:
 * - "managed-block": mescla dentro de marcadores, preservando o resto do arquivo
 *   (arquivos compartilhados com o usuário: CLAUDE.md, AGENTS.md…).
 * - "whole-file": o Origem é dono do arquivo inteiro (arquivos gerados).
 * - "merge-json": deep-merge das chaves de topo (settings.json).
 */
export type WriteStrategy = "managed-block" | "whole-file" | "merge-json";

export interface OutputFile {
  /** Alvo que gerou o arquivo (agents, claude, cursor…). */
  target: TargetId;
  /** Caminho relativo sugerido (ex: "AGENTS.md", ".claude/settings.json"). */
  path: string;
  content: string;
  /** Risco de aplicar. Default tratado como "safe" se ausente. */
  risk?: Risk;
  strategy?: WriteStrategy;
}

export type TargetId =
  | "agents"
  | "claude"
  | "gemini"
  | "copilot"
  | "cursor"
  | "mcp"
  | "claude-settings"
  | "claude-skills"
  | "claude-commands"
  | "claude-agents";
