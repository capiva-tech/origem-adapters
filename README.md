# origem-adapters

**Traduz um Brain do Origem para a config nativa de cada IA e aplica no seu repo com merge seguro.** Recebe o export do Brain (o que `GET /pull?format=json` devolve) e gera os arquivos que cada ferramenta lê — depois grava no disco preservando o que é seu.

Repositório **independente** (não-monorepo), ESM, TypeScript. A lib não tem dependências de runtime.

## CLI: `origem-apply`

Materializa seu Brain nos arquivos de config do projeto atual.

```bash
# leitura via token (link "Conectar com IA" no app Origem)
ORIGEM_TOKEN=org_live_... npx origem-apply --dry-run
ORIGEM_TOKEN=org_live_... npx origem-apply --targets claude
```

| Opção | Efeito |
|-------|--------|
| `--token <t>` | Token de leitura (ou env `ORIGEM_TOKEN`). |
| `--api <url>` | Base da API (ou env `ORIGEM_API_URL`). Default: produção. |
| `--out <dir>` | Diretório destino. Default: diretório atual. |
| `--targets <alvos>` | Preset (`all`\|`claude`\|`universal`) ou lista: `claude,cursor,mcp`. |
| `--dry-run` | Só mostra o plano (`＋` criar, `~` atualizar, `=` sem mudança). |
| `--allow-privileged` | Grava também os arquivos privilegiados (veja abaixo). |

**Segurança — arquivos privilegiados.** `.claude/settings.json` (hooks executam shell, `env` pode ter segredos) e `.mcp.json` com servidores `command` (processos spawnados na sua máquina) são **pulados por padrão**. Revise com `--dry-run` e libere conscientemente com `--allow-privileged`.

## Alvos suportados

| Alvo | Gera | Estratégia |
|------|------|-----------|
| `agents` | `AGENTS.md` (canônico: Codex, Cursor, Copilot, Gemini, Windsurf…) | managed-block |
| `claude` | `CLAUDE.md` | managed-block |
| `gemini` | `GEMINI.md` | managed-block |
| `copilot` | `.github/copilot-instructions.md` | managed-block |
| `cursor` | `.cursor/rules/<slug>.mdc` (um por regra, frontmatter MDC) | whole-file |
| `mcp` | `.mcp.json` (junta cards `mcp` em `mcpServers`) | merge-json |
| `claude-settings` | `.claude/settings.json` (cards `harness`) | merge-json |
| `claude-skills` | `.claude/skills/<slug>/SKILL.md` (cards `skill`) | whole-file |
| `claude-commands` | `.claude/commands/<slug>.md` (cards `prompt`) | whole-file |
| `claude-agents` | `.claude/agents/<slug>.md` (cards `agent`) | whole-file |

Presets: `claude` = todas as superfícies do Claude Code; `universal` = só `AGENTS.md`; `all` = tudo.

## Estratégias de escrita

- **managed-block** — injeta entre marcadores `<!-- ORIGEM:START/END -->` e **preserva** o resto do arquivo (suas anotações no CLAUDE.md/AGENTS.md sobrevivem). Idempotente.
- **merge-json** — deep-merge no JSON existente: objetos recursivos, arrays concatenados+dedup, escalar do Origem vence. Mantém suas chaves.
- **whole-file** — arquivos dos quais o Origem é dono; sobrescreve.

## Uso como biblioteca

```ts
import { adapt, plan } from "origem-adapters";
import { fetchBrain } from "origem-adapters";

const brain = await fetchBrain({ token: process.env.ORIGEM_TOKEN! });
const files = adapt(brain, ["claude", "cursor"]);   // OutputFile[] { target, path, content, risk, strategy }

// engine puro (sem IO) — você fornece o leitor de disco:
const planned = plan(files, (p) => readFileMaybe(p));  // PlannedFile[] { action, content, risk, ... }
```

## Build e teste

```bash
npm install
npm test     # build + testes do adapt() e do engine de aplicação
```

## Roadmap

- `.mdc` do Cursor com `globs`/`alwaysApply` derivados das tags do card.
- Novos alvos: Amazon Q (`.amazonq/rules`), Windsurf (`.windsurf/rules`), Kiro (`.kiro/steering`), Warp.
- Assinatura HMAC do payload verificada antes de aplicar.
