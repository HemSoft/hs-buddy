import { CheckCircle2, FileDiff, GitCommitHorizontal, MessageSquare, Sparkles } from 'lucide-react'
import type { ElementType } from 'react'
import type { PRDetailSection } from '../../../utils/prDetailView'

export const prSubNodes: Array<{ key: PRDetailSection; label: string }> = [
  { key: 'conversation', label: 'Conversation' },
  { key: 'commits', label: 'Commits' },
  { key: 'checks', label: 'Checks' },
  { key: 'files-changed', label: 'Files changed' },
  { key: 'ai-reviews', label: 'AI Reviews' },
]

export const sectionIcons: Record<PRDetailSection, ElementType> = {
  conversation: MessageSquare,
  commits: GitCommitHorizontal,
  checks: CheckCircle2,
  'files-changed': FileDiff,
  'ai-reviews': Sparkles,
}
