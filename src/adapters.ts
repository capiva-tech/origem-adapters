import { BrainExport, OutputFile } from "./types.js";
import { byType, renderMarkdown, slugify } from "./utils.js";

/**
 * Seções para alvos GENÉRICOS (AGENTS.md, Gemini, Copilot): eles não têm conceito
 * nativo de Skills/Subagentes, então DEGRADAMOS esses cards para documentação —
 * a capacidade fica descrita no arquivo de instruções, mesmo sem execução nativa.
 * (harness e mcp NÃO entram aqui: são config de máquina, não texto.)
 */
const GENERIC_SECTIONS = [
  { type: "instruction", title: "Instructions" },
  { type: "spec", title: "Specs (requirements)" },
  { type: "boundary", title: "Limites (Sempre / Perguntar antes / Nunca)" },
  { type: "rule", title: "Rules & Standards" },
  { type: "memory", title: "Memory & Context" },
  { type: "knowledge", title: "Conhecimento" },
  { type: "skill", title: "Skills / Capacidades" },
  { type: "agent", title: "Subagentes" },
  { type: "prompt", title: "Prompts & Comandos" },
  { type: "integration", title: "Integrations" },
];

/** AGENTS.md — arquivo canônico lido por Codex, Cursor, Copilot, Gemini, Windsurf… */
export function toAgentsMd(brain: BrainExport): OutputFile[] {
  return [
    {
      target: "agents",
      path: "AGENTS.md",
      content: renderMarkdown(brain, GENERIC_SECTIONS),
      risk: "safe",
      strategy: "managed-block",
    },
  ];
}

/** Seções que compõem o CLAUDE.md (prompt/skill/mcp/harness viram arquivos próprios). */
const CLAUDE_SECTIONS = [
  { type: "instruction", title: "Instructions" },
  { type: "spec", title: "Specs (requirements)" },
  { type: "boundary", title: "Limites (Sempre / Perguntar antes / Nunca)" },
  { type: "rule", title: "Rules & Standards" },
  { type: "memory", title: "Memory & Context" },
  { type: "knowledge", title: "Conhecimento" },
  { type: "integration", title: "Integrations" },
];

/** CLAUDE.md — Claude Code não lê AGENTS.md nativo, então geramos conteúdo completo. */
export function toClaudeMd(brain: BrainExport): OutputFile[] {
  return [
    {
      target: "claude",
      path: "CLAUDE.md",
      content: renderMarkdown(brain, CLAUDE_SECTIONS),
      risk: "safe",
      strategy: "managed-block",
    },
  ];
}

/** GEMINI.md — Gemini CLI (default) ou via context.fileName. */
export function toGeminiMd(brain: BrainExport): OutputFile[] {
  return [
    {
      target: "gemini",
      path: "GEMINI.md",
      content: renderMarkdown(brain, GENERIC_SECTIONS),
      risk: "safe",
      strategy: "managed-block",
    },
  ];
}

/** .github/copilot-instructions.md */
export function toCopilot(brain: BrainExport): OutputFile[] {
  return [
    {
      target: "copilot",
      path: ".github/copilot-instructions.md",
      content: renderMarkdown(brain, GENERIC_SECTIONS),
      risk: "safe",
      strategy: "managed-block",
    },
  ];
}

/**
 * Cursor: um arquivo .mdc por card de regra, com frontmatter MDC
 * (Cursor ignora .md sem frontmatter). alwaysApply por padrão.
 */
export function toCursorRules(brain: BrainExport): OutputFile[] {
  const rules = byType(brain.cards, "rule");
  if (rules.length === 0) return [];
  return rules.map((card) => {
    const desc = card.title.replace(/\n/g, " ");
    const content =
      `---\n` +
      `description: ${desc}\n` +
      `alwaysApply: true\n` +
      `---\n\n` +
      `${card.content}\n`;
    return {
      target: "cursor" as const,
      path: `.cursor/rules/${slugify(card.title)}.mdc`,
      content,
      risk: "safe" as const,
      strategy: "whole-file" as const,
    };
  });
}

/**
 * .mcp.json — junta os cards do tipo "mcp" num objeto { mcpServers }.
 * Cada card deve conter JSON: um mapa de servidores, um { mcpServers }, ou
 * uma definição única de servidor (chaveada pelo título do card).
 */
export function toMcpJson(brain: BrainExport): OutputFile[] {
  const cards = byType(brain.cards, "mcp");
  if (cards.length === 0) return [];

  const servers: Record<string, unknown> = {};

  for (const card of cards) {
    try {
      const parsed = JSON.parse(card.content) as Record<string, unknown>;
      const inner = (parsed.mcpServers as Record<string, unknown>) ?? parsed;
      if ("command" in inner || "url" in inner) {
        // Definição única de servidor → chaveia pelo título.
        servers[slugify(card.title)] = inner;
      } else {
        Object.assign(servers, inner);
      }
    } catch {
      // Card de MCP com JSON inválido é ignorado silenciosamente.
    }
  }

  if (Object.keys(servers).length === 0) return [];

  // Privilegiado: servidores MCP com `command` são processos spawnados na máquina
  // quando a IA roda — logo, aplicar isso exige confirmação humana.
  const anyStdio = Object.values(servers).some(
    (s) => s && typeof s === "object" && "command" in (s as Record<string, unknown>)
  );

  const out: OutputFile[] = [
    {
      target: "mcp",
      path: ".mcp.json",
      content: JSON.stringify({ mcpServers: servers }, null, 2) + "\n",
      risk: anyStdio ? "privileged" : "safe",
      strategy: "merge-json",
    },
  ];
  return out;
}
