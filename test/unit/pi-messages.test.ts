import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeGsdAssistantText, normalizeGsdMessageText } from '../../src/acp/translate/gsd-messages.js'

test('normalizeGsdMessageText: supports string', () => {
  assert.equal(normalizeGsdMessageText('hello'), 'hello')
})

test('normalizeGsdMessageText: joins text blocks', () => {
  assert.equal(
    normalizeGsdMessageText([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
      { type: 'not_text', x: 1 }
    ]),
    'ab'
  )
})

test('normalizeGsdAssistantText: joins only text blocks', () => {
  assert.equal(
    normalizeGsdAssistantText([
      { type: 'text', text: 'hi' },
      { type: 'thinking', text: '...' },
      { type: 'text', text: '!' }
    ]),
    'hi!'
  )
})
