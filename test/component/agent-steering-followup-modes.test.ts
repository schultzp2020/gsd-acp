import test from 'node:test'
import assert from 'node:assert/strict'
import { GsdAcpAgent } from '../../src/acp/agent.js'
import { FakeAgentSideConnection, FakeGsdRpcProcess, asAgentConn } from '../helpers/fakes.js'

class FakeSessions {
  constructor(private readonly session: any) {}
  get(_id: string) {
    return this.session
  }
}

test('GsdAcpAgent: /steering reports current steeringMode', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess() as any
  proc.getState = async () => ({ steeringMode: 'all' })

  const agent = new GsdAcpAgent(asAgentConn(conn))
  ;(agent as any).sessions = new FakeSessions({ sessionId: 's1', proc }) as any

  const res = await agent.prompt({
    sessionId: 's1',
    prompt: [{ type: 'text', text: '/steering' }]
  } as any)

  assert.equal(res.stopReason, 'end_turn')
  const last = conn.updates.at(-1)
  assert.equal(last?.update?.sessionUpdate, 'agent_message_chunk')
  assert.match((last as any).update.content.text, /Steering mode: all/)
})

test('GsdAcpAgent: /steering sets steering mode', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess() as any
  let setTo: string | null = null
  proc.getState = async () => ({ steeringMode: 'all' })
  proc.setSteeringMode = async (m: string) => {
    setTo = m
  }

  const agent = new GsdAcpAgent(asAgentConn(conn))
  ;(agent as any).sessions = new FakeSessions({ sessionId: 's1', proc }) as any

  const res = await agent.prompt({
    sessionId: 's1',
    prompt: [{ type: 'text', text: '/steering one-at-a-time' }]
  } as any)

  assert.equal(res.stopReason, 'end_turn')
  assert.equal(setTo, 'one-at-a-time')
  const last = conn.updates.at(-1)
  assert.match((last as any).update.content.text, /Steering mode set to: one-at-a-time/)
})

test('GsdAcpAgent: /steering rejects invalid value', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess() as any
  let called = false
  proc.getState = async () => ({ steeringMode: 'all' })
  proc.setSteeringMode = async () => {
    called = true
  }

  const agent = new GsdAcpAgent(asAgentConn(conn))
  ;(agent as any).sessions = new FakeSessions({ sessionId: 's1', proc }) as any

  const res = await agent.prompt({
    sessionId: 's1',
    prompt: [{ type: 'text', text: '/steering nope' }]
  } as any)

  assert.equal(res.stopReason, 'end_turn')
  assert.equal(called, false)
  const last = conn.updates.at(-1)
  assert.match((last as any).update.content.text, /Usage: \/steering/)
})

test('GsdAcpAgent: /follow-up reports current followUpMode', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess() as any
  proc.getState = async () => ({ followUpMode: 'one-at-a-time' })

  const agent = new GsdAcpAgent(asAgentConn(conn))
  ;(agent as any).sessions = new FakeSessions({ sessionId: 's1', proc }) as any

  const res = await agent.prompt({
    sessionId: 's1',
    prompt: [{ type: 'text', text: '/follow-up' }]
  } as any)

  assert.equal(res.stopReason, 'end_turn')
  const last = conn.updates.at(-1)
  assert.match((last as any).update.content.text, /Follow-up mode: one-at-a-time/)
})

test('GsdAcpAgent: /follow-up sets follow-up mode', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess() as any
  let setTo: string | null = null
  proc.getState = async () => ({ followUpMode: 'one-at-a-time' })
  proc.setFollowUpMode = async (m: string) => {
    setTo = m
  }

  const agent = new GsdAcpAgent(asAgentConn(conn))
  ;(agent as any).sessions = new FakeSessions({ sessionId: 's1', proc }) as any

  const res = await agent.prompt({
    sessionId: 's1',
    prompt: [{ type: 'text', text: '/follow-up all' }]
  } as any)

  assert.equal(res.stopReason, 'end_turn')
  assert.equal(setTo, 'all')
  const last = conn.updates.at(-1)
  assert.match((last as any).update.content.text, /Follow-up mode set to: all/)
})

test('GsdAcpAgent: /follow-up rejects invalid value', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess() as any
  let called = false
  proc.getState = async () => ({ followUpMode: 'one-at-a-time' })
  proc.setFollowUpMode = async () => {
    called = true
  }

  const agent = new GsdAcpAgent(asAgentConn(conn))
  ;(agent as any).sessions = new FakeSessions({ sessionId: 's1', proc }) as any

  const res = await agent.prompt({
    sessionId: 's1',
    prompt: [{ type: 'text', text: '/follow-up ???' }]
  } as any)

  assert.equal(res.stopReason, 'end_turn')
  assert.equal(called, false)
  const last = conn.updates.at(-1)
  assert.match((last as any).update.content.text, /Usage: \/follow-up/)
})
