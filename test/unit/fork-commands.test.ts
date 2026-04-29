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

test('/fork-points: lists fork messages', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()

  // Override getForkMessages to return test data.
  ;(proc as any).getForkMessages = async () => ({
    messages: [
      { entryId: 'e1', text: 'Hello world this is a test' },
      { entryId: 'e2', text: 'Second message' }
    ]
  })

  const session = makeSession(proc)
  const agent = new GsdAcpAgent(asAgentConn(conn))
  ;(agent as any).sessions = new FakeSessions(session) as any

  const result = await agent.prompt({
    sessionId: 's1',
    prompt: [{ type: 'text', text: '/fork-points' }]
  } as any)

  assert.equal(result.stopReason, 'end_turn')

  const texts = conn.updates
    .map(u => (u as any).update)
    .filter(u => u?.sessionUpdate === 'agent_message_chunk')
    .map(u => u.content?.text)

  assert.ok(texts.length >= 1)
  assert.ok(texts[0].includes('Fork points:'))
  assert.ok(texts[0].includes('[e1]'))
  assert.ok(texts[0].includes('[e2]'))
})

test('/fork-points: no fork points available', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()

  ;(proc as any).getForkMessages = async () => ({ messages: [] })

  const session = makeSession(proc)
  const agent = new GsdAcpAgent(asAgentConn(conn))
  ;(agent as any).sessions = new FakeSessions(session) as any

  await agent.prompt({
    sessionId: 's1',
    prompt: [{ type: 'text', text: '/fork-points' }]
  } as any)

  const texts = conn.updates
    .map(u => (u as any).update)
    .filter(u => u?.sessionUpdate === 'agent_message_chunk')
    .map(u => u.content?.text)

  assert.ok(texts.some(t => t.includes('No fork points available')))
})

test('/fork: forks session at entry', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()

  ;(proc as any).fork = async (entryId: string) => {
    assert.equal(entryId, 'e1')
    return { text: 'forked content', cancelled: false }
  }

  const session = makeSession(proc)
  const agent = new GsdAcpAgent(asAgentConn(conn))
  ;(agent as any).sessions = new FakeSessions(session) as any

  await agent.prompt({
    sessionId: 's1',
    prompt: [{ type: 'text', text: '/fork e1' }]
  } as any)

  const texts = conn.updates
    .map(u => (u as any).update)
    .filter(u => u?.sessionUpdate === 'agent_message_chunk')
    .map(u => u.content?.text)

  assert.ok(texts.some(t => t.includes('Session forked at entry e1')))
})

test('/fork: shows usage when no entryId', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()

  const session = makeSession(proc)
  const agent = new GsdAcpAgent(asAgentConn(conn))
  ;(agent as any).sessions = new FakeSessions(session) as any

  await agent.prompt({
    sessionId: 's1',
    prompt: [{ type: 'text', text: '/fork' }]
  } as any)

  const texts = conn.updates
    .map(u => (u as any).update)
    .filter(u => u?.sessionUpdate === 'agent_message_chunk')
    .map(u => u.content?.text)

  assert.ok(texts.some(t => t.includes('Usage: /fork')))
})

test('/fork: handles cancelled fork', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()

  ;(proc as any).fork = async () => ({ text: '', cancelled: true })

  const session = makeSession(proc)
  const agent = new GsdAcpAgent(asAgentConn(conn))
  ;(agent as any).sessions = new FakeSessions(session) as any

  await agent.prompt({
    sessionId: 's1',
    prompt: [{ type: 'text', text: '/fork e1' }]
  } as any)

  const texts = conn.updates
    .map(u => (u as any).update)
    .filter(u => u?.sessionUpdate === 'agent_message_chunk')
    .map(u => u.content?.text)

  assert.ok(texts.some(t => t.includes('Fork cancelled')))
})
