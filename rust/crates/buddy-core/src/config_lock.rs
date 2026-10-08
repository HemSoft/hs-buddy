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
//!   back to waiting. A marker that is itself stale belongs to a claimer
//!   that crashed too; it is never removed, it is claimed the same way one
//!   level down (`claim/claim`), so no waiter ever deletes or renames
//!   anything it does not own and a live lock or claim cannot be stolen;
//! - ownership: a holder can ask whether the lock is still the instance it
//!   created or claimed ([`ConfigLock::is_held`]); a process suspended
//!   longer than the stale window has lost it. The caller's size+mtime
//!   stamp check then refuses the write, so a stolen lock cannot lose one;
//! - release: the holder removes its marker (if any) and the directory;
//! - bounded: a writer that cannot acquire within the timeout proceeds
//!   anyway (logged), because a wedged lock must never freeze either app.
//!   Electron's critical section is one synchronous file write, so the wait
//!   here is short; it runs on the GPUI thread only under actual contention.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime};

/// A holder that has not touched its lock for this long is presumed dead.
/// Long enough that a process suspended for a while keeps its lock; short
/// enough that a crashed holder costs writers only a brief spell of unlocked
/// writes.
pub const STALE_AFTER: Duration = Duration::from_secs(30);
/// How long a writer waits for the lock before proceeding unlocked.
pub const DEFAULT_TIMEOUT: Duration = Duration::from_millis(500);
const POLL: Duration = Duration::from_millis(10);
const CLAIM: &str = "claim";

/// Holds the lock; dropping it releases.
#[derive(Debug)]
pub struct ConfigLock {
    /// The lock directory, then each claim marker down to the one owned.
    chain: Vec<PathBuf>,
    /// The owned level as it was when acquired.
    identity: Option<Identity>,
}

/// Consecutive crashed claimers nest one level each; deeper than this, wait.
const MAX_CLAIM_DEPTH: usize = 8;

enum Claim {
    Owned(ConfigLock),
    /// A live holder or claimer is ahead: wait.
    Held,
    /// A level vanished underneath (its owner released it) or cannot be
    /// observed: wait and try again.
    Retry,
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
                Ok(()) => return Ok(Some(Self::owned(vec![dir]))),
                Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => {
                    if let Claim::Owned(lock) = claim_stale(&dir) {
                        return Ok(Some(lock));
                    }
                    // Held by a live holder or claimer, or not observable at
                    // all (a dangling symlink at the lock path, say): wait
                    // like for any other lock, so the deadline always applies.
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
/// directory (or, below a crashed claimer's marker, of a deeper marker),
/// never removing or renaming anything from under a live holder.
fn claim_stale(dir: &Path) -> Claim {
    let mut chain = vec![dir.to_path_buf()];
    for _ in 0..MAX_CLAIM_DEPTH {
        let level = chain
            .last()
            .expect("chain starts with the lock dir")
            .clone();
        let Some(seen) = observe(&level) else {
            return Claim::Retry;
        };
        if !seen.stale {
            return Claim::Held;
        }
        let marker = level.join(CLAIM);
        match std::fs::create_dir(&marker) {
            Ok(()) => {
                // Creating the marker refreshed the level's mtime, so other
                // waiters now see it fresh; keep it only if the level is
                // still the instance that was observed.
                return match observe(&level) {
                    Some(current) if current.identity == seen.identity => {
                        chain.push(marker);
                        Claim::Owned(ConfigLock::owned(chain))
                    }
                    Some(_) => {
                        let _ = std::fs::remove_dir(&marker);
                        Claim::Held
                    }
                    None => {
                        let _ = std::fs::remove_dir(&marker);
                        Claim::Retry
                    }
                };
            }
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => {
                // A marker exists: fresh means a live claimer is ahead;
                // stale means it belongs to a crashed one and is claimed
                // one level down.
                chain.push(marker);
            }
            Err(_) => return Claim::Held,
        }
    }
    Claim::Held
}

impl ConfigLock {
    fn owned(chain: Vec<PathBuf>) -> Self {
        let identity = chain.last().and_then(|p| observe(p)).map(|o| o.identity);
        Self { chain, identity }
    }

    /// Whether the lock is still the instance this holder created or
    /// claimed. False once a waiter took it over (this process was suspended
    /// past the stale window) or it vanished.
    pub fn is_held(&self) -> bool {
        let Some(owned) = self.chain.last() else {
            return false;
        };
        match (&self.identity, observe(owned)) {
            // A takeover leaves the directory in place and nests a marker
            // inside it.
            (Some(mine), Some(current)) => current.identity == *mine && !owned.join(CLAIM).exists(),
            _ => false,
        }
    }
}

impl Drop for ConfigLock {
    /// Remove the chain deepest first; stop at the first level that is not
    /// empty (a later claimer nested below after this lock went stale).
    /// A lock that is no longer ours (taken over while this process was
    /// suspended) is left alone: removing it would strip the new holder.
    fn drop(&mut self) {
        if self.identity.is_some() && !self.is_held() {
            return;
        }
        for level in self.chain.iter().rev() {
            if std::fs::remove_dir(level).is_err() {
                return;
            }
        }
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
            // A directory handle needs backup semantics to open at all and
            // write-attributes access for `set_modified` to succeed.
            const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
            const FILE_READ_ATTRIBUTES: u32 = 0x0080;
            const FILE_WRITE_ATTRIBUTES: u32 = 0x0100;
            std::fs::OpenOptions::new()
                .access_mode(FILE_READ_ATTRIBUTES | FILE_WRITE_ATTRIBUTES)
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
    fn a_marker_left_by_a_crashed_claimer_is_claimed_one_level_down() {
        let config = temp_config("deadclaim");
        let dir = lock_dir(&config);
        std::fs::create_dir(&dir).unwrap();
        std::fs::create_dir(dir.join(CLAIM)).unwrap();
        age_dir(&dir.join(CLAIM), STALE_AFTER + Duration::from_secs(5));
        age_dir(&dir, STALE_AFTER + Duration::from_secs(5));
        let guard = ConfigLock::acquire(&config, Duration::from_millis(200)).unwrap();
        assert!(guard.is_some(), "a dead claimer must not wedge the lock");
        // Nothing of the dead claimer was removed; the takeover nested below.
        assert!(dir.join(CLAIM).join(CLAIM).is_dir());
        drop(guard);
        assert!(!dir.exists(), "the whole chain is released");
        let _ = std::fs::remove_dir_all(config.parent().unwrap());
    }

    #[test]
    fn a_live_claimer_below_a_dead_one_is_not_disturbed() {
        let config = temp_config("nested");
        let dir = lock_dir(&config);
        std::fs::create_dir(&dir).unwrap();
        std::fs::create_dir(dir.join(CLAIM)).unwrap();
        age_dir(&dir.join(CLAIM), STALE_AFTER + Duration::from_secs(5));
        age_dir(&dir, STALE_AFTER + Duration::from_secs(5));
        // A live claimer already nested below the dead one (fresh marker).
        std::fs::create_dir(dir.join(CLAIM).join(CLAIM)).unwrap();
        let started = Instant::now();
        let guard = ConfigLock::acquire(&config, Duration::from_millis(100)).unwrap();
        assert!(guard.is_none());
        assert!(started.elapsed() >= Duration::from_millis(100));
        assert!(dir.join(CLAIM).join(CLAIM).is_dir());
        let _ = std::fs::remove_dir_all(config.parent().unwrap());
    }

    #[test]
    fn a_fresh_directory_is_never_claimed() {
        let config = temp_config("replaced");
        let dir = lock_dir(&config);
        // The stale holder released and a fresh writer re-created the lock.
        std::fs::create_dir(&dir).unwrap();
        assert!(matches!(claim_stale(&dir), Claim::Held));
        assert!(!dir.join(CLAIM).exists(), "no marker is left behind");
        assert!(dir.is_dir());
        let _ = std::fs::remove_dir_all(config.parent().unwrap());
    }

    #[test]
    fn a_vanished_directory_asks_for_a_retry() {
        let config = temp_config("vanished");
        let dir = lock_dir(&config);
        assert!(matches!(claim_stale(&dir), Claim::Retry));
        let _ = std::fs::remove_dir_all(config.parent().unwrap());
    }

    #[test]
    fn reports_whether_the_lock_is_still_the_instance_created() {
        let config = temp_config("held-check");
        let dir = lock_dir(&config);
        let guard = ConfigLock::acquire(&config, DEFAULT_TIMEOUT)
            .unwrap()
            .unwrap();
        assert!(guard.is_held());
        // Taken over while this process was suspended: released, re-created.
        std::fs::remove_dir(&dir).unwrap();
        std::fs::create_dir(&dir).unwrap();
        assert!(!guard.is_held());
        drop(guard);
        assert!(
            dir.is_dir(),
            "releasing must not strip the new holder's lock"
        );
        let _ = std::fs::remove_dir_all(config.parent().unwrap());
    }

    #[test]
    fn a_nested_claim_means_the_old_holder_lost_the_lock() {
        let config = temp_config("nested-takeover");
        let dir = lock_dir(&config);
        let first = ConfigLock::acquire(&config, DEFAULT_TIMEOUT)
            .unwrap()
            .unwrap();
        assert!(first.is_held());
        // Suspended past the stale window; another writer takes over in place.
        age_dir(&dir, STALE_AFTER + Duration::from_secs(5));
        let second = ConfigLock::acquire(&config, Duration::from_millis(200))
            .unwrap()
            .unwrap();
        assert!(!first.is_held());
        assert!(second.is_held());
        drop(first);
        assert!(
            dir.join(CLAIM).is_dir(),
            "the old holder leaves the new one alone"
        );
        drop(second);
        assert!(!dir.exists());
        let _ = std::fs::remove_dir_all(config.parent().unwrap());
    }

    #[cfg(unix)]
    #[test]
    fn an_unobservable_lock_path_still_honours_the_deadline() {
        let config = temp_config("dangling");
        let dir = lock_dir(&config);
        // A dangling symlink: mkdir says it exists, metadata cannot follow it.
        std::os::unix::fs::symlink(config.with_file_name("gone"), &dir).unwrap();
        let started = Instant::now();
        let guard = ConfigLock::acquire(&config, Duration::from_millis(100)).unwrap();
        assert!(guard.is_none());
        assert!(started.elapsed() >= Duration::from_millis(100));
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
