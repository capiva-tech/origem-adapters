// e2e: peças que executam ou ampliam permissões só são gravadas com confirmação.
// Harness real na API; o `origem-apply` construído (dist/cli.js) materializa num
// diretório temporário, sem e com --allow-privileged.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { adminSession, API_URL, assert, createHarness, createToken, run } from "./origem-client.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PIECES = [
  { type: "skill", title: "notes-helper", content: "---\nname: notes-helper\ndescription: Use when the user asks to tidy notes.\n---\n\nTidy the notes.\n" },
  { type: "skill", title: "shell-skill", content: "---\nname: shell-skill\ndescription: Use when asked for status.\nallowed-tools: Bash\n---\n\nReport status.\n" },
  { type: "skill", title: "inline-cmd", content: "---\nname: inline-cmd\ndescription: Use when asked for the branch.\n---\n\n!`git status`\n" },
  { type: "agent", title: "wide-agent", content: "---\nname: wide-agent\ndescription: Edits files.\npermissionMode: acceptEdits\n---\n\nEdit.\n" },
  { type: "agent", title: "reviewer", content: "---\nname: reviewer\ndescription: Reviews diffs.\ntools: Read, Grep\n---\n\nReview.\n" },
  { type: "prompt", title: "standup", content: "Summarise yesterday's changes." },
];
const SAFE = [".claude/skills/notes-helper/SKILL.md", ".claude/agents/reviewer.md", ".claude/commands/standup.md"];
const PRIV = [".claude/skills/shell-skill/SKILL.md", ".claude/skills/inline-cmd/SKILL.md", ".claude/agents/wide-agent.md"];

function apply(key, out, extra = []) {
  const r = spawnSync(process.execPath, [join(REPO, "dist", "cli.js"), "--token", key, "--api", API_URL, "--out", out,
    "--targets", "claude-skills,claude-agents,claude-commands", ...extra], { encoding: "utf8", windowsHide: true });
  return `${r.stdout}${r.stderr}`;
}

await run([[
  "peças com recurso executável exigem --allow-privileged; as comuns seguem",
  async () => {
    const s = await adminSession();
    const h = await createHarness(s, "e2e adapters privileged", PIECES);
    try {
      const key = await createToken(s, h.brainId);
      const plain = mkdtempSync(join(tmpdir(), "origem-apply-"));
      const out1 = apply(key, plain);
      for (const f of SAFE) assert(existsSync(join(plain, f)), `peça comum não gravada: ${f}\n${out1}`);
      for (const f of PRIV) assert(!existsSync(join(plain, f)), `peça privilegiada gravada sem confirmação: ${f}`);
      assert(/PRIVILEGIADO/.test(out1), "o apply não avisou quais foram pulados");

      const allowed = mkdtempSync(join(tmpdir(), "origem-apply-"));
      apply(key, allowed, ["--allow-privileged"]);
      for (const f of [...SAFE, ...PRIV]) assert(existsSync(join(allowed, f)), `com --allow-privileged faltou ${f}`);
    } finally {
      await h.cleanup();
    }
  },
]]);
