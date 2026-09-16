import { TargetId } from "./types.js";

/** Como um alvo consome um tipo de card. */
export type Support =
  | "native" // vira um arquivo/config real que a ferramenta executa
  | "degraded" // não há suporte nativo → vira documentação no arquivo de instruções
  | "none"; // não se aplica àquele alvo

export type BrainCardType =
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
  | "integration";

export interface TargetCapability {
  id: TargetId;
  /** Rótulo amigável da ferramenta/arquivo. */
  label: string;
  /** Onde o resultado é gravado. */
  path: string;
  /** Suporte por tipo de card. */
  support: Record<BrainCardType, Support>;
  note?: string;
}

const ALL_DEGRADED: Record<BrainCardType, Support> = {
  instruction: "native",
  spec: "native",
  boundary: "native",
  rule: "native",
  memory: "native",
  knowledge: "native",
  prompt: "degraded",
  integration: "native",
  skill: "degraded",
  agent: "degraded",
  harness: "none",
  mcp: "none",
};

/**
 * A REALIDADE: só a camada de instruções (instruction/rule/memory/knowledge) é
 * verdadeiramente portável entre IAs. harness (settings/hooks/permissões),
 * skills, subagentes e slash-commands são conceitos majoritariamente do
 * Claude Code. Nos alvos genéricos, o que não tem suporte nativo é DEGRADADO
 * para documentação (fica descrito, mesmo sem execução).
 */
export const TARGET_CAPABILITIES: TargetCapability[] = [
  {
    id: "claude",
    label: "Claude Code · CLAUDE.md",
    path: "CLAUDE.md",
    support: {
      instruction: "native",
      spec: "native", // renderizado no CLAUDE.md
      boundary: "native", // renderizado no CLAUDE.md
      rule: "native",
      memory: "native",
      knowledge: "native",
      integration: "native",
      prompt: "none", // vira slash command (claude-commands)
      skill: "none", // vira SKILL.md (claude-skills)
      agent: "none", // vira subagente (claude-agents)
      harness: "none", // vira settings.json (claude-settings)
      mcp: "none", // vira .mcp.json
    },
    note: "Canonical instructions. Prompt/skill/agent/harness/mcp become their own Claude files.",
  },
  {
    id: "claude-settings",
    label: "Claude Code · settings.json",
    path: ".claude/settings.json",
    support: onlyNative("harness"),
    note: "Permissions, env, hooks and model. Privileged (runs on your machine).",
  },
  {
    id: "claude-skills",
    label: "Claude Code · Agent Skills",
    path: ".claude/skills/<nome>/SKILL.md",
    support: onlyNative("skill"),
  },
  {
    id: "claude-commands",
    label: "Claude Code · Slash commands",
    path: ".claude/commands/<nome>.md",
    support: onlyNative("prompt"),
  },
  {
    id: "claude-agents",
    label: "Claude Code · Subagentes",
    path: ".claude/agents/<nome>.md",
    support: onlyNative("agent"),
  },
  {
    id: "mcp",
    label: "MCP servers · .mcp.json",
    path: ".mcp.json",
    support: onlyNative("mcp"),
    note: "Portable in concept; the PATH varies per tool (Cursor: .cursor/mcp.json, VS Code: .vscode/mcp.json).",
  },
  {
    id: "agents",
    label: "AGENTS.md (Codex, Windsurf, Zed, Aider…)",
    path: "AGENTS.md",
    support: ALL_DEGRADED,
    note: "The converged instruction standard. No native skills/subagents concept → they become documentation.",
  },
  {
    id: "gemini",
    label: "Gemini CLI · GEMINI.md",
    path: "GEMINI.md",
    support: ALL_DEGRADED,
  },
  {
    id: "copilot",
    label: "GitHub Copilot · instructions",
    path: ".github/copilot-instructions.md",
    support: ALL_DEGRADED,
  },
  {
    id: "cursor",
    label: "Cursor · rules",
    path: ".cursor/rules/*.mdc",
    support: {
      ...ALL_DEGRADED,
      instruction: "degraded", // nosso adapter de cursor só emite `rule`
      spec: "none",
      boundary: "none",
      memory: "none",
      knowledge: "none",
      prompt: "none",
      integration: "none",
      skill: "none",
      agent: "none",
    },
    note: "Our adapter emits rules only (.mdc). Cursor also reads AGENTS.md and .cursor/mcp.json (roadmap).",
  },
];

function onlyNative(type: BrainCardType): Record<BrainCardType, Support> {
  const base: Record<BrainCardType, Support> = {
    instruction: "none",
    spec: "none",
    boundary: "none",
    harness: "none",
    rule: "none",
    memory: "none",
    knowledge: "none",
    prompt: "none",
    skill: "none",
    agent: "none",
    mcp: "none",
    integration: "none",
  };
  base[type] = "native";
  return base;
}

/** Resumo: quais tipos deste Brain são nativos/degradados/ignorados num alvo. */
export function coverageFor(
  target: TargetId,
  presentTypes: BrainCardType[]
): { native: BrainCardType[]; degraded: BrainCardType[]; skipped: BrainCardType[] } {
  const cap = TARGET_CAPABILITIES.find((c) => c.id === target);
  const native: BrainCardType[] = [];
  const degraded: BrainCardType[] = [];
  const skipped: BrainCardType[] = [];
  for (const t of presentTypes) {
    const s = cap?.support[t] ?? "none";
    if (s === "native") native.push(t);
    else if (s === "degraded") degraded.push(t);
    else skipped.push(t);
  }
  return { native, degraded, skipped };
}
