import { BrainExport, OutputFile } from "./types.js";
import { byType, hasFrontmatter, slugify, tryJson, yamlScalar } from "./utils.js";

/** Deep-merge com regra especial: arrays de permissões são concatenados+deduplicados. */
function mergeSettings(
  base: Record<string, unknown>,
  add: Record<string, unknown>
): Record<string, unknown> {
  for (const [k, v] of Object.entries(add)) {
    const cur = base[k];
    if (Array.isArray(v)) {
      const prev = Array.isArray(cur) ? cur : [];
      base[k] = Array.from(new Set([...prev, ...v]));
    } else if (v && typeof v === "object") {
      const prev =
        cur && typeof cur === "object" && !Array.isArray(cur)
          ? (cur as Record<string, unknown>)
          : {};
      base[k] = mergeSettings({ ...prev }, v as Record<string, unknown>);
    } else {
      base[k] = v; // escalar: último vence
    }
  }
  return base;
}

/**
 * .claude/settings.json — junta os cards `harness` (permissions, env, model, hooks).
 * PRIVILEGIADO: hooks executam shell e env pode conter segredos → o applier confirma.
 * Cada card `harness` deve conter JSON, ex:
 *   { "model": "claude-opus-4-8", "permissions": { "allow": ["Bash(npm run *)"] },
 *     "hooks": { ... }, "env": { "FOO": "bar" } }
 */
export function toClaudeSettings(brain: BrainExport): OutputFile[] {
  const cards = byType(brain.cards, "harness");
  if (cards.length === 0) return [];

  let settings: Record<string, unknown> = {};
  let parsedAny = false;
  for (const card of cards) {
    const json = tryJson<Record<string, unknown>>(card.content);
    if (json && typeof json === "object" && !Array.isArray(json)) {
      settings = mergeSettings(settings, json);
      parsedAny = true;
    }
  }
  if (!parsedAny) return [];

  // settings.json sempre é privilegiado: pode conter hooks (shell), env (segredos)
  // ou permissões que relaxam os prompts de aprovação. Nunca aplicar sem confirmação.
  return [
    {
      target: "claude-settings",
      path: ".claude/settings.json",
      content: JSON.stringify(settings, null, 2) + "\n",
      risk: "privileged",
      strategy: "merge-json",
    },
  ];
}

/**
 * Skill, comando e subagente viram instrução que o agente segue — e alguns
 * recursos deles EXECUTAM ou ampliam permissões sem novo prompt: hooks,
 * permissionMode, mcpServers, allowed-tools no frontmatter, e linhas que o
 * Claude Code roda como comando ao carregar a peça ("!" seguido de crase).
 * Esses arquivos passam a ser "privileged": só são gravados com confirmação
 * (ou --allow-privileged), igual a settings.json e MCP stdio. Os demais seguem
 * "safe".
 */
const EXEC_KEYS = /^(hooks|permissionMode|mcpServers|allowed-tools|allowedTools)\s*:/m;
const EXEC_LINE = /^\s*!`/m;

export function pieceRisk(content: string): "safe" | "privileged" {
  const fm = /^---\s*\n([\s\S]*?)\n---/.exec(content.trimStart());
  if (fm && EXEC_KEYS.test(fm[1])) return "privileged";
  if (EXEC_LINE.test(content)) return "privileged";
  return "safe";
}

/**
 * .claude/skills/<nome>/SKILL.md — um card `skill` vira uma Agent Skill.
 * Se o content já tiver frontmatter, é respeitado; senão geramos a partir de título/tags.
 */
export function toClaudeSkills(brain: BrainExport): OutputFile[] {
  const cards = byType(brain.cards, "skill");
  return cards.map((card) => {
    const slug = slugify(card.title);
    let content: string;
    if (hasFrontmatter(card.content)) {
      content = card.content.endsWith("\n") ? card.content : card.content + "\n";
    } else {
      const description = card.tags?.length ? card.tags.join(", ") : card.title;
      content =
        `---\n` +
        `name: ${yamlScalar(slug)}\n` +
        `description: ${yamlScalar(description)}\n` +
        `---\n\n` +
        `# ${card.title}\n\n${card.content}\n`;
    }
    return {
      target: "claude-skills" as const,
      path: `.claude/skills/${slug}/SKILL.md`,
      content,
      risk: pieceRisk(content),
      strategy: "whole-file" as const,
    };
  });
}

/**
 * .claude/commands/<nome>.md — um card `prompt` vira um slash command.
 */
export function toClaudeCommands(brain: BrainExport): OutputFile[] {
  const cards = byType(brain.cards, "prompt");
  return cards.map((card) => {
    const slug = slugify(card.title);
    let content: string;
    if (hasFrontmatter(card.content)) {
      content = card.content.endsWith("\n") ? card.content : card.content + "\n";
    } else {
      content =
        `---\n` +
        `description: ${yamlScalar(card.title)}\n` +
        `---\n\n` +
        `${card.content}\n`;
    }
    return {
      target: "claude-commands" as const,
      path: `.claude/commands/${slug}.md`,
      content,
      risk: pieceRisk(content),
      strategy: "whole-file" as const,
    };
  });
}

interface AgentSpec {
  description?: string;
  tools?: string | string[];
  model?: string;
  prompt?: string;
}

/**
 * .claude/agents/<nome>.md — um card `agent` vira um subagente.
 * O content pode ser: (a) frontmatter+corpo já pronto, ou
 * (b) JSON { description, tools?, model?, prompt } que montamos.
 */
export function toClaudeAgents(brain: BrainExport): OutputFile[] {
  const cards = byType(brain.cards, "agent");
  return cards.map((card) => {
    const slug = slugify(card.title);
    let content: string;

    if (hasFrontmatter(card.content)) {
      content = card.content.endsWith("\n") ? card.content : card.content + "\n";
    } else {
      const spec = tryJson<AgentSpec>(card.content) ?? {};
      const description = spec.description ?? card.title;
      const tools = Array.isArray(spec.tools) ? spec.tools.join(", ") : spec.tools;
      const body = spec.prompt ?? (tryJson(card.content) ? "" : card.content);
      const fm = [
        `name: ${yamlScalar(slug)}`,
        `description: ${yamlScalar(description)}`,
        tools ? `tools: ${yamlScalar(tools)}` : null,
        spec.model ? `model: ${yamlScalar(spec.model)}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      content = `---\n${fm}\n---\n\n${body}\n`;
    }
    return {
      target: "claude-agents" as const,
      path: `.claude/agents/${slug}.md`,
      content,
      risk: pieceRisk(content),
      strategy: "whole-file" as const,
    };
  });
}
