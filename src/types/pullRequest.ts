export interface PullRequest {
  source: 'GitHub' | 'Bitbucket';
  repository: string;
  id: number;
  title: string;
  author: string;
  authorAvatarUrl?: string;
  url: string;
  state: string;
  approvalCount: number;
  assigneeCount: number;
  iApproved: boolean;
  created: Date | null;
  updatedAt?: string | null;
  headBranch?: string;
  baseBranch?: string;
  threadsTotal?: number | null;
  threadsAddressed?: number | null;
  threadsUnaddressed?: number | null;
  date: string | null;
  orgAvatarUrl?: string;
  org?: string;
}

export interface PRConfig {
  github: {
    accounts: Array<{
      username: string;
      org: string;
    }>;
  };
  bitbucket: {
    workspaces: Array<{
      workspace: string;
      username: string;
      userDisplayName: string;
    }>;
  };
}
