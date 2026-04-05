import type { Doc } from '../_generated/dataModel'

type JobProjection = Pick<Doc<'jobs'>, '_id' | 'name' | 'workerType'>

export function projectJob(
  job: Doc<'jobs'> | null,
  includeDescription = false
): (JobProjection & { description?: Doc<'jobs'>['description'] }) | null {
  if (!job) return null

  const base: JobProjection = {
    _id: job._id,
    name: job.name,
    workerType: job.workerType,
  }

  return includeDescription ? { ...base, description: job.description } : base
}
