//! Cross-process advisory lock for the shared `config.json`.
//!
//! Electron and the native app both read-modify-write the same file. The
//! lock is a directory next to it (`config.json.lock`), created with
//! `mkdir`, which is atomic on every supported platform and needs no file
//! locking API that Node lacks. The Electron side (`electron/configLock.ts`)
//! implements the same protocol:
//!
//! - acquire: `mkdir`; on `AlreadyExists`, wait and retry;
//! - stale: a lock whose mtime is older than [`STALE_AFTER`] belongs to a
//!   crashed holder. A waiter takes it over *in place*: it creates the
//!   marker `claim` inside the directory (atomic, so exactly one waiter
//!   wins), then checks that the directory is still the instance it observed
//!   (same identity). A mismatch means the stale lock was released and a
//!   fresh one created meanwhile, so the waiter withdraws its marker and goes
//!   back to waiting. A marker that is itself older than [`STALE_AFTER`]
//!   belongs to a claimer that crashed too and is removed before claiming.
//!   Nothing else is ever renamed or removed by a waiter, so a live lock
//!   cannot be stolen;
//! - release: the holder removes its marker (if any) and the directory;
//! - bounded: a writer that cannot acquire within the timeout proceeds
//!   anyway (logged), because a wedged lock must never freeze either app.
//!   Electron's critical section is one synchronous file write, so the wait
//!   here is short; it runs on the GPUI thread only under actual contention.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime};

/// A holder that has not touched its lock for this long is presumed dead.
pub const STALE_AFTER: Duration = Duration::from_secs(10);
/// How long a writer waits for the lock before proceeding unlocked.
pub const DEFAULT_TIMEOUT: Duration = Duration::from_millis(500);
const POLL: Duration = Duration::from_millis(10);
const CLAIM: &str = "claim";

/// Holds the lock; dropping it releases.
#[derive(Debug)]
pub struct ConfigLock {
    dir: PathBuf,
    claimed: bool,
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

/// What identifies one directory instance across a release and re-create:
/// the inode where there is one, else the creation time.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Identity {
    #[cfg(unix)]
    ino: u64,
    created: Option<SystemTime>,
}

struct Observation {
    identity: Identity,
    stale: bool,
}

fn observe(dir: &Path) -> Option<Observation> {
    let meta = std::fs::metadata(dir).ok()?;
    let stale = meta
        .modified()
        .ok()
        .and_then(|m| m.elapsed().ok())
        .is_some_and(|age| age > STALE_AFTER);
    Some(Observation {
        identity: Identity {
            #[cfg(unix)]
            ino: std::os::unix::fs::MetadataExt::ino(&meta),
            created: meta.created().ok(),
        },
        stale,
    })
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
                Ok(()) => {
                    return Ok(Some(Self {
                        dir,
                        claimed: false,
                    }));
                }
                Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => {
                    if let Some(seen) = observe(&dir)
                        && seen.stale
                        && let Some(lock) = claim_stale(&dir, &seen.identity)
                    {
                        return Ok(Some(lock));
                    }
                    // Another claimer holds the marker, or the directory was
                    // replaced: wait like for any other held lock.
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

/// Take over a stale lock in place: become the owner of the existing
/// directory, never removing or renaming it from under a live holder.
fn claim_stale(dir: &Path, observed: &Identity) -> Option<ConfigLock> {
    let marker = dir.join(CLAIM);
    // A claimer that crashed leaves its marker behind; once the marker is as
    // old as a stale lock, it is nobody's and may be cleared.
    if observe(&marker).is_some_and(|m| m.stale) {
        let _ = std::fs::remove_dir(&marker);
    }
    if std::fs::create_dir(&marker).is_err() {
        // Another waiter claimed it first, or it vanished: back to waiting.
        return None;
    }
    // Creating the marker refreshed the directory's mtime, so other waiters
    // now see a fresh lock; make sure it is still the stale instance seen.
    match observe(dir) {
        Some(current) if current.identity == *observed => Some(ConfigLock {
            dir: dir.to_path_buf(),
            claimed: true,
        }),
        _ => {
            let _ = std::fs::remove_dir(&marker);
            None
        }
    }
}

impl Drop for ConfigLock {
    fn drop(&mut self) {
        if self.claimed {
            let _ = std::fs::remove_dir(self.dir.join(CLAIM));
        }
        let _ = std::fs::remove_dir(&self.dir);
    }
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

    /// Age a directory's mtime; opening a directory needs backup semantics
    /// on Windows, where `File::open` on a directory is refused.
    fn age_dir(dir: &Path, by: Duration) {
        #[cfg(windows)]
        let file = {
            use std::os::windows::fs::OpenOptionsExt as _;
            const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
            std::fs::OpenOptions::new()
                .read(true)
                .custom_flags(FILE_FLAG_BACKUP_SEMANTICS)
                .open(dir)
                .expect("open the directory with backup semantics")
        };
        #[cfg(not(windows))]
        let file = std::fs::File::open(dir).expect("open the directory");
        file.set_modified(SystemTime::now() - by)
            .expect("set the lock's mtime into the past");
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
    fn a_stale_lock_is_taken_over_in_place_and_released_fully() {
        let config = temp_config("stale");
        let dir = lock_dir(&config);
        std::fs::create_dir(&dir).unwrap();
        age_dir(&dir, STALE_AFTER + Duration::from_secs(5));
        let guard = ConfigLock::acquire(&config, Duration::from_millis(200)).unwrap();
        assert!(guard.is_some(), "a stale lock must not block a writer");
        assert!(
            dir.join(CLAIM).is_dir(),
            "taken over in place with the marker"
        );
        drop(guard);
        assert!(!dir.exists());
        let _ = std::fs::remove_dir_all(config.parent().unwrap());
    }

    #[test]
    fn a_taken_over_lock_looks_fresh_to_the_next_waiter() {
        let config = temp_config("fresh");
        let dir = lock_dir(&config);
        std::fs::create_dir(&dir).unwrap();
        age_dir(&dir, STALE_AFTER + Duration::from_secs(5));
        let owner = ConfigLock::acquire(&config, Duration::from_millis(200))
            .unwrap()
            .unwrap();
        let late = ConfigLock::acquire(&config, Duration::from_millis(100)).unwrap();
        assert!(late.is_none());
        assert!(dir.is_dir(), "the owner's lock survives the late waiter");
        drop(owner);
        let _ = std::fs::remove_dir_all(config.parent().unwrap());
    }

    #[test]
    fn only_one_claimer_wins_a_stale_lock_and_the_loser_keeps_polling() {
        let config = temp_config("claimed");
        let dir = lock_dir(&config);
        std::fs::create_dir(&dir).unwrap();
        age_dir(&dir, STALE_AFTER + Duration::from_secs(5));
        // Another waiter claimed it just now (a fresh marker).
        std::fs::create_dir(dir.join(CLAIM)).unwrap();
        let started = Instant::now();
        let guard = ConfigLock::acquire(&config, Duration::from_millis(100)).unwrap();
        assert!(guard.is_none());
        // No busy spin: the deadline was honoured, not skipped.
        assert!(started.elapsed() >= Duration::from_millis(100));
        assert!(dir.join(CLAIM).is_dir());
        let _ = std::fs::remove_dir_all(config.parent().unwrap());
    }

    #[test]
    fn a_marker_left_by_a_crashed_claimer_is_cleared() {
        let config = temp_config("deadclaim");
        let dir = lock_dir(&config);
        std::fs::create_dir(&dir).unwrap();
        std::fs::create_dir(dir.join(CLAIM)).unwrap();
        age_dir(&dir.join(CLAIM), STALE_AFTER + Duration::from_secs(5));
        age_dir(&dir, STALE_AFTER + Duration::from_secs(5));
        let guard = ConfigLock::acquire(&config, Duration::from_millis(200)).unwrap();
        assert!(guard.is_some(), "a dead claimer must not wedge the lock");
        drop(guard);
        assert!(!dir.exists());
        let _ = std::fs::remove_dir_all(config.parent().unwrap());
    }

    #[test]
    fn a_claim_on_a_replaced_directory_is_withdrawn() {
        let config = temp_config("replaced");
        let dir = lock_dir(&config);
        std::fs::create_dir(&dir).unwrap();
        age_dir(&dir, STALE_AFTER + Duration::from_secs(5));
        let stale = observe(&dir).unwrap().identity;
        // The stale holder releases and a fresh writer re-creates the lock.
        std::fs::remove_dir(&dir).unwrap();
        std::fs::create_dir(&dir).unwrap();
        let claim = claim_stale(&dir, &stale);
        assert!(claim.is_none(), "the fresh lock belongs to someone else");
        assert!(!dir.join(CLAIM).exists(), "the marker is withdrawn");
        assert!(dir.is_dir());
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
