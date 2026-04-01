import { describe, expect, it } from 'vitest'
import { CheckCircle2, FileDiff, GitCommitHorizontal, MessageSquare, Sparkles } from 'lucide-react'
import { prSubNodes, sectionIcons } from './prConstants'

describe('prConstants', () => {
  it('exports the expected PR sub-sections in sidebar order', () => {
    expect(prSubNodes).toEqual([
      { key: 'conversation', label: 'Conversation' },
      { key: 'commits', label: 'Commits' },
      { key: 'checks', label: 'Checks' },
      { key: 'files-changed', label: 'Files changed' },
      { key: 'ai-reviews', label: 'AI Reviews' },
    ])
  })

  it('maps each PR sub-section to the correct icon component', () => {
    expect(sectionIcons).toEqual({
      conversation: MessageSquare,
      commits: GitCommitHorizontal,
      checks: CheckCircle2,
      'files-changed': FileDiff,
      'ai-reviews': Sparkles,
    })
    expect(Object.keys(sectionIcons)).toEqual(prSubNodes.map(node => node.key))
  })
})
