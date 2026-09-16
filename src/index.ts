import { BrainExport, OutputFile, TargetId } from "./types.js";
import {
  toAgentsMd,
  toClaudeMd,
  toGeminiMd,
  toCopilot,
  toCursorRules,
  toMcpJson,
} from "./adapters.js";
import {
  toClaudeSettings,
  toClaudeSkills,
  toClaudeCommands,
  toClaudeAgents,
} from "./claude-adapters.js";

export * from "./types.js";
export * from "./capabilities.js";
export * from "./apply.js";
export * from "./fetch-brain.js";
export {
  toAgentsMd,
  toClaudeMd,
  toGeminiMd,
  toCopilot,
  toCursorRules,
  toMcpJson,
  toClaudeSettings,
  toClaudeSkills,
  toClaudeCommands,
  toClaudeAgents,
};
export { slugify, byType, renderMarkdown } from "./utils.js";

const ADAPTERS: Record<TargetId, (b: BrainExport) => OutputFile[]> = {
  agents: toAgentsMd,
  claude: toClaudeMd,
  gemini: toGeminiMd,
  copilot: toCopilot,
  cursor: toCursorRules,
  mcp: toMcpJson,
  "claude-settings": toClaudeSettings,
  "claude-skills": toClaudeSkills,
  "claude-commands": toClaudeCommands,
  "claude-agents": toClaudeAgents,
};

export const ALL_TARGETS = Object.keys(ADAPTERS) as TargetId[];

/** Conjunto completo de superfícies do Claude Code (instruções + runtime). */
export const CLAUDE_TARGETS: TargetId[] = [
  "claude",
  "claude-settings",
  "claude-skills",
  "claude-commands",
  "claude-agents",
  "mcp",
];

/**
 * Traduz um Brain para os formatos de config das IAs escolhidas.
 * @param brain  o export do Brain (do /pull?format=json)
 * @param targets alvos a gerar (default: todos)
 * @returns lista de arquivos { target, path, content, risk, strategy } prontos pra escrever
 */
export function adapt(brain: BrainExport, targets: TargetId[] = ALL_TARGETS): OutputFile[] {
  const out: OutputFile[] = [];
  for (const target of targets) {
    const fn = ADAPTERS[target];
    if (fn) out.push(...fn(brain));
  }
  return out;
}
