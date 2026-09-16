// Testes do adapt() + engine de aplicação (puro, sem rede).
import assert from "node:assert";
import {
  adapt,
  ALL_TARGETS,
  plan,
  planFile,
  injectManagedBlock,
  deepMerge,
  BLOCK_START,
  BLOCK_END,
} from "../dist/index.js";

let passed = 0;
const ok = (name) => { console.log("  \x1b[32m✓\x1b[0m " + name); passed++; };

const brain = {
  brain: { name: "Meu Brain", description: "teste" },
  cards: [
    { type: "instruction", title: "Persona", content: "Responda em PT-BR." },
    { type: "rule", title: "Convenções", content: "- Sem emojis", folder: "Regras" },
    { type: "skill", title: "Deploy", content: "Passos de deploy." },
    { type: "prompt", title: "Revisar PR", content: "Revise o PR atual." },
    {
      type: "harness",
      title: "settings",
      content: JSON.stringify({ model: "claude-opus-4-8", permissions: { allow: ["Bash(npm run *)"] } }),
    },
    {
      type: "mcp",
      title: "postgres",
      content: JSON.stringify({ command: "npx", args: ["-y", "pg-mcp"] }),
    },
  ],
};

// 1. adapt(all) gera os alvos esperados
const files = adapt(brain);
const byPath = Object.fromEntries(files.map((f) => [f.path, f]));
assert.equal(ALL_TARGETS.length, 10, "10 alvos suportados");
assert.ok(byPath["CLAUDE.md"], "gera CLAUDE.md");
assert.ok(byPath["AGENTS.md"], "gera AGENTS.md");
assert.ok(byPath["GEMINI.md"], "gera GEMINI.md");
assert.ok(byPath[".github/copilot-instructions.md"], "gera copilot");
assert.ok(byPath[".cursor/rules/convencoes.mdc"], "gera regra do cursor");
assert.ok(byPath[".claude/skills/deploy/SKILL.md"], "gera skill");
assert.ok(byPath[".claude/commands/revisar-pr.md"], "gera command");
assert.ok(byPath[".mcp.json"], "gera .mcp.json");
assert.ok(byPath[".claude/settings.json"], "gera settings.json");
ok("adapt() gera todos os alvos");

// AGENTS.md tem instrução mas NÃO vaza MCP (config de máquina)
assert.ok(byPath["AGENTS.md"].content.includes("Persona"));
assert.ok(!byPath["AGENTS.md"].content.includes("pg-mcp"), "AGENTS.md não vaza MCP");
ok("markdown genérico traz texto e não vaza config de máquina");

// 2. risco: settings.json e MCP stdio são privilegiados; markdown é safe
assert.equal(byPath[".claude/settings.json"].risk, "privileged");
assert.equal(byPath[".mcp.json"].risk, "privileged", "MCP com command = privilegiado");
assert.equal(byPath["CLAUDE.md"].risk, "safe");
ok("risco privilegiado marcado corretamente");

// 3. managed-block: cria do zero e preserva conteúdo do usuário
const fresh = injectManagedBlock(null, "corpo gerado");
assert.ok(fresh.includes(BLOCK_START) && fresh.includes(BLOCK_END));
const userDoc = "# Meu arquivo\n\nAnotações minhas que devem sobreviver.\n";
const merged = injectManagedBlock(userDoc, "corpo gerado");
assert.ok(merged.includes("Anotações minhas que devem sobreviver."), "preserva texto do usuário");
assert.ok(merged.includes("corpo gerado"));
const reMerged = injectManagedBlock(merged, "corpo NOVO");
assert.ok(reMerged.includes("corpo NOVO"));
assert.ok(!reMerged.includes("corpo gerado"), "bloco antigo substituído");
assert.equal(reMerged.split(BLOCK_START).length - 1, 1, "um único bloco (sem duplicar)");
assert.ok(reMerged.includes("Anotações minhas"), "usuário preservado após re-aplicar");
ok("managed-block cria, preserva e atualiza sem duplicar");

// 4. merge-json: deep-merge preserva chaves do usuário e dedup de arrays
const disk = JSON.stringify({ permissions: { allow: ["Bash(ls)"] }, minhaChave: 1 }, null, 2);
const planned = planFile(byPath[".claude/settings.json"], disk);
const result = JSON.parse(planned.content);
assert.equal(result.minhaChave, 1, "chave do usuário preservada");
assert.deepEqual(
  result.permissions.allow.slice().sort(),
  ["Bash(ls)", "Bash(npm run *)"].sort(),
  "arrays concatenados+dedup"
);
assert.equal(result.model, "claude-opus-4-8", "chave do Origem aplicada");
ok("merge-json faz deep-merge preservando o disco");

// 5. deepMerge dedup direto
const dm = deepMerge({ a: [1, 2] }, { a: [2, 3], b: "x" });
assert.deepEqual(dm.a.slice().sort(), [1, 2, 3]);
assert.equal(dm.b, "x");
ok("deepMerge concatena+deduplica arrays");

// 6. plan(): action correta (create/update/unchanged)
const p = plan(files, (path) => (path === "CLAUDE.md" ? null : "x"));
const claudePlan = p.find((f) => f.path === "CLAUDE.md");
assert.equal(claudePlan.action, "create", "arquivo inexistente = create");
const p2 = planFile(byPath["CLAUDE.md"], claudePlan.content);
assert.equal(p2.action, "unchanged", "reaplicar conteúdo idêntico = unchanged");
ok("plan() calcula create/update/unchanged");

// 7. targets seletivos
const only = adapt(brain, ["agents"]);
assert.ok(only.length === 1 && only[0].path === "AGENTS.md", "adapt(brain, ['agents']) só AGENTS.md");
ok("targets seletivos");

console.log(`\n\x1b[32m✓ ADAPTERS + APPLY OK — ${passed} grupos de asserção\x1b[0m`);
