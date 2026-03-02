import { Palette, RotateCcw } from 'lucide-react';
import { type ColorDef, ColorPicker } from './AppearanceColorPicker';

interface AppearanceColorsSectionProps {
  brandColors: ColorDef[];
  backgroundColors: ColorDef[];
  statusBarColors: ColorDef[];
  onReset: () => Promise<void>;
}

export function AppearanceColorsSection({
  brandColors,
  backgroundColors,
  statusBarColors,
  onReset,
}: AppearanceColorsSectionProps) {
  return (
    <div className="settings-section">
      <div className="section-header">
        <h3>
          <Palette size={16} />
          Colors
        </h3>
        <button
          className="settings-btn settings-btn-secondary"
          onClick={onReset}
          title="Reset to theme defaults"
        >
          <RotateCcw size={14} />
          Reset
        </button>
      </div>

      <div className="color-group">
        <h4 className="color-group-label">Brand</h4>
        <div className="color-grid">
          {brandColors.map(c => <ColorPicker key={c.id} {...c} />)}
        </div>
      </div>

      <div className="color-group">
        <h4 className="color-group-label">Backgrounds</h4>
        <div className="color-grid">
          {backgroundColors.map(c => <ColorPicker key={c.id} {...c} />)}
        </div>
      </div>

      <div className="color-group">
        <h4 className="color-group-label">Status Bar</h4>
        <div className="color-grid">
          {statusBarColors.map(c => <ColorPicker key={c.id} {...c} />)}
        </div>
      </div>
    </div>
  );
}
