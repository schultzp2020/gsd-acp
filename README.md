# gsd-acp

ACP ([Agent Client Protocol](https://agentclientprotocol.com/overview/introduction)) adapter for [`gsd`](https://github.com/nicobailon/gsd-mono/tree/main/packages/coding-agent) coding agent (fka shitty coding agent).

`gsd-acp` communicates **ACP JSON-RPC 2.0 over stdio** to an ACP client (e.g. Zed editor) and spawns `gsd --mode rpc`, bridging requests/events between the two.

## Status

This is an MVP-style adapter intended to be useful today and easy to iterate on. Some ACP features may be not implemented or are not supported (see [Limitations](#limitations)). Development is centered around [Zed](https://zed.dev) editor support, other clients may have varying levels of compatibility.

Expect some minor breaking changes.

## Features

- Streams assistant output as ACP `agent_message_chunk`
- Maps gsd tool execution to ACP `tool_call` / `tool_call_update`
  - Tool call locations are surfaced when available for ACP clients that support opening the referenced file/context
  - Relative file paths from gsd are resolved against the session cwd before being emitted as ACP tool locations, which enables follow-along features in clients like Zed
  - For `edit`, `gsd-acp` attempts to infer a 1-based line number from a unique `oldText` match in the pre-edit file snapshot and includes it in the emitted tool location when possible
  - For `edit`, `gsd-acp` snapshots the file before the tool runs and emits an ACP **structured diff** (`oldText`/`newText`) on completion when possible
- Session persistence
  - gsd stores its own sessions in `~/.gsd/agent/sessions/...`
  - `gsd-acp` stores a small mapping file at `~/.gsd/gsd-acp/session-map.json` so `session/load` can reattach to a previous gsd session file
- Slash commands
  - Loads file-based slash commands compatible with gsd's conventions
  - Adds a small set of built-in commands for headless/editor usage
  - Supports skill commands (if enabled in gsd settings, they appear as `/skill:skill-name` in the ACP client)
- Skills are loaded by gsd directly and are available in ACP sessions
- (Zed) `gsd-acp` emits "startup info" block into the session (gsd version, context, skills, prompts, extensions - similar to `gsd` in the terminal). You can disable it by setting `quietStartup: true` in gsd settings (`~/.gsd/agent/settings.json` or `<project>/.gsd/settings.json`). When `quietStartup` is enabled, `gsd-acp` will still emit a 'New version available' message if the installed gsd version is outdated.
- (Zed) Session history is supported in Zed starting with [`v0.225.0`](https://zed.dev/releases/preview/0.225.0). Session loading / history maps to gsd's session files. Sessions can be resumed both in `gsd` and in the ACP client.

## Prerequisites

Make sure gsd is installed

```bash
npm install -g gsd-pi
```

- Node.js 22+
- `gsd` installed and available on your `PATH` (the adapter runs the `gsd` executable)
- Configure `gsd` separately for your model providers/API keys

## Install

### Add gsd-acp to your ACP client, e.g. [Zed](https://zed.dev/docs/agents/external-agents/)

#### Using ACP Registry in Zed or other clients that support it:

In Zed launch the registry with `zed: acp registry` command and select `gsd ACP` adapter from the list. This will automatically add the agent server configuration to your `settings.json` and keep it up to date:

```json
  "agent_servers": {
    "gsd-acp": {
      "type": "registry",
    },
  }
```

#### Using with `npx` (no global install needed, always loads the latest version):

Add the following to your Zed `settings.json`:

```json
  "agent_servers": {
    "gsd": {
      "type": "custom",
      "command": "npx",
      "args": ["-y", "gsd-acp"],
      "env": {}
    }
  }
```

#### Global install

```bash
npm install -g gsd-acp
```

```json
  "agent_servers": {
    "gsd": {
      "type": "custom",
      "command": "gsd-acp",
      "args": [],
      "env": {}
    }
  }
```

#### From source

```bash
npm install
npm run build
```

Point your ACP client to the built `dist/index.js`:

```json
  "agent_servers": {
    "gsd": {
      "type": "custom",
      "command": "node",
      "args": ["/path/to/gsd-acp/dist/index.js"],
      "env": {}
    }
  }
```

### Environment variables

- `GSD_ACP_ENABLE_EMBEDDED_CONTEXT=true` advertises ACP `promptCapabilities.embeddedContext` support to the client.
- Default: unset/any other value means `false`.
- When disabled, compliant ACP clients should avoid sending embedded `resource` blocks. If they send them anyway, `gsd-acp` still degrades gracefully by converting them into plain-text prompt context.

You can add the environment variable in the Zed settings with:

```json
  "agent_servers": {
    "gsd": {
      "type": "custom",
      "command": "node",
      "args": ["/path/to/gsd-acp/dist/index.js"],
      "env": {
          "GSD_ACP_ENABLE_EMBEDDED_CONTEXT": "true",
      }
    }
  }
```

### Slash commands

`gsd-acp` supports slash commands:

#### 1) File-based commands (aka prompts)

Loaded from:

- User commands: `~/.gsd/agent/prompts/**/*.md`
- Project commands: `<cwd>/.gsd/prompts/**/*.md`

#### 2) Built-in commands

- `/compact [instructions...]` – run gsd compaction (optionally with custom instructions)
- `/autocompact on|off|toggle` – toggle automatic compaction
- `/export` – export the current session to HTML in the session `cwd`
- `/session` – show session stats (tokens/messages/cost/session file)
- `/name <name>` – set session display name
- `/queue all|one-at-a-time` – set gsd queue mode (unstable feature)
- `/changelog` – print the installed gsd changelog (best-effort)
- `/steering` - maps to `gsd` Steering Mode, get/set
- `/follow-up` - pats to `gsd` Follow-up Mode, get/set

Other built-in commands:

- `/model` - maps to model selector in Zed
- `/thinking` - maps to 'mode' selector in Zed
- `/clear` - not implemented (use ACP client 'new' command)

#### 3) Skill commands

- Skill commands can be enabled in gsd settings and will appear in the slash command list in ACP client as `/skill:skill-name`.

**Note**: Slash commands provided by gsd extensions are not currently supported.

## Authentication (ACP Registry support)

This agent supports **Terminal Auth** for the [ACP Registry](https://agentclientprotocol.com/get-started/registry).
In Zed, this will show an **Authenticate** banner that launches gsd in a terminal.
Launch gsd in a terminal for interactive login/setup:

```bash
gsd-acp --terminal-login
```

Your ACP client can also invoke this automatically based on the agent's advertised `authMethods`.

## Development

```bash
npm install
npm run dev        # run from src via tsx
npm run build
npm run lint
npm run test
```

Project layout:

- `src/acp/*` – ACP server + translation layer
- `src/gsd-rpc/*` – gsd subprocess wrapper (RPC protocol)

## Limitations

- No ACP filesystem delegation (`fs/*`) and no ACP terminal delegation (`terminal/*`). gsd reads/writes and executes locally.
- MCP servers are accepted in ACP params and stored in session state, but not wired through to gsd (see [why](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/)). If you use [gsd MCP adapter](https://github.com/nicobailon/gsd-mcp-adapter) it will be available in the ACP client.
- Assistant streaming is currently sent as `agent_message_chunk` (no separate thought stream).
- Queue is implemented client-side and should work like gsd's `one-at-a-time`
- ~~ACP clients don't yet suport session history, but ACP sessions from `gsd-acp` can be `/resume`d in gsd directly~~

## License

MIT (see [LICENSE](LICENSE)).
