interface ExecConfigSectionProps {
  command: string
  shell: 'powershell' | 'bash' | 'cmd'
  timeout: number
  cwd: string
  onCommandChange: (v: string) => void
  onShellChange: (v: 'powershell' | 'bash' | 'cmd') => void
  onTimeoutChange: (v: number) => void
  onCwdChange: (v: string) => void
}

export function ExecConfigSection({
  command, shell, timeout, cwd,
  onCommandChange, onShellChange, onTimeoutChange, onCwdChange,
}: ExecConfigSectionProps) {
  return (
    <>
      <div className="form-group">
        <label htmlFor="job-command">Command *</label>
        <textarea
          id="job-command"
          value={command}
          onChange={e => onCommandChange(e.target.value)}
          placeholder="e.g., Get-Process | Select-Object -First 10"
          rows={3}
          className="mono"
        />
        <div className="form-hint">The shell command to execute</div>
      </div>

      <div className="form-row-2">
        <div className="form-group">
          <label htmlFor="job-shell">Shell</label>
          <select
            id="job-shell"
            value={shell}
            onChange={e => onShellChange(e.target.value as 'powershell' | 'bash' | 'cmd')}
          >
            <option value="powershell">PowerShell</option>
            <option value="bash">Bash</option>
            <option value="cmd">CMD</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="job-timeout">Timeout (ms)</label>
          <input
            id="job-timeout"
            type="number"
            value={timeout}
            onChange={e => onTimeoutChange(parseInt(e.target.value) || 60000)}
            min={1000}
            step={1000}
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="job-cwd">Working Directory</label>
        <input
          id="job-cwd"
          type="text"
          value={cwd}
          onChange={e => onCwdChange(e.target.value)}
          placeholder="e.g., C:\Projects\MyApp (optional)"
        />
        <div className="form-hint">Leave empty to use the app's working directory</div>
      </div>
    </>
  )
}
