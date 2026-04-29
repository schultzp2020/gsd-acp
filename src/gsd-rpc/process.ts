import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import * as readline from 'node:readline'
import { getGsdCommand, shouldUseShellForGsdCommand } from './command.js'

export class GsdRpcSpawnError extends Error {
  /** Underlying spawn error code, e.g. ENOENT, EACCES */
  code?: string

  constructor(message: string, opts?: { code?: string; cause?: unknown }) {
    super(message)
    this.name = 'GsdRpcSpawnError'
    this.code = opts?.code
    ;(this as any).cause = opts?.cause
  }
}

const ESC = String.fromCharCode(0x1b)
const CSI = String.fromCharCode(0x9b)

const ANSI_ESCAPE_REGEX = new RegExp(
  `[${ESC}${CSI}][[\\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]`,
  'g'
)

function stripAnsi(s: string): string {
  // Basic ANSI escape stripping (colors, cursor movement, etc.)
  return s.replace(ANSI_ESCAPE_REGEX, '')
}

type GsdRpcCommand =
  | { type: 'prompt'; id?: string; message: string; images?: unknown[]; streamingBehavior?: 'steer' | 'followUp' }
  | { type: 'abort'; id?: string }
  | { type: 'get_state'; id?: string }
  // V2 protocol
  | { type: 'init'; id?: string; protocolVersion: 2; clientId?: string }
  | { type: 'subscribe'; id?: string; events: string[] }
  | { type: 'shutdown'; id?: string; graceful?: boolean }
  // Steer / follow-up
  | { type: 'steer'; id?: string; message: string }
  | { type: 'follow_up'; id?: string; message: string }
  // Model
  | { type: 'get_available_models'; id?: string }
  | { type: 'set_model'; id?: string; provider: string; modelId: string }
  // Thinking
  | { type: 'set_thinking_level'; id?: string; level: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' }
  // Modes
  | { type: 'set_follow_up_mode'; id?: string; mode: 'all' | 'one-at-a-time' }
  | { type: 'set_steering_mode'; id?: string; mode: 'all' | 'one-at-a-time' }
  // Compaction
  | { type: 'compact'; id?: string; customInstructions?: string }
  | { type: 'set_auto_compaction'; id?: string; enabled: boolean }
  // Session
  | { type: 'get_session_stats'; id?: string }
  | { type: 'set_session_name'; id?: string; name: string }
  | { type: 'export_html'; id?: string; outputPath?: string }
  | { type: 'switch_session'; id?: string; sessionPath: string }
  // Messages
  | { type: 'get_messages'; id?: string }
  // Commands
  | { type: 'get_commands'; id?: string }
  // Fork
  | { type: 'get_fork_messages'; id?: string }
  | { type: 'fork'; id?: string; entryId: string }
  // Auto-retry
  | { type: 'set_auto_retry'; id?: string; enabled: boolean }
  | { type: 'abort_retry'; id?: string }
  // New session / misc
  | { type: 'new_session'; id?: string; parentSession?: string }
  | { type: 'get_last_assistant_text'; id?: string }

type GsdRpcResponse = {
  type: 'response'
  id?: string
  command: string
  success: boolean
  data?: unknown
  error?: string
}

export type GsdRpcEvent = Record<string, unknown>

const REQUEST_TIMEOUT_MS = 30_000
const V2_INIT_TIMEOUT_MS = 5_000

type SpawnParams = {
  cwd: string
  /** Optional override for `gsd` executable name/path */
  gsdCommand?: string
  /** If set, gsd will persist the session to this exact file (via `--session <path>`). */
  sessionPath?: string
}

export class GsdRpcProcess {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<string, { resolve: (v: GsdRpcResponse) => void; reject: (e: unknown) => void }>()
  private eventHandlers: Array<(ev: GsdRpcEvent) => void> = []
  private readonly preludeLines: string[] = []

  protocolVersion: 1 | 2 = 1
  v2SessionId: string | null = null
  v2Capabilities: Record<string, unknown> | null = null

  private constructor(child: ChildProcessWithoutNullStreams) {
    this.child = child

    const rl = readline.createInterface({ input: child.stdout })
    rl.on('line', line => {
      if (!line.trim()) return
      let msg: any
      try {
        msg = JSON.parse(line)
      } catch {
        // gsd may emit a human-readable prelude on stdout before NDJSON starts.
        // Capture it so the ACP adapter can surface it on session start.
        const cleaned = stripAnsi(String(line)).trimEnd()
        if (cleaned) this.preludeLines.push(cleaned)
        return
      }

      if (msg?.type === 'response') {
        const id = typeof msg.id === 'string' ? msg.id : undefined
        if (id) {
          const pending = this.pending.get(id)
          if (pending) {
            this.pending.delete(id)
            pending.resolve(msg as GsdRpcResponse)
            return
          }
        }
      }

      for (const h of this.eventHandlers) h(msg as GsdRpcEvent)
    })

    child.on('exit', (code, signal) => {
      const err = new Error(`gsd process exited (code=${code}, signal=${signal})`)
      for (const [, p] of this.pending) p.reject(err)
      this.pending.clear()
    })

    child.on('error', err => {
      for (const [, p] of this.pending) p.reject(err)
      this.pending.clear()
    })
  }

  static async spawn(params: SpawnParams): Promise<GsdRpcProcess> {
    // On Windows, npm commonly creates gsd.cmd / gsd.bat launcher scripts.
    const cmd = getGsdCommand(params.gsdCommand)

    // Speed/robustness for ACP:
    // - themes are irrelevant in rpc mode and can be noisy/slow to load.
    // Keep extensions + prompt templates enabled because ACP users may rely on them
    // (e.g. MCP extensions, prompt templates for workflows).
    const args = ['--mode', 'rpc', '--no-themes']
    if (params.sessionPath) args.push('--session', params.sessionPath)

    const child = spawn(cmd, args, {
      cwd: params.cwd,
      stdio: 'pipe',
      env: process.env,
      shell: shouldUseShellForGsdCommand(cmd)
    })

    // Ensure spawn failures (e.g. ENOENT when gsd isn't installed) are surfaced as a
    // deterministic error instead of later EPIPE/internal-error noise.
    try {
      await new Promise<void>((resolve, reject) => {
        const onSpawn = () => {
          cleanup()
          resolve()
        }
        const onError = (err: any) => {
          cleanup()
          reject(err)
        }
        const cleanup = () => {
          child.off('spawn', onSpawn)
          child.off('error', onError)
        }

        child.once('spawn', onSpawn)
        child.once('error', onError)
      })
    } catch (e: any) {
      const code = typeof e?.code === 'string' ? e.code : undefined
      if (code === 'ENOENT') {
        throw new GsdRpcSpawnError(
          `Could not start gsd: executable not found (command: ${cmd}). gsd needs to be installed before it can run in ACP clients. Install it via \`npm install -g gsd\` or ensure \`gsd\` is on your PATH. Then try again.`,
          { code, cause: e }
        )
      }

      if (code === 'EACCES') {
        throw new GsdRpcSpawnError(`Could not start gsd: permission denied (command: ${cmd}).`, { code, cause: e })
      }

      throw new GsdRpcSpawnError(`Could not start gsd (command: ${cmd}).`, { code, cause: e })
    }

    child.stderr.on('data', () => {})

    const proc = new GsdRpcProcess(child)

    // V2 handshake: send init with protocolVersion:2, wait up to 5s.
    // On success, subscribe to all events. On failure, fall back to v1 (get_state probe).
    try {
      const initRes = await proc.requestWithTimeout(
        { type: 'init', protocolVersion: 2 },
        V2_INIT_TIMEOUT_MS
      )

      if (initRes.success) {
        proc.protocolVersion = 2
        const data = initRes.data as Record<string, unknown> | undefined
        proc.v2SessionId = typeof data?.sessionId === 'string' ? data.sessionId : null
        proc.v2Capabilities = (data?.capabilities as Record<string, unknown>) ?? null

        try {
          await proc.request({ type: 'subscribe', events: ['*'] })
        } catch {
          // Non-fatal: we can still function without subscription confirmation.
        }
      } else {
        throw new Error(initRes.error ?? 'init rejected')
      }
    } catch {
      // V1 fallback.
      proc.protocolVersion = 1
      process.stderr.write(
        '[gsd-acp] v2 init unavailable, falling back to v1. Run tracking and cost updates will be limited.\n'
      )

      try {
        const state = (await proc.getState()) as any
        const sessionFile = typeof state?.sessionFile === 'string' ? state.sessionFile : null
        if (sessionFile) {
          const { mkdirSync } = await import('node:fs')
          const { dirname } = await import('node:path')
          mkdirSync(dirname(sessionFile), { recursive: true })
        }
      } catch {
        // ignore
      }
    }

    return proc
  }

  onEvent(handler: (ev: GsdRpcEvent) => void): () => void {
    this.eventHandlers.push(handler)
    return () => {
      this.eventHandlers = this.eventHandlers.filter(h => h !== handler)
    }
  }

  dispose(signal: NodeJS.Signals | number = 'SIGTERM'): void {
    if (this.child.killed) return
    try {
      this.child.kill(signal as any)
    } catch {
      // ignore
    }
  }

  /**
   * Human-readable stdout lines emitted before RPC NDJSON begins (e.g. Context/Skills/Extensions info).
   * Themes are typically noisy/less useful for ACP, so callers can filter as needed.
   */
  consumePreludeLines(): string[] {
    const lines = this.preludeLines.splice(0, this.preludeLines.length)
    return lines
  }

  async prompt(message: string, images: unknown[] = []): Promise<void> {
    const res = await this.request({ type: 'prompt', message, images })
    if (!res.success) throw new Error(`gsd prompt failed: ${res.error ?? JSON.stringify(res.data)}`)
  }

  async abort(): Promise<void> {
    const res = await this.request({ type: 'abort' })
    if (!res.success) throw new Error(`gsd abort failed: ${res.error ?? JSON.stringify(res.data)}`)
  }

  async getState(): Promise<unknown> {
    const res = await this.request({ type: 'get_state' })
    if (!res.success) throw new Error(`gsd get_state failed: ${res.error ?? JSON.stringify(res.data)}`)
    return res.data
  }

  async getAvailableModels(): Promise<unknown> {
    const res = await this.request({ type: 'get_available_models' })
    if (!res.success) throw new Error(`gsd get_available_models failed: ${res.error ?? JSON.stringify(res.data)}`)
    return res.data
  }

  async setModel(provider: string, modelId: string): Promise<unknown> {
    const res = await this.request({ type: 'set_model', provider, modelId })
    if (!res.success) throw new Error(`gsd set_model failed: ${res.error ?? JSON.stringify(res.data)}`)
    return res.data
  }

  async setThinkingLevel(level: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'): Promise<void> {
    const res = await this.request({ type: 'set_thinking_level', level })
    if (!res.success) throw new Error(`gsd set_thinking_level failed: ${res.error ?? JSON.stringify(res.data)}`)
  }

  async setFollowUpMode(mode: 'all' | 'one-at-a-time'): Promise<void> {
    const res = await this.request({ type: 'set_follow_up_mode', mode })
    if (!res.success) throw new Error(`gsd set_follow_up_mode failed: ${res.error ?? JSON.stringify(res.data)}`)
  }

  async setSteeringMode(mode: 'all' | 'one-at-a-time'): Promise<void> {
    const res = await this.request({ type: 'set_steering_mode', mode })
    if (!res.success) throw new Error(`gsd set_steering_mode failed: ${res.error ?? JSON.stringify(res.data)}`)
  }

  async compact(customInstructions?: string): Promise<unknown> {
    const res = await this.request({ type: 'compact', customInstructions })
    if (!res.success) throw new Error(`gsd compact failed: ${res.error ?? JSON.stringify(res.data)}`)
    return res.data
  }

  async setAutoCompaction(enabled: boolean): Promise<void> {
    const res = await this.request({ type: 'set_auto_compaction', enabled })
    if (!res.success) throw new Error(`gsd set_auto_compaction failed: ${res.error ?? JSON.stringify(res.data)}`)
  }

  async getSessionStats(): Promise<unknown> {
    const res = await this.request({ type: 'get_session_stats' })
    if (!res.success) throw new Error(`gsd get_session_stats failed: ${res.error ?? JSON.stringify(res.data)}`)
    return res.data
  }

  async setSessionName(name: string): Promise<void> {
    const res = await this.request({ type: 'set_session_name', name })
    if (!res.success) throw new Error(`gsd set_session_name failed: ${res.error ?? JSON.stringify(res.data)}`)
  }

  async exportHtml(outputPath?: string): Promise<{ path: string }> {
    const res = await this.request({ type: 'export_html', outputPath })
    if (!res.success) throw new Error(`gsd export_html failed: ${res.error ?? JSON.stringify(res.data)}`)
    const data: any = res.data
    return { path: String(data?.path ?? '') }
  }

  async switchSession(sessionPath: string): Promise<void> {
    const res = await this.request({ type: 'switch_session', sessionPath })
    if (!res.success) throw new Error(`gsd switch_session failed: ${res.error ?? JSON.stringify(res.data)}`)
  }

  async getMessages(): Promise<unknown> {
    const res = await this.request({ type: 'get_messages' })
    if (!res.success) throw new Error(`gsd get_messages failed: ${res.error ?? JSON.stringify(res.data)}`)
    return res.data
  }

  async getCommands(): Promise<unknown> {
    const res = await this.request({ type: 'get_commands' })
    if (!res.success) throw new Error(`gsd get_commands failed: ${res.error ?? JSON.stringify(res.data)}`)
    return res.data
  }

  writeRaw(data: string): void {
    try {
      this.child.stdin.write(data)
    } catch {
      // ignore
    }
  }

  async subscribe(events: string[]): Promise<void> {
    if (this.protocolVersion < 2) return
    const res = await this.request({ type: 'subscribe', events })
    if (!res.success) throw new Error(`gsd subscribe failed: ${res.error ?? JSON.stringify(res.data)}`)
  }

  async shutdown(graceful?: boolean): Promise<void> {
    if (this.protocolVersion >= 2) {
      try {
        await this.request({ type: 'shutdown', graceful })
      } catch {
        // Fall through to SIGTERM if shutdown command fails.
      }
      return
    }
    this.dispose()
  }

  async steer(message: string): Promise<void> {
    const res = await this.request({ type: 'steer', message })
    if (!res.success) throw new Error(`gsd steer failed: ${res.error ?? JSON.stringify(res.data)}`)
  }

  async followUp(message: string): Promise<void> {
    const res = await this.request({ type: 'follow_up', message })
    if (!res.success) throw new Error(`gsd follow_up failed: ${res.error ?? JSON.stringify(res.data)}`)
  }

  async getForkMessages(): Promise<{ messages: Array<{ entryId: string; text: string }> }> {
    const res = await this.request({ type: 'get_fork_messages' })
    if (!res.success) throw new Error(`gsd get_fork_messages failed: ${res.error ?? JSON.stringify(res.data)}`)
    const data = res.data as { messages?: Array<{ entryId: string; text: string }> } | undefined
    return { messages: Array.isArray(data?.messages) ? data.messages : [] }
  }

  async fork(entryId: string): Promise<{ text: string; cancelled: boolean }> {
    const res = await this.request({ type: 'fork', entryId })
    if (!res.success) throw new Error(`gsd fork failed: ${res.error ?? JSON.stringify(res.data)}`)
    const data = res.data as { text?: string; cancelled?: boolean } | undefined
    return { text: String(data?.text ?? ''), cancelled: Boolean(data?.cancelled) }
  }

  async setAutoRetry(enabled: boolean): Promise<void> {
    const res = await this.request({ type: 'set_auto_retry', enabled })
    if (!res.success) throw new Error(`gsd set_auto_retry failed: ${res.error ?? JSON.stringify(res.data)}`)
  }

  async abortRetry(): Promise<void> {
    const res = await this.request({ type: 'abort_retry' })
    if (!res.success) throw new Error(`gsd abort_retry failed: ${res.error ?? JSON.stringify(res.data)}`)
  }

  async newSession(parentSession?: string): Promise<unknown> {
    const res = await this.request({ type: 'new_session', parentSession })
    if (!res.success) throw new Error(`gsd new_session failed: ${res.error ?? JSON.stringify(res.data)}`)
    return res.data
  }

  async getLastAssistantText(): Promise<string | null> {
    const res = await this.request({ type: 'get_last_assistant_text' })
    if (!res.success) throw new Error(`gsd get_last_assistant_text failed: ${res.error ?? JSON.stringify(res.data)}`)
    const data = res.data as { text?: string | null } | undefined
    return typeof data?.text === 'string' ? data.text : null
  }

  private request(cmd: GsdRpcCommand): Promise<GsdRpcResponse> {
    return this.requestWithTimeout(cmd, REQUEST_TIMEOUT_MS)
  }

  requestWithTimeout(cmd: GsdRpcCommand, timeoutMs: number): Promise<GsdRpcResponse> {
    const id = crypto.randomUUID()
    const withId = { ...cmd, id }
    const line = JSON.stringify(withId) + '\n'

    return new Promise<GsdRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Request timed out after ${timeoutMs}ms: ${cmd.type}`))
      }, timeoutMs)

      this.pending.set(id, {
        resolve: v => { clearTimeout(timer); resolve(v) },
        reject: e => { clearTimeout(timer); reject(e) }
      })

      try {
        this.child.stdin.write(line, err => {
          if (err) {
            clearTimeout(timer)
            this.pending.delete(id)
            reject(err)
          }
        })
      } catch (e) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(e)
      }
    })
  }
}
