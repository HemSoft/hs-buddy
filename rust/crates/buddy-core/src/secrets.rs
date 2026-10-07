//! OS keychain storage, replacing Electron `safeStorage` for the remembered
//! weather location.

use keyring::Entry;

use crate::config::WeatherLocation;

const SERVICE: &str = "hs-buddy";
const WEATHER_LOCATION_KEY: &str = "weather-location";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, WEATHER_LOCATION_KEY).map_err(|err| err.to_string())
}

pub fn load_weather_location() -> Option<WeatherLocation> {
    let secret = entry().ok()?.get_password().ok()?;
    serde_json::from_str(&secret).ok()
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
