import { Type } from 'lucide-react'

interface AppearanceFontsSectionProps {
  fontFamily: string
  monoFontFamily: string
  uiFonts: string[]
  monoFonts: string[]
  fontsLoading: boolean
  onFontFamilyChange: (font: string) => Promise<void>
  onMonoFontFamilyChange: (font: string) => Promise<void>
}

export function AppearanceFontsSection({
  fontFamily,
  monoFontFamily,
  uiFonts,
  monoFonts,
  fontsLoading,
  onFontFamilyChange,
  onMonoFontFamilyChange,
}: AppearanceFontsSectionProps) {
  return (
    <div className="settings-section">
      <div className="section-header">
        <h3>
          <Type size={16} />
          Fonts
        </h3>
      </div>

      <div className="font-grid">
        <div className="font-cell">
          <label htmlFor="ui-font">UI Font</label>
          <select
            id="ui-font"
            className="settings-select"
            value={fontFamily}
            onChange={e => onFontFamilyChange(e.target.value)}
            disabled={fontsLoading}
          >
            <option value="Inter">Inter (Default)</option>
            <option value="system-ui">System Default</option>
            {uiFonts.map(font => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
          <div
            className="font-preview"
            style={{ fontFamily: `'${fontFamily}', system-ui, sans-serif` }}
          >
            The quick brown fox jumps over the lazy dog
          </div>
        </div>

        <div className="font-cell">
          <label htmlFor="mono-font">Monospace Font</label>
          <select
            id="mono-font"
            className="settings-select"
            value={monoFontFamily}
            onChange={e => onMonoFontFamilyChange(e.target.value)}
            disabled={fontsLoading}
          >
            <option value="Cascadia Code">Cascadia Code (Default)</option>
            <option value="Consolas">Consolas</option>
            {monoFonts
              .filter(f => f !== 'Cascadia Code' && f !== 'Consolas')
              .map(font => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
          </select>
          <div
            className="font-preview mono"
            style={{ fontFamily: `'${monoFontFamily}', Consolas, monospace` }}
          >
            const hello = "world"; // 0123456789
          </div>
        </div>
      </div>
    </div>
  )
}
