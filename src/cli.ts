#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { adapt, ALL_TARGETS, CLAUDE_TARGETS, TargetId } from "./index.js";
import { plan, PlannedFile } from "./apply.js";
import { fetchBrain } from "./fetch-brain.js";

/**
 * origem-apply — materializa um Brain do Origem nos arquivos de config nativos
 * (CLAUDE.md, AGENTS.md, .cursor/rules, .mcp.json, .claude/*). O INVERSO da ingestão.
 */

const PRESETS: Record<string, TargetId[]> = {
  all: ALL_TARGETS,
  claude: CLAUDE_TARGETS,
  universal: ["agents"],
};

interface Args {
  token?: string;
  api?: string;
  out: string;
  targets: TargetId[];
  dryRun: boolean;
  allowPrivileged: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    token: process.env.ORIGEM_TOKEN,
    api: process.env.ORIGEM_API_URL,
    out: process.cwd(),
    targets: ALL_TARGETS,
    dryRun: false,
    allowPrivileged: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "--token": a.token = next(); break;
      case "--api": a.api = next(); break;
      case "--out": a.out = resolve(next() ?? "."); break;
      case "--targets": {
        const v = (next() ?? "").trim();
        a.targets = PRESETS[v] ?? (v.split(",").map((s) => s.trim()).filter(Boolean) as TargetId[]);
        break;
      }
      case "--dry-run": a.dryRun = true; break;
      case "--allow-privileged": a.allowPrivileged = true; break;
      case "-h":
      case "--help": a.help = true; break;
    }
  }
  return a;
}

const HELP = `origem-apply — aplica seu Brain do Origem nos arquivos de config da IA.

Uso:
  ORIGEM_TOKEN=org_live_... origem-apply [opções]

Opções:
  --token <t>            Token de leitura (ou env ORIGEM_TOKEN).
  --api <url>            Base da API (ou env ORIGEM_API_URL). Default: prod.
  --out <dir>            Diretório destino. Default: diretório atual.
  --targets <alvos>      Preset (all|claude|universal) ou lista: claude,cursor,mcp.
  --dry-run              Só mostra o plano, não grava nada.
  --allow-privileged     Grava também arquivos privilegiados (settings.json, MCP stdio).
  -h, --help             Esta ajuda.

Segurança: arquivos que EXECUTAM algo na máquina (hooks, env com segredos, MCP com
'command') são PULADOS por padrão. Revise com --dry-run e libere com --allow-privileged.`;

const SYMBOL: Record<PlannedFile["action"], string> = {
  create: "＋",
  update: "~",
  unchanged: "=",
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }
  if (!args.token) {
    console.error("Erro: token ausente. Passe --token ou defina ORIGEM_TOKEN.\n");
    console.error(HELP);
    process.exit(1);
  }

  const brain = await fetchBrain({ token: args.token, apiUrl: args.api });
  console.error(`Brain: ${brain.brain.name} · ${brain.cards.length} entrada(s)`);

  const files = adapt(brain, args.targets);
  if (files.length === 0) {
    console.error("Nada a gerar para os alvos escolhidos.");
    return;
  }

  const read = (rel: string): string | null => {
    try {
      return readFileSync(join(args.out, rel), "utf8");
    } catch {
      return null;
    }
  };

  const planned = plan(files, read);
  let written = 0;
  let skipped = 0;
  let unchanged = 0;

  for (const f of planned) {
    const priv = f.risk === "privileged";
    const blocked = priv && !args.allowPrivileged;

    if (f.action === "unchanged") {
      unchanged++;
      console.log(`  ${SYMBOL.unchanged} ${f.path} (sem mudança)`);
      continue;
    }
    if (blocked) {
      skipped++;
      console.log(`  ⚠ ${f.path} — PRIVILEGIADO, pulado (use --allow-privileged)`);
      continue;
    }
    const tag = priv ? " [privilegiado]" : "";
    console.log(`  ${SYMBOL[f.action]} ${f.path}${tag}${args.dryRun ? " (dry-run)" : ""}`);
    if (!args.dryRun) {
      const abs = join(args.out, f.path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, f.content, "utf8");
      written++;
    }
  }

  console.error(
    args.dryRun
      ? `\nDry-run: ${planned.length} arquivo(s) no plano, ${skipped} privilegiado(s) pulado(s).`
      : `\nPronto: ${written} gravado(s), ${unchanged} sem mudança, ${skipped} pulado(s).`
  );
  if (skipped > 0 && !args.allowPrivileged) {
    console.error("Revise os privilegiados com --dry-run e libere com --allow-privileged.");
  }
}

main().catch((err) => {
  console.error("Falha no origem-apply:", (err as Error).message);
  process.exit(1);
});
