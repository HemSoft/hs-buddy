//! Exposes the product version to the binary as `BUDDY_VERSION`.
//!
//! The release workflow advances only the repository's `package.json`, so
//! the native build reads its version from there and falls back to the
//! crate version when the file is not available (a standalone checkout of
//! `rust/`).

use std::path::Path;

fn main() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").expect("cargo sets CARGO_MANIFEST_DIR");
    let package_json = Path::new(&manifest_dir).join("../../../package.json");
    println!("cargo:rerun-if-changed={}", package_json.display());
    let version = std::fs::read_to_string(&package_json)
        .ok()
        .and_then(|body| package_version(&body))
        .unwrap_or_else(|| {
            std::env::var("CARGO_PKG_VERSION").expect("cargo sets CARGO_PKG_VERSION")
        });
    println!("cargo:rustc-env=BUDDY_VERSION={version}");
}

fn package_version(body: &str) -> Option<String> {
    let parsed: serde_json::Value = serde_json::from_str(body).ok()?;
    let version = parsed.get("version")?.as_str()?.trim();
    (!version.is_empty()).then(|| version.to_string())
}
