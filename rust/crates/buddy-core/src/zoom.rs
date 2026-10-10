//! Window zoom, matching the Electron app's View-menu zoom
//! (`electron/menu.ts`): 10% steps between 50% and 300%, persisted as
//! `{"zoomFactor":1.1}` in `zoom-level.json` next to `config.json`
//! (`electron/zoom.ts`), so both apps restore the same level.
//!
//! The level is held in whole percent so repeated steps never drift.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::config::{ConfigError, config_path, strip_bom};

pub const MIN_PERCENT: u32 = 50;
pub const MAX_PERCENT: u32 = 300;
pub const STEP_PERCENT: u32 = 10;
pub const DEFAULT_PERCENT: u32 = 100;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ZoomStep {
    In,
    Out,
    Reset,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Zoom {
    percent: u32,
}

impl Default for Zoom {
    fn default() -> Self {
        Self {
            percent: DEFAULT_PERCENT,
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ZoomFile {
    #[serde(default)]
    zoom_factor: Option<f64>,
}

impl Zoom {
    /// A zoom factor as Electron stores it (1.0 = 100%). Like
    /// `loadZoomLevel`, a missing or zero factor means 100%; anything else is
    /// rounded to whole percent and clamped to the supported range.
    pub fn from_factor(factor: f64) -> Self {
        if !factor.is_finite() || factor <= 0.0 {
            return Self::default();
        }
        let percent = (factor * 100.0)
            .round()
            .clamp(MIN_PERCENT as f64, MAX_PERCENT as f64);
        Self {
            percent: percent as u32,
        }
    }

    pub fn percent(self) -> u32 {
        self.percent
    }

    /// The multiplier for sizes designed at 100%.
    pub fn factor(self) -> f32 {
        self.percent as f32 / 100.0
    }

    /// The level after one step; a step past a limit leaves it unchanged.
    pub fn step(self, step: ZoomStep) -> Self {
        let percent = match step {
            ZoomStep::In => (self.percent + STEP_PERCENT).min(MAX_PERCENT),
            ZoomStep::Out => self.percent.saturating_sub(STEP_PERCENT).max(MIN_PERCENT),
            ZoomStep::Reset => DEFAULT_PERCENT,
        };
        Self { percent }
    }

    /// Load `zoom-level.json`; a missing file is 100%.
    pub fn load_from(path: &Path) -> Result<Self, ConfigError> {
        match std::fs::read_to_string(path) {
            Ok(body) => serde_json::from_str::<ZoomFile>(strip_bom(&body))
                .map(|file| {
                    file.zoom_factor
                        .map_or_else(Self::default, Self::from_factor)
                })
                .map_err(|source| ConfigError::Parse {
                    path: path.to_path_buf(),
                    source,
                }),
            Err(source) if source.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(source) => Err(ConfigError::Read {
                path: path.to_path_buf(),
                source,
            }),
        }
    }

    /// Write atomically (temp file + rename) in Electron's compact format.
    pub fn save_to(self, path: &Path) -> Result<(), ConfigError> {
        let write = |source| ConfigError::Write {
            path: path.to_path_buf(),
            source,
        };
        let body = serde_json::to_string(&ZoomFile {
            zoom_factor: Some(self.percent as f64 / 100.0),
        })
        .expect("ZoomFile is always serializable");
        if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
            std::fs::create_dir_all(parent).map_err(write)?;
        }
        let tmp = path.with_extension(format!("json.{}.tmp", std::process::id()));
        std::fs::write(&tmp, body).map_err(write)?;
        std::fs::rename(&tmp, path).map_err(|source| {
            let _ = std::fs::remove_file(&tmp);
            write(source)
        })
    }
}

/// `zoom-level.json` in the same directory as the resolved `config.json`.
pub fn zoom_path() -> Result<PathBuf, ConfigError> {
    Ok(config_path()?.with_file_name("zoom-level.json"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn steps(start: Zoom, sequence: &[ZoomStep]) -> Vec<u32> {
        sequence
            .iter()
            .scan(start, |zoom, step| {
                *zoom = zoom.step(*step);
                Some(zoom.percent())
            })
            .collect()
    }

    #[test]
    fn steps_by_ten_percent_and_resets_to_one_hundred() {
        use ZoomStep::*;
        assert_eq!(
            steps(Zoom::default(), &[In, In, Out, Reset]),
            vec![110, 120, 110, 100]
        );
    }

    #[test]
    fn stepping_at_a_limit_changes_nothing() {
        let max = Zoom::from_factor(3.0);
        assert_eq!(max.step(ZoomStep::In), max);
        let min = Zoom::from_factor(0.5);
        assert_eq!(min.step(ZoomStep::Out), min);
        assert_eq!(
            steps(Zoom::from_factor(2.8), &[ZoomStep::In; 4]),
            vec![290, 300, 300, 300]
        );
        assert_eq!(
            steps(Zoom::from_factor(0.7), &[ZoomStep::Out; 4]),
            vec![60, 50, 50, 50]
        );
    }

    #[test]
    fn electron_factors_round_to_whole_percent_and_clamp() {
        // Electron's own float steps: 1.0 + 0.1 + 0.1 = 1.2000000000000002.
        assert_eq!(Zoom::from_factor(1.0 + 0.1 + 0.1).percent(), 120);
        assert_eq!(Zoom::from_factor(1.15).percent(), 115);
        assert_eq!(Zoom::from_factor(9.0).percent(), MAX_PERCENT);
        assert_eq!(Zoom::from_factor(0.1).percent(), MIN_PERCENT);
        assert_eq!(Zoom::from_factor(0.0), Zoom::default());
        assert_eq!(Zoom::from_factor(f64::NAN), Zoom::default());
    }

    #[test]
    fn many_steps_never_drift() {
        let mut zoom = Zoom::default();
        for _ in 0..25 {
            zoom = zoom.step(ZoomStep::In).step(ZoomStep::Out);
        }
        assert_eq!(zoom.percent(), 100);
        assert_eq!(Zoom::from_factor(1.1).factor(), 1.1);
    }

    #[test]
    fn round_trips_through_electrons_file_format() {
        let dir = std::env::temp_dir().join(format!("buddy-zoom-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("zoom-level.json");
        let missing = Zoom::load_from(&path).unwrap();
        Zoom::from_factor(1.3).save_to(&path).unwrap();
        let body = std::fs::read_to_string(&path).unwrap();
        let loaded = Zoom::load_from(&path).unwrap();
        std::fs::write(&path, "\u{feff}{\"zoomFactor\":0.8}").unwrap();
        let with_bom = Zoom::load_from(&path).unwrap();
        std::fs::write(&path, "{}").unwrap();
        let empty = Zoom::load_from(&path).unwrap();
        std::fs::write(&path, "not json").unwrap();
        let corrupt = Zoom::load_from(&path);
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(missing, Zoom::default());
        assert_eq!(body, "{\"zoomFactor\":1.3}");
        assert_eq!(loaded.percent(), 130);
        assert_eq!(with_bom.percent(), 80);
        assert_eq!(empty, Zoom::default());
        assert!(matches!(corrupt, Err(ConfigError::Parse { .. })));
    }
}
