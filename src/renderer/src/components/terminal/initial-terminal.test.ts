import { describe, expect, it } from 'vitest'
import { shouldAutoCreateInitialTerminal } from './initial-terminal'

describe('shouldAutoCreateInitialTerminal', () => {
  it('creates a terminal when the tab-group model has no renderable tabs', () => {
    expect(shouldAutoCreateInitialTerminal(0, false)).toBe(true)
  })

  it('does not create a terminal when the tab-group model already has content', () => {
    expect(shouldAutoCreateInitialTerminal(1, false)).toBe(false)
    expect(shouldAutoCreateInitialTerminal(2, false)).toBe(false)
  })

  it('does not recreate a terminal after the initial terminal was already applied', () => {
    expect(shouldAutoCreateInitialTerminal(0, true)).toBe(false)
  })
})
