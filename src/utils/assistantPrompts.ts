interface AddressCommentsParams {
  prId: number
  org: string
  repository: string
  url: string
}

export function buildAddressCommentsPrompt({
  prId,
  org,
  repository,
  url,
}: AddressCommentsParams): string {
  return [
    `Address the unresolved review comments on PR #${prId} in ${org}/${repository} (${url}).`,
    '',
    'For each unresolved review thread:',
    '1. Fetch the thread and understand what the reviewer is asking for.',
    '2. Implement the requested change in the codebase.',
    '3. Reply to the thread with a brief summary of what you changed (e.g., "Fixed — replaced X with Y in `file.ts`.").',
    '4. Mark the thread as resolved.',
    '',
    'After addressing all threads, push the changes and confirm the final status.',
  ].join('\n')
}
