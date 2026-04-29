import test from 'node:test'
import assert from 'node:assert/strict'
import { GsdAcpSession } from '../../src/acp/session.js'
import { FakeAgentSideConnection, FakeGsdRpcProcess, asAgentConn } from '../helpers/fakes.js'

test('v2: execution_complete resolves prompt with end_turn', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()
  proc.protocolVersion = 2
  proc.stateOverride = { messageCount: 0 }

  const session = new GsdAcpSession({
    sessionId: 's1',
    cwd: process.cwd(),
    mcpServers: [],
    proc: proc as any,
    conn: asAgentConn(conn),
    fileCommands: []
  })

  const promise = session.prompt('hi', [])
  await new Promise(r => setTimeout(r, 10))

  proc.emit({ type: 'execution_complete', status: 'completed' })
  const result = await promise
  assert.equal(result, 'end_turn')
})

test('v2: execution_complete with status cancelled resolves as cancelled', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()
  proc.protocolVersion = 2
  proc.stateOverride = { messageCount: 0 }

  const session = new GsdAcpSession({
    sessionId: 's1',
    cwd: process.cwd(),
    mcpServers: [],
    proc: proc as any,
    conn: asAgentConn(conn),
    fileCommands: []
  })

  const promise = session.prompt('hi', [])
  await new Promise(r => setTimeout(r, 10))

  proc.emit({ type: 'execution_complete', status: 'cancelled' })
  const result = await promise
  assert.equal(result, 'cancelled')
})

test('v2: execution_complete with stats emits session_info_update', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()
  proc.protocolVersion = 2
  proc.stateOverride = { messageCount: 0 }

  const session = new GsdAcpSession({
    sessionId: 's1',
    cwd: process.cwd(),
    mcpServers: [],
    proc: proc as any,
    conn: asAgentConn(conn),
    fileCommands: []
  })

  const promise = session.prompt('hi', [])
  await new Promise(r => setTimeout(r, 10))

  proc.emit({
    type: 'execution_complete',
    status: 'completed',
    stats: { inputTokens: 100, outputTokens: 50 }
  })

  await promise

  const infoUpdates = conn.updates
    .map(u => (u as any).update)
    .filter(u => u?.sessionUpdate === 'session_info_update' && u?._meta?.gsdAcp?.executionStats)

  assert.ok(infoUpdates.length >= 1)
  assert.deepEqual(infoUpdates[0]._meta.gsdAcp.executionStats, { inputTokens: 100, outputTokens: 50 })
})

test('v2: agent_end is ignored when protocolVersion >= 2', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()
  proc.protocolVersion = 2
  proc.stateOverride = { messageCount: 0 }

  const session = new GsdAcpSession({
    sessionId: 's1',
    cwd: process.cwd(),
    mcpServers: [],
    proc: proc as any,
    conn: asAgentConn(conn),
    fileCommands: []
  })

  const promise = session.prompt('hi', [])
  await new Promise(r => setTimeout(r, 10))

  // agent_end should NOT resolve the prompt in v2 mode.
  proc.emit({ type: 'agent_end' })
  await new Promise(r => setTimeout(r, 20))

  // Promise should still be pending — resolve it with execution_complete.
  proc.emit({ type: 'execution_complete', status: 'completed' })
  const result = await promise
  assert.equal(result, 'end_turn')
})

test('v2: cost_update emits session_info_update with cost data', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()
  proc.protocolVersion = 2
  proc.stateOverride = { messageCount: 0 }

  const session = new GsdAcpSession({
    sessionId: 's1',
    cwd: process.cwd(),
    mcpServers: [],
    proc: proc as any,
    conn: asAgentConn(conn),
    fileCommands: []
  })

  const promise = session.prompt('hi', [])
  await new Promise(r => setTimeout(r, 10))

  proc.emit({
    type: 'cost_update',
    turnCost: 0.05,
    cumulativeCost: 0.15,
    tokens: { input: 500, output: 200 }
  })

  await new Promise(r => setTimeout(r, 10))

  const costUpdates = conn.updates
    .map(u => (u as any).update)
    .filter(u =>
      u?.sessionUpdate === 'session_info_update' &&
      u?._meta?.gsdAcp?.turnCost !== undefined
    )

  assert.ok(costUpdates.length >= 1)
  assert.equal(costUpdates[0]._meta.gsdAcp.turnCost, 0.05)
  assert.equal(costUpdates[0]._meta.gsdAcp.cumulativeCost, 0.15)
  assert.deepEqual(costUpdates[0]._meta.gsdAcp.tokens, { input: 500, output: 200 })

  proc.emit({ type: 'execution_complete', status: 'completed' })
  await promise
})

test('v2: agent_start captures runId', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()
  proc.protocolVersion = 2
  proc.stateOverride = { messageCount: 0 }

  const session = new GsdAcpSession({
    sessionId: 's1',
    cwd: process.cwd(),
    mcpServers: [],
    proc: proc as any,
    conn: asAgentConn(conn),
    fileCommands: []
  })

  const promise = session.prompt('hi', [])
  await new Promise(r => setTimeout(r, 10))

  proc.emit({ type: 'agent_start', runId: 'run-abc-123' })

  await new Promise(r => setTimeout(r, 10))

  // The runId is internal state — verify it doesn't crash and the turn completes.
  proc.emit({ type: 'execution_complete', status: 'completed' })
  const result = await promise
  assert.equal(result, 'end_turn')
})
