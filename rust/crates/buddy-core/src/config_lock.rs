//! Cross-process advisory lock for the shared `config.json`.
//!
//! Electron and the native app both read-modify-write the same file. The
//! lock is a directory next to it (`config.json.lock`), created with
//! `mkdir`, which is atomic on every supported platform and needs no file
//! locking API that Node lacks. The Electron side (`electron/configLock.ts`)
//! implements the same protocol:
//!
//! - acquire: `mkdir`; on `AlreadyExists`, wait and retry;
//! - stale: a lock older than [`STALE_AFTER`] belongs to a crashed holder
//!   and is removed before retrying;
//! - release: remove the directory;
//! - bounded: a writer that cannot acquire within the timeout proceeds
//!   anyway (logged), because a wedged lock must never freeze either app.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

/// A holder that has not touched its lock for this long is presumed dead.
pub const STALE_AFTER: Duration = Duration::from_secs(10);
/// How long a writer waits for the lock before proceeding unlocked.
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(2);
const POLL: Duration = Duration::from_millis(25);

/// Holds the lock; dropping it releases.
#[derive(Debug)]
pub struct ConfigLock {
    dir: PathBuf,
}

/// The lock directory for a config file: `config.json.lock`.
pub fn lock_dir(config_path: &Path) -> PathBuf {
    let mut name = config_path
        .file_name()
        .map(|n| n.to_os_string())
        .unwrap_or_default();
    name.push(".lock");
    config_path.with_file_name(name)
}

impl ConfigLock {
    /// Acquire the lock for `config_path`, waiting up to `timeout`.
    /// `Ok(None)` means the wait ran out and the caller proceeds unlocked.
    pub fn acquire(config_path: &Path, timeout: Duration) -> std::io::Result<Option<Self>> {
        let dir = lock_dir(config_path);
        if let Some(parent) = dir.parent().filter(|p| !p.as_os_str().is_empty()) {
            std::fs::create_dir_all(parent)?;
        }
        let deadline = Instant::now() + timeout;
        loop {
            match std::fs::create_dir(&dir) {
                Ok(()) => return Ok(Some(Self { dir })),
                Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => {
                    if is_stale(&dir) {
                        // A crashed holder; the removal may race another
                        // waiter doing the same, which is fine.
                        let _ = std::fs::remove_dir(&dir);
                        continue;
                    }
                    if Instant::now() >= deadline {
                        return Ok(None);
                    }
                    std::thread::sleep(POLL);
                }
                Err(err) => return Err(err),
            }
        }
    }
}

impl Drop for ConfigLock {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir(&self.dir);
    }
}

fn is_stale(dir: &Path) -> bool {
    std::fs::metadata(dir)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|modified| modified.elapsed().ok())
        .is_some_and(|age| age > STALE_AFTER)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_config(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("buddy-lock-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("config.json")
    }

    #[test]
    fn lock_dir_sits_next_to_the_config() {
        assert_eq!(
            lock_dir(Path::new("/x/Buddy/config.json")),
            PathBuf::from("/x/Buddy/config.json.lock")
        );
    }

    #[test]
    fn acquire_and_release() {
        let config = temp_config("basic");
        let dir = lock_dir(&config);
        let guard = ConfigLock::acquire(&config, DEFAULT_TIMEOUT).unwrap();
        assert!(guard.is_some());
        assert!(dir.is_dir());
        drop(guard);
        assert!(!dir.exists());
        let _ = std::fs::remove_dir_all(config.parent().unwrap());
    }

    #[test]
    fn a_held_lock_makes_a_second_writer_wait_then_proceed() {
        let config = temp_config("held");
        let _first = ConfigLock::acquire(&config, DEFAULT_TIMEOUT)
            .unwrap()
            .unwrap();
        let started = Instant::now();
        let second = ConfigLock::acquire(&config, Duration::from_millis(150)).unwrap();
        assert!(second.is_none(), "the timeout must yield None, not a lock");
        assert!(started.elapsed() >= Duration::from_millis(150));
        let _ = std::fs::remove_dir_all(config.parent().unwrap());
    }

    #[test]
    fn a_stale_lock_is_taken_over() {
        let config = temp_config("stale");
        let dir = lock_dir(&config);
        std::fs::create_dir(&dir).unwrap();
        let old = std::time::SystemTime::now() - STALE_AFTER - Duration::from_secs(5);
        std::fs::File::open(&dir)
            .and_then(|f| f.set_modified(old))
            .expect("set the lock's mtime into the past");
        let guard = ConfigLock::acquire(&config, Duration::from_millis(200)).unwrap();
        assert!(guard.is_some(), "a stale lock must not block a writer");
        let _ = std::fs::remove_dir_all(config.parent().unwrap());
    }

    #[test]
    fn release_lets_the_next_writer_in() {
        let config = temp_config("handoff");
        let first = ConfigLock::acquire(&config, DEFAULT_TIMEOUT).unwrap();
        let path = config.clone();
        let waiter = std::thread::spawn(move || {
            ConfigLock::acquire(&path, DEFAULT_TIMEOUT)
                .unwrap()
                .is_some()
        });
        std::thread::sleep(Duration::from_millis(100));
        drop(first);
        assert!(waiter.join().unwrap());
        let _ = std::fs::remove_dir_all(config.parent().unwrap());
    }
}
