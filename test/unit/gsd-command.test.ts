import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultGsdCommand, shouldUseShellForGsdCommand } from '../../src/gsd-rpc/command.js'

test('defaultGsdCommand: uses gsd.cmd on Windows and gsd elsewhere', () => {
  const originalPlatform = process.platform

  try {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    assert.equal(defaultGsdCommand(), 'gsd.cmd')

    Object.defineProperty(process, 'platform', { value: 'darwin' })
    assert.equal(defaultGsdCommand(), 'gsd')
  } finally {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  }
})

test('shouldUseShellForGsdCommand: enables shell for Windows cmd launchers only', () => {
  const originalPlatform = process.platform
  Object.defineProperty(process, 'platform', { value: 'win32' })

  try {
    assert.equal(shouldUseShellForGsdCommand('gsd.cmd'), true)
    assert.equal(shouldUseShellForGsdCommand('C:\\Users\\me\\AppData\\Roaming\\npm\\gsd.CMD'), true)
    assert.equal(shouldUseShellForGsdCommand('gsd.bat'), true)
    assert.equal(shouldUseShellForGsdCommand('gsd'), false)
    assert.equal(shouldUseShellForGsdCommand('C:\\tools\\gsd.exe'), false)
  } finally {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  }
})

test('shouldUseShellForGsdCommand: keeps shell disabled on non-Windows', () => {
  const originalPlatform = process.platform
  Object.defineProperty(process, 'platform', { value: 'darwin' })

  try {
    assert.equal(shouldUseShellForGsdCommand('gsd.cmd'), false)
    assert.equal(shouldUseShellForGsdCommand('gsd'), false)
  } finally {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  }
})
