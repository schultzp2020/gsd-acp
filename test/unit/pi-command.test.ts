import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultGsdCommand, shouldUseShellForGsdCommand } from '../../src/gsd-rpc/command.js'

test('defaultGsdCommand: uses pi.cmd on Windows and pi elsewhere', () => {
  const originalPlatform = process.platform

  try {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    assert.equal(defaultGsdCommand(), 'pi.cmd')

    Object.defineProperty(process, 'platform', { value: 'darwin' })
    assert.equal(defaultGsdCommand(), 'pi')
  } finally {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  }
})

test('shouldUseShellForGsdCommand: enables shell for Windows cmd launchers only', () => {
  const originalPlatform = process.platform
  Object.defineProperty(process, 'platform', { value: 'win32' })

  try {
    assert.equal(shouldUseShellForGsdCommand('pi.cmd'), true)
    assert.equal(shouldUseShellForGsdCommand('C:\\Users\\me\\AppData\\Roaming\\npm\\pi.CMD'), true)
    assert.equal(shouldUseShellForGsdCommand('pi.bat'), true)
    assert.equal(shouldUseShellForGsdCommand('pi'), false)
    assert.equal(shouldUseShellForGsdCommand('C:\\tools\\pi.exe'), false)
  } finally {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  }
})

test('shouldUseShellForGsdCommand: keeps shell disabled on non-Windows', () => {
  const originalPlatform = process.platform
  Object.defineProperty(process, 'platform', { value: 'darwin' })

  try {
    assert.equal(shouldUseShellForGsdCommand('pi.cmd'), false)
    assert.equal(shouldUseShellForGsdCommand('pi'), false)
  } finally {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  }
})
