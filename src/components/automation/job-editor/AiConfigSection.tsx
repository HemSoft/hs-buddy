import { AccountPicker } from '../../shared/AccountPicker'
import { ModelPicker } from '../../shared/ModelPicker'
import { RepoPicker } from '../../shared/RepoPicker'

interface AiConfigSectionProps {
  prompt: string
  ghAccount: string
  model: string
  targetRepo: string
  onPromptChange: (v: string) => void
  onGhAccountChange: (v: string) => void
  onModelChange: (v: string) => void
  onTargetRepoChange: (v: string) => void
}

export function AiConfigSection({
  prompt,
  ghAccount,
  model,
  targetRepo,
  onPromptChange,
  onGhAccountChange,
  onModelChange,
  onTargetRepoChange,
}: AiConfigSectionProps) {
  return (
    <>
      <div className="form-group">
        <label htmlFor="job-prompt">Prompt *</label>
        <textarea
          id="job-prompt"
          value={prompt}
          onChange={e => onPromptChange(e.target.value)}
          placeholder="Enter the prompt for the AI model..."
          rows={6}
        />
      </div>

      <div className="form-group">
        <label htmlFor="job-gh-account">GitHub Account</label>
        <AccountPicker
          id="job-gh-account"
          value={ghAccount}
          onChange={onGhAccountChange}
          variant="select"
        />
        <div className="form-hint">Account determines billing and available models</div>
      </div>

      <div className="form-group">
        <label htmlFor="job-model">Model</label>
        <ModelPicker
          id="job-model"
          value={model}
          onChange={onModelChange}
          ghAccount={ghAccount}
          variant="select"
          showRefresh
        />
        <div className="form-hint">Models are accessed via GitHub Copilot</div>
      </div>

      <div className="form-group">
        <label htmlFor="job-target-repo">Target Repository</label>
        <RepoPicker
          id="job-target-repo"
          value={targetRepo}
          onChange={onTargetRepoChange}
          variant="select"
          placeholder="None (no repo context)"
          allowNone
        />
        <div className="form-hint">Optional: associate this job with a bookmarked repo</div>
      </div>
    </>
  )
}
