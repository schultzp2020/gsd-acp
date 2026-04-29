import type { AgentSideConnection } from '@agentclientprotocol/sdk'
import type { GsdRpcEvent } from '../../src/gsd-rpc/process.js'

type SessionUpdateMsg = Parameters<AgentSideConnection['sessionUpdate']>[0]

export class FakeAgentSideConnection {
  readonly updates: SessionUpdateMsg[] = []

  async sessionUpdate(msg: SessionUpdateMsg): Promise<void> {
    this.updates.push(msg)
  }
}

export class FakeGsdRpcProcess {
  private handlers: Array<(ev: GsdRpcEvent) => void> = []

  // spies
  readonly prompts: Array<{ message: string; attachments: unknown[] }> = []
  readonly steers: string[] = []
  readonly followUps: string[] = []
  readonly rawWrites: string[] = []
  abortCount = 0

  protocolVersion: 1 | 2 = 1
  v2SessionId: string | null = null
  v2Capabilities: Record<string, unknown> | null = null

  stateOverride: Record<string, unknown> = {}

  onEvent(handler: (ev: GsdRpcEvent) => void): () => void {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler)
    }
  }

  emit(ev: GsdRpcEvent) {
    for (const h of this.handlers) h(ev)
  }

  writeRaw(data: string): void {
    this.rawWrites.push(data)
  }

  async prompt(message: string, attachments: unknown[] = []): Promise<void> {
    this.prompts.push({ message, attachments })
  }

  async abort(): Promise<void> {
    this.abortCount += 1
  }

  async steer(message: string): Promise<void> {
    this.steers.push(message)
  }

  async followUp(message: string): Promise<void> {
    this.followUps.push(message)
  }

  async getState(): Promise<Record<string, unknown>> {
    return { ...this.stateOverride }
  }

  async getAvailableModels(): Promise<{ models: Array<{ provider: string; id: string; name: string }> }> {
    return { models: [{ provider: 'test', id: 'model', name: 'model' }] }
  }

  async getMessages(): Promise<{ messages: unknown[] }> {
    return { messages: [] }
  }

  async getForkMessages(): Promise<{ messages: Array<{ entryId: string; text: string }> }> {
    return { messages: [] }
  }

  async fork(_entryId: string): Promise<{ text: string; cancelled: boolean }> {
    return { text: '', cancelled: false }
  }

  async setAutoRetry(_enabled: boolean): Promise<void> {}
  async abortRetry(): Promise<void> {}
  async newSession(_parentSession?: string): Promise<unknown> { return {} }
  async getLastAssistantText(): Promise<string | null> { return null }
  async subscribe(_events: string[]): Promise<void> {}
  async shutdown(_graceful?: boolean): Promise<void> {}
}

export function asAgentConn(conn: FakeAgentSideConnection): AgentSideConnection {
  // We only implement the method(s) used by GsdAcpSession in tests.
  return conn as unknown as AgentSideConnection
}
