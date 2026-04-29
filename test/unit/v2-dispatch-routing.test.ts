import test from 'node:test'
import assert from 'node:assert/strict'
import { GsdAcpSession } from '../../src/acp/session.js'
import { FakeAgentSideConnection, FakeGsdRpcProcess, asAgentConn } from '../helpers/fakes.js'

test('dispatchTurn: v2 uses steer when isStreaming', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()
  proc.protocolVersion = 2
  proc.stateOverride = { isStreaming: true, messageCount: 5 }

  const session = new GsdAcpSession({
    sessionId: 's1',
    cwd: process.cwd(),
    mcpServers: [],
    proc: proc as any,
    conn: asAgentConn(conn),
    fileCommands: []
  })

  const promise = session.prompt('hello', [])

  await new Promise(r => setTimeout(r, 10))

  assert.equal(proc.steers.length, 1)
  assert.equal(proc.steers[0], 'hello')
  assert.equal(proc.prompts.length, 0)
  assert.equal(proc.followUps.length, 0)

  proc.emit({ type: 'execution_complete', status: 'completed' })
  const result = await promise
  assert.equal(result, 'end_turn')
})

test('dispatchTurn: v2 uses followUp when not streaming and messageCount > 0', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()
  proc.protocolVersion = 2
  proc.stateOverride = { isStreaming: false, messageCount: 3 }

  const session = new GsdAcpSession({
    sessionId: 's1',
    cwd: process.cwd(),
    mcpServers: [],
    proc: proc as any,
    conn: asAgentConn(conn),
    fileCommands: []
  })

  const promise = session.prompt('world', [])

  await new Promise(r => setTimeout(r, 10))

  assert.equal(proc.followUps.length, 1)
  assert.equal(proc.followUps[0], 'world')
  assert.equal(proc.prompts.length, 0)
  assert.equal(proc.steers.length, 0)

  proc.emit({ type: 'execution_complete', status: 'completed' })
  const result = await promise
  assert.equal(result, 'end_turn')
})

test('dispatchTurn: v2 uses prompt when messageCount is 0', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()
  proc.protocolVersion = 2
  proc.stateOverride = { isStreaming: false, messageCount: 0 }

  const session = new GsdAcpSession({
    sessionId: 's1',
    cwd: process.cwd(),
    mcpServers: [],
    proc: proc as any,
    conn: asAgentConn(conn),
    fileCommands: []
  })

  const promise = session.prompt('first message', [])

  await new Promise(r => setTimeout(r, 10))

  assert.equal(proc.prompts.length, 1)
  assert.equal(proc.prompts[0]!.message, 'first message')
  assert.equal(proc.steers.length, 0)
  assert.equal(proc.followUps.length, 0)

  proc.emit({ type: 'execution_complete', status: 'completed' })
  const result = await promise
  assert.equal(result, 'end_turn')
})

test('dispatchTurn: v1 always uses prompt', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()
  proc.protocolVersion = 1
  proc.stateOverride = { isStreaming: true, messageCount: 10 }

  const session = new GsdAcpSession({
    sessionId: 's1',
    cwd: process.cwd(),
    mcpServers: [],
    proc: proc as any,
    conn: asAgentConn(conn),
    fileCommands: []
  })

  const promise = session.prompt('test', [])

  await new Promise(r => setTimeout(r, 10))

  assert.equal(proc.prompts.length, 1)
  assert.equal(proc.steers.length, 0)
  assert.equal(proc.followUps.length, 0)

  proc.emit({ type: 'agent_end' })
  await promise
})
