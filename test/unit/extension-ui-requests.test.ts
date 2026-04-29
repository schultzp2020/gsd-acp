import test from 'node:test'
import assert from 'node:assert/strict'
import { GsdAcpSession } from '../../src/acp/session.js'
import { FakeAgentSideConnection, FakeGsdRpcProcess, asAgentConn } from '../helpers/fakes.js'

test('extension_ui_request: interactive method responds with cancelled', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()

  new GsdAcpSession({
    sessionId: 's1',
    cwd: process.cwd(),
    mcpServers: [],
    proc: proc as any,
    conn: asAgentConn(conn),
    fileCommands: []
  })

  proc.emit({
    type: 'extension_ui_request',
    method: 'select',
    requestId: 'req-1',
    description: 'Pick an option'
  })

  await new Promise(r => setTimeout(r, 10))

  assert.equal(proc.rawWrites.length, 1)
  const response = JSON.parse(proc.rawWrites[0]!)
  assert.equal(response.requestId, 'req-1')
  assert.equal(response.cancelled, true)
})

test('extension_ui_request: confirm method responds with cancelled', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()

  new GsdAcpSession({
    sessionId: 's1',
    cwd: process.cwd(),
    mcpServers: [],
    proc: proc as any,
    conn: asAgentConn(conn),
    fileCommands: []
  })

  proc.emit({
    type: 'extension_ui_request',
    method: 'confirm',
    requestId: 'req-2',
    description: 'Are you sure?'
  })

  await new Promise(r => setTimeout(r, 10))

  assert.equal(proc.rawWrites.length, 1)
  const response = JSON.parse(proc.rawWrites[0]!)
  assert.equal(response.requestId, 'req-2')
  assert.equal(response.cancelled, true)
})

test('extension_ui_request: silent method does not write response', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()

  new GsdAcpSession({
    sessionId: 's1',
    cwd: process.cwd(),
    mcpServers: [],
    proc: proc as any,
    conn: asAgentConn(conn),
    fileCommands: []
  })

  proc.emit({
    type: 'extension_ui_request',
    method: 'setStatus',
    requestId: 'req-3',
    status: 'working'
  })

  await new Promise(r => setTimeout(r, 10))

  assert.equal(proc.rawWrites.length, 0)
})

test('extension_ui_request: notify method does not write response', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()

  new GsdAcpSession({
    sessionId: 's1',
    cwd: process.cwd(),
    mcpServers: [],
    proc: proc as any,
    conn: asAgentConn(conn),
    fileCommands: []
  })

  proc.emit({
    type: 'extension_ui_request',
    method: 'notify',
    message: 'Something happened'
  })

  await new Promise(r => setTimeout(r, 10))

  assert.equal(proc.rawWrites.length, 0)
})

test('extension_ui_request: input method responds with cancelled', async () => {
  const conn = new FakeAgentSideConnection()
  const proc = new FakeGsdRpcProcess()

  new GsdAcpSession({
    sessionId: 's1',
    cwd: process.cwd(),
    mcpServers: [],
    proc: proc as any,
    conn: asAgentConn(conn),
    fileCommands: []
  })

  proc.emit({
    type: 'extension_ui_request',
    method: 'input',
    requestId: 'req-4',
    description: 'Enter value'
  })

  await new Promise(r => setTimeout(r, 10))

  assert.equal(proc.rawWrites.length, 1)
  const response = JSON.parse(proc.rawWrites[0]!)
  assert.equal(response.requestId, 'req-4')
  assert.equal(response.cancelled, true)
})
