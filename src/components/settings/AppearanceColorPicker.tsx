import type { ColorDef } from './appearanceUtils'

export function ColorPicker({ id, label, hint, value, onChange }: ColorDef) {
  return (
    <div className="color-cell" title={hint}>
      <div className="color-cell-header">
        <input
          type="color"
          id={id}
          className="color-swatch"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
        <div className="color-cell-info">
          <label htmlFor={id}>{label}</label>
          <input
            type="text"
            className="color-hex"
            value={value}
            onChange={e => {
              if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                onChange(e.target.value)
              }
            }}
            placeholder={value}
          />
        </div>
      </div>
      <span className="color-cell-hint">{hint}</span>
    </div>
  )
}
