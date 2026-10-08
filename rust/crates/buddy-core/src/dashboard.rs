//! Dashboard card registry (`useDashboardCards.ts`).

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CardId {
    CommandCenter,
    WorkspacePulse,
    Weather,
    Finance,
}

impl CardId {
    /// The id persisted in `ui.dashboardCards`.
    pub fn key(self) -> &'static str {
        match self {
            CardId::CommandCenter => "command-center",
            CardId::WorkspacePulse => "workspace-pulse",
            CardId::Weather => "weather",
            CardId::Finance => "finance",
        }
    }

    pub fn title(self) -> &'static str {
        match self {
            CardId::CommandCenter => "Command Center",
            CardId::WorkspacePulse => "Workspace Pulse",
            CardId::Weather => "Weather",
            CardId::Finance => "Finance",
        }
    }

    /// Grid columns the card spans (1 or 2).
    pub fn span(self) -> u8 {
        match self {
            CardId::CommandCenter => 2,
            _ => 1,
        }
    }
}

/// All cards in display order.
pub const DASHBOARD_CARDS: [CardId; 4] = [
    CardId::CommandCenter,
    CardId::WorkspacePulse,
    CardId::Weather,
    CardId::Finance,
];

/// Auto-refresh interval options in minutes (`INTERVAL_OPTIONS`); 0 is off.
pub const INTERVAL_OPTIONS: [(u32, &str); 6] = [
    (0, "Off"),
    (1, "1 min"),
    (5, "5 min"),
    (15, "15 min"),
    (30, "30 min"),
    (60, "60 min"),
];
