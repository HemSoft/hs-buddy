import type { TempoWorklog } from '../../types/tempo'

interface TempoTimelineViewProps {
  worklogs: TempoWorklog[]
  loading: boolean
  monthLabel: string
  onEdit: (worklog: TempoWorklog) => void
  onDelete: (worklog: TempoWorklog) => void
}

export function TempoTimelineView({
  worklogs,
  loading,
  monthLabel,
  onEdit,
  onDelete,
}: TempoTimelineViewProps) {
  return (
    <div className="tempo-timeline-view">
      {worklogs.length === 0 && !loading ? (
        <div className="tempo-empty">
          <p>No worklogs for {monthLabel}</p>
        </div>
      ) : (
        <table className="tempo-timeline-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Hours</th>
              <th>Issue</th>
              <th>Description</th>
              <th>Account</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {worklogs.map(worklog => (
              <tr key={worklog.id}>
                <td className="tempo-tl-date">{worklog.date}</td>
                <td className="tempo-tl-time">{worklog.startTime}</td>
                <td className="tempo-tl-hours">{worklog.hours}</td>
                <td>
                  <span className="tempo-issue-pill">{worklog.issueKey}</span>
                </td>
                <td className="tempo-tl-desc">{worklog.issueSummary}</td>
                <td>
                  <span className="tempo-account-badge">{worklog.accountKey}</span>
                </td>
                <td className="tempo-tl-actions">
                  <button
                    onClick={() => onEdit(worklog)}
                    title="Edit"
                    aria-label={`Edit worklog for ${worklog.issueKey} on ${worklog.date}`}
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => onDelete(worklog)}
                    title="Delete"
                    aria-label={`Delete worklog for ${worklog.issueKey} on ${worklog.date}`}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
