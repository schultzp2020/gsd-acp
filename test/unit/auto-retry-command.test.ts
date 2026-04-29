import test from 'node:test'
import assert from 'node:assert/strict'
import { GsdAcpAgent } from '../../src/acp/agent.js'
import { FakeAgentSideConnection, FakeGsdRpcProcess, asAgentConn } from '../helpers/fakes.js'

class FakeSessions {
  private readonly session: any
  constructor(session: any) {
    this.session = session
  }
  get(id: string) {
    if (id !== this.session.sessionId) throw new Error(`Unknown session: ${id}`)
    return this.session
  }
}

function makeSession(proc: FakeGsdRpcProcess) {
  return {
    sessionId: 's1',
    cwd: process.cwd(),
    proc
  }
}

test('/auto-retry on: enables auto-retry', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()

  let setTo: boolean | null = null
  ;(proc as any).setAutoRetry = async (enabled: boolean) => { setTo = enabled }

  const session = makeSession(proc)
  const agent = new GsdAcpAgent(asAgentConn(conn))
  ;(agent as any).sessions = new FakeSessions(session) as any

  await agent.prompt({
    sessionId: 's1',
    prompt: [{ type: 'text', text: '/auto-retry on' }]
  } as any)

  assert.equal(setTo, true)

  const texts = conn.updates
    .map(u => (u as any).update)
    .filter(u => u?.sessionUpdate === 'agent_message_chunk')
    .map(u => u.content?.text)

  assert.ok(texts.some(t => t.includes('enabled')))
})

test('/auto-retry off: disables auto-retry', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()

  let setTo: boolean | null = null
  ;(proc as any).setAutoRetry = async (enabled: boolean) => { setTo = enabled }

  const session = makeSession(proc)
  const agent = new GsdAcpAgent(asAgentConn(conn))
  ;(agent as any).sessions = new FakeSessions(session) as any

  await agent.prompt({
    sessionId: 's1',
    prompt: [{ type: 'text', text: '/auto-retry off' }]
  } as any)

  assert.equal(setTo, false)

  const texts = conn.updates
    .map(u => (u as any).update)
    .filter(u => u?.sessionUpdate === 'agent_message_chunk')
    .map(u => u.content?.text)

  assert.ok(texts.some(t => t.includes('disabled')))
})

test('/auto-retry with no args: toggles based on current state', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()
  proc.stateOverride = { autoRetryEnabled: true }

  let setTo: boolean | null = null
  ;(proc as any).setAutoRetry = async (enabled: boolean) => { setTo = enabled }

  const session = makeSession(proc)
  const agent = new GsdAcpAgent(asAgentConn(conn))
  ;(agent as any).sessions = new FakeSessions(session) as any

  await agent.prompt({
    sessionId: 's1',
    prompt: [{ type: 'text', text: '/auto-retry' }]
  } as any)

  assert.equal(setTo, false)
})
