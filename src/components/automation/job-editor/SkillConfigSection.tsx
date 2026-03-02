interface SkillConfigSectionProps {
  skillName: string
  skillAction: string
  skillParams: string
  onSkillNameChange: (v: string) => void
  onSkillActionChange: (v: string) => void
  onSkillParamsChange: (v: string) => void
}

export function SkillConfigSection({
  skillName, skillAction, skillParams,
  onSkillNameChange, onSkillActionChange, onSkillParamsChange,
}: SkillConfigSectionProps) {
  return (
    <>
      <div className="form-group">
        <label htmlFor="job-skill-name">Skill Name *</label>
        <input
          id="job-skill-name"
          type="text"
          value={skillName}
          onChange={e => onSkillNameChange(e.target.value)}
          placeholder="e.g., todoist, github, diary"
        />
        <div className="form-hint">Name of the Claude skill to execute</div>
      </div>

      <div className="form-group">
        <label htmlFor="job-skill-action">Action</label>
        <input
          id="job-skill-action"
          type="text"
          value={skillAction}
          onChange={e => onSkillActionChange(e.target.value)}
          placeholder="e.g., list, create, sync (optional)"
        />
        <div className="form-hint">Specific action within the skill</div>
      </div>

      <div className="form-group">
        <label htmlFor="job-skill-params">Parameters (JSON)</label>
        <textarea
          id="job-skill-params"
          value={skillParams}
          onChange={e => onSkillParamsChange(e.target.value)}
          placeholder='e.g., {"projectId": "123", "filter": "today"}'
          rows={4}
          className="mono"
        />
        <div className="form-hint">Optional JSON parameters to pass to the skill</div>
      </div>
    </>
  )
}
