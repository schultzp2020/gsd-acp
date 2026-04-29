# gsd-acp (ACP adapter for gsd)

This repository implements an **Agent Client Protocol (ACP)** adapter for **gsd** without modifying gsd.

- ACP side: **JSON-RPC 2.0 over stdio** using `@agentclientprotocol/sdk` (TypeScript)
- Gsd side: spawn `gsd --mode rpc` and communicate via **newline-delimited JSON** over stdio

## Architecture (MVP)

### 1 ACP session ↔ 1 gsd subprocess

Gsd RPC mode is effectively single-session, so the adapter maps:

- `session/new` → spawn a dedicated `gsd --mode rpc` process, attempt v2 init handshake (5s timeout, v1 fallback)
- `session/prompt` → route to `steer` (streaming), `follow_up` (idle with history), or `prompt` (first message) based on agent state
- `session/cancel` → send `{type:"abort"}`

### V2 Protocol

On spawn, the adapter sends `{type:"init", protocolVersion:2}`. If the subprocess responds within 5s:
- Protocol version locks to 2
- Subscribes to all events (`{type:"subscribe", events:["*"]}`)
- Uses `execution_complete` for turn completion (replaces `agent_end`)
- Forwards `cost_update` events as ACP `session_info_update` metadata
- Uses `shutdown` for clean teardown

If init fails or times out, the adapter falls back to v1 silently.

### ACP server wiring (modeled after opencode)

Use `@agentclientprotocol/sdk`:

- `ndJsonStream(input, output)` to speak ACP over stdio
- `new AgentSideConnection((conn) => new GsdAcpAgent(conn, config), stream)`

## Implementation constraints / decisions

- Do **not** implement ACP client-side FS/terminal delegation. Gsd already reads/writes and executes locally.
- Ignore `mcpServers` (accept in params, store in session state).
- Stream all gsd assistant output as ACP `agent_message_chunk`.
- Tool events: map gsd tool execution events to ACP `tool_call` / `tool_call_update` (as text content).
- Extension UI requests (select, confirm, input, editor) are auto-cancelled; notifications logged to stderr; status/widget/title silently acknowledged.
- V2 protocol is primary, v1 is fallback (not vice versa). All request timeouts are 30s.

## Dev workflow (to be filled once scaffold exists)

- Install deps: `npm install`
- Run in dev: `npm run dev`
- Build: `npm run build`
- Smoke test (stdio): `npm run smoke`
- Lint: `npm run lint`
- Test: `npm run test`

## Manual testing notes

Once the adapter runs, it should behave like an ACP agent on stdio.

Quick sanity test (example):

```bashN
# Send initialize request via stdin (exact fields depend on ACP SDK version)
# echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1}}' | node dist/index.js
```

For real validation, test with an ACP client (e.g. Zed external agent).

## Coding guidelines

- Keep ACP protocol handling in `src/acp/*`.
- Keep gsd RPC subprocess logic in `src/gsd-rpc/*`.
- Prefer small translation functions (gsd event → ACP session/update) with unit tests.
- Be strict about streaming and process cleanup (handle exit, drain stdout/stderr, timeouts).
- Avoid producing unnecessary comments! Use comments sparingly to explain non-obvious decisions, not to narrate code.
- Avoid using `any` in TypeScript; prefer explicit types and interfaces. Only use `any` when absolutely necessary (e.g. for untyped external data).

## Source control

- **DO NOT** commit unless explicitly asked!

## Client information

- Current ACP client is Zed

## References

- Local ACP repo with protocol documentation and specs: `~/Dev/learning/agent-client-protocol`
- Local Zed repo `~/Dev/learning/zed/zed`
