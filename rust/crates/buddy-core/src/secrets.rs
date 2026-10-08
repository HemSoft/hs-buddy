//! OS keychain storage, replacing Electron `safeStorage` for the remembered
//! weather location.

use keyring::Entry;

use crate::config::WeatherLocation;

const SERVICE: &str = "hs-buddy";
const WEATHER_LOCATION_KEY: &str = "weather-location";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, WEATHER_LOCATION_KEY).map_err(|err| err.to_string())
}

/// The remembered location: `Ok(None)` when the keychain has no entry,
/// `Err` when it could not be read (locked, unavailable, denied).
pub fn try_load_weather_location() -> Result<Option<WeatherLocation>, String> {
    match entry()?.get_password() {
        Ok(secret) => Ok(serde_json::from_str(&secret).ok()),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

/// The remembered location, treating an unreadable keychain as empty.
pub fn load_weather_location() -> Option<WeatherLocation> {
    try_load_weather_location().ok().flatten()
}

pub fn save_weather_location(location: &WeatherLocation) -> Result<(), String> {
    let json = serde_json::to_string(location).map_err(|err| err.to_string())?;
    entry()?.set_password(&json).map_err(|err| err.to_string())
}

pub fn clear_weather_location() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}
