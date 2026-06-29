export interface RepoPullRequest {
  number: number
  title: string
  state: string
  author: string
  authorAvatarUrl: string | null
  url: string
  createdAt: string
  updatedAt: string
  labels: Array<{ name: string; color: string }>
  draft: boolean
  headBranch: string
  baseBranch: string
  assigneeCount: number
  approvalCount: number
  changesRequestedCount: number
  threadsUnaddressed: number | null
  iApproved: boolean
}
