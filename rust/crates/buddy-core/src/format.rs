//! Number and duration formatting matching the Electron renderer's output
//! (`toLocaleString`, `formatCurrency`, `formatUptime`, `formatPrice`).

/// `n.toLocaleString()` for an integer in the en-US locale.
pub fn thousands(n: i64) -> String {
    let digits = n.unsigned_abs().to_string();
    let mut out = String::with_capacity(digits.len() + digits.len() / 3 + 1);
    for (i, ch) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(ch);
    }
    if n < 0 {
        out.insert(0, '-');
    }
    out
}

/// A number with grouped integer digits and exactly `decimals` fraction digits.
pub fn decimal(value: f64, decimals: usize) -> String {
    let rounded = format!("{value:.decimals$}");
    let (int_part, frac_part) = match rounded.split_once('.') {
        Some((i, f)) => (i, Some(f)),
        None => (rounded.as_str(), None),
    };
    let negative = int_part.starts_with('-');
    let grouped = thousands(int_part.trim_start_matches('-').parse::<i64>().unwrap_or(0));
    let mut out = String::new();
    if negative {
        out.push('-');
    }
    out.push_str(&grouped);
    if let Some(frac) = frac_part {
        out.push('.');
        out.push_str(frac);
    }
    out
}

/// `formatCurrency` from `quotaUtils.ts`: USD with two fraction digits.
pub fn currency(amount: f64) -> String {
    if amount < 0.0 {
        format!("-${}", decimal(-amount, 2))
    } else {
        format!("${}", decimal(amount, 2))
    }
}

/// `formatPrice` from `FinanceCard.tsx`: two decimals at or above 1000,
/// otherwise up to four significant fraction digits with trailing zeros
/// trimmed down to two.
pub fn price(value: f64) -> String {
    if !value.is_finite() {
        return "—".to_string();
    }
    if value >= 1000.0 {
        return decimal(value, 2);
    }
    let four = decimal(value, 4);
    let trimmed = four.trim_end_matches('0');
    let (int_part, frac) = trimmed.split_once('.').unwrap_or((trimmed, ""));
    if frac.len() >= 2 {
        format!("{int_part}.{frac}")
    } else {
        format!("{int_part}.{frac:0<2}")
    }
}

const SECOND_MS: u64 = 1_000;
const MINUTE_MS: u64 = 60 * SECOND_MS;
const HOUR_MS: u64 = 60 * MINUTE_MS;
const DAY_MS: u64 = 24 * HOUR_MS;

fn with_remainder(value: u64, unit: &str, remainder: u64, remainder_unit: &str) -> String {
    if remainder > 0 {
        format!("{value}{unit} {remainder}{remainder_unit}")
    } else {
        format!("{value}{unit}")
    }
}

/// `formatUptime` from `dateUtils.ts`.
pub fn uptime(ms: u64) -> String {
    if ms == 0 {
        return "0s".to_string();
    }
    if ms < MINUTE_MS {
        return format!("{}s", ms / SECOND_MS);
    }
    if ms < HOUR_MS {
        return format!("{}m", ms / MINUTE_MS);
    }
    if ms < DAY_MS {
        return with_remainder(ms / HOUR_MS, "h", (ms % HOUR_MS) / MINUTE_MS, "m");
    }
    with_remainder(ms / DAY_MS, "d", (ms % DAY_MS) / HOUR_MS, "h")
}

/// Relative "x ago" label for refresh status lines.
pub fn ago(ms: u64) -> String {
    if ms < MINUTE_MS {
        "just now".to_string()
    } else if ms < HOUR_MS {
        format!("{}m ago", ms / MINUTE_MS)
    } else {
        format!("{}h ago", ms / HOUR_MS)
    }
}

/// Countdown label such as `4m 12s` or `45s`.
pub fn countdown(ms: u64) -> String {
    let minutes = ms / MINUTE_MS;
    let seconds = (ms % MINUTE_MS) / SECOND_MS;
    if minutes > 0 {
        format!("{minutes}m {seconds:02}s")
    } else {
        format!("{seconds}s")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn groups_thousands() {
        assert_eq!(thousands(0), "0");
        assert_eq!(thousands(999), "999");
        assert_eq!(thousands(1_000), "1,000");
        assert_eq!(thousands(1_234_567), "1,234,567");
        assert_eq!(thousands(-1_234), "-1,234");
    }

    #[test]
    fn formats_currency_like_intl() {
        assert_eq!(currency(0.0), "$0.00");
        assert_eq!(currency(12.4), "$12.40");
        assert_eq!(currency(1234.567), "$1,234.57");
        assert_eq!(currency(-3.5), "-$3.50");
    }

    #[test]
    fn formats_prices_like_finance_card() {
        assert_eq!(price(5234.18), "5,234.18");
        assert_eq!(price(63_412.9), "63,412.90");
        assert_eq!(price(0.1234), "0.1234");
        assert_eq!(price(12.5), "12.50");
        assert_eq!(price(f64::NAN), "—");
    }

    #[test]
    fn formats_uptime() {
        assert_eq!(uptime(0), "0s");
        assert_eq!(uptime(45_000), "45s");
        assert_eq!(uptime(5 * MINUTE_MS), "5m");
        assert_eq!(uptime(HOUR_MS + 5 * MINUTE_MS), "1h 5m");
        assert_eq!(uptime(2 * HOUR_MS), "2h");
        assert_eq!(uptime(3 * DAY_MS + 4 * HOUR_MS), "3d 4h");
    }
}
