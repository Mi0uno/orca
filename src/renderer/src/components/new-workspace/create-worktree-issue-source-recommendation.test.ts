// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  recommendCreateWorktreeIssueSource,
  recordCreateWorktreeIssueSourcePick,
  resolveCreateWorktreeIssueSourceDefault
} from './create-worktree-issue-source-recommendation'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('recommendCreateWorktreeIssueSource', () => {
  it('returns null with no picks (no signal)', () => {
    expect(recommendCreateWorktreeIssueSource('repo-1')).toBeNull()
  })

  it('returns the more-picked source', () => {
    recordCreateWorktreeIssueSourcePick('repo-1', 'origin')
    recordCreateWorktreeIssueSourcePick('repo-1', 'origin')
    recordCreateWorktreeIssueSourcePick('repo-1', 'upstream')
    expect(recommendCreateWorktreeIssueSource('repo-1')).toBe('origin')
  })

  it('flips as the other source overtakes', () => {
    recordCreateWorktreeIssueSourcePick('repo-1', 'origin')
    expect(recommendCreateWorktreeIssueSource('repo-1')).toBe('origin')
    recordCreateWorktreeIssueSourcePick('repo-1', 'upstream')
    recordCreateWorktreeIssueSourcePick('repo-1', 'upstream')
    expect(recommendCreateWorktreeIssueSource('repo-1')).toBe('upstream')
  })

  it('returns null on an exact tie', () => {
    recordCreateWorktreeIssueSourcePick('repo-1', 'origin')
    recordCreateWorktreeIssueSourcePick('repo-1', 'upstream')
    expect(recommendCreateWorktreeIssueSource('repo-1')).toBeNull()
  })

  it('scopes counts per repo', () => {
    recordCreateWorktreeIssueSourcePick('repo-1', 'origin')
    recordCreateWorktreeIssueSourcePick('repo-2', 'upstream')
    expect(recommendCreateWorktreeIssueSource('repo-1')).toBe('origin')
    expect(recommendCreateWorktreeIssueSource('repo-2')).toBe('upstream')
  })

  it('survives corrupt storage', () => {
    window.localStorage.setItem('orca.createWorktree.issueSourcePicks', '{not json')
    expect(recommendCreateWorktreeIssueSource('repo-1')).toBeNull()
    recordCreateWorktreeIssueSourcePick('repo-1', 'origin')
    expect(recommendCreateWorktreeIssueSource('repo-1')).toBe('origin')
  })
})

describe('resolveCreateWorktreeIssueSourceDefault', () => {
  it('prefers the tally recommendation over the persisted preference', () => {
    recordCreateWorktreeIssueSourcePick('repo-1', 'origin')
    recordCreateWorktreeIssueSourcePick('repo-1', 'origin')
    expect(resolveCreateWorktreeIssueSourceDefault('repo-1', 'upstream')).toBe('origin')
  })

  it('falls back to the persisted origin preference when no tally', () => {
    expect(resolveCreateWorktreeIssueSourceDefault('repo-1', 'origin')).toBe('origin')
  })

  it('defaults a fork to upstream (auto heuristic) with no tally or preference', () => {
    expect(resolveCreateWorktreeIssueSourceDefault('repo-1', undefined)).toBe('upstream')
    expect(resolveCreateWorktreeIssueSourceDefault('repo-1', 'auto')).toBe('upstream')
  })
})
