//! `buddy.exe` carries the app icon. GPUI's Windows backend takes the
//! window-class icon (taskbar, Alt+Tab) from icon resource 1 of the running
//! executable and falls back to the default Windows icon without it.
#![cfg(windows)]

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;

use windows_sys::Win32::Foundation::{FreeLibrary, HMODULE};
use windows_sys::Win32::System::LibraryLoader::{
    EnumResourceNamesW, FindResourceW, LOAD_LIBRARY_AS_DATAFILE, LOAD_LIBRARY_AS_IMAGE_RESOURCE,
    LoadLibraryExW,
};
use windows_sys::core::BOOL;

const RT_ICON: u16 = 3;
const RT_GROUP_ICON: u16 = 14;

/// `MAKEINTRESOURCEW`.
fn int_resource(id: u16) -> *const u16 {
    id as usize as *const u16
}

unsafe extern "system" fn count_names(
    _module: HMODULE,
    _kind: *const u16,
    _name: *const u16,
    count: isize,
) -> BOOL {
    // SAFETY: `count` is the `&mut usize` passed to `EnumResourceNamesW` below.
    unsafe { *(count as *mut usize) += 1 };
    1
}

#[test]
fn buddy_exe_embeds_the_app_icon() {
    let exe: Vec<u16> = OsStr::new(env!("CARGO_BIN_EXE_buddy"))
        .encode_wide()
        .chain(Some(0))
        .collect();
    // SAFETY: a NUL-terminated path; loaded as data only, never executed.
    let module = unsafe {
        LoadLibraryExW(
            exe.as_ptr(),
            std::ptr::null_mut(),
            LOAD_LIBRARY_AS_DATAFILE | LOAD_LIBRARY_AS_IMAGE_RESOURCE,
        )
    };
    assert!(!module.is_null(), "could not open buddy.exe's resources");
    // SAFETY: `module` is a valid data-file module until `FreeLibrary`.
    let group = unsafe { FindResourceW(module, int_resource(1), int_resource(RT_GROUP_ICON)) };
    let mut images = 0usize;
    // SAFETY: as above; the callback only increments `images`.
    unsafe {
        EnumResourceNamesW(
            module,
            int_resource(RT_ICON),
            Some(count_names),
            &mut images as *mut usize as isize,
        );
        FreeLibrary(module);
    }

    let ico = std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../public/icon.ico"
    ))
    .expect("read public/icon.ico");
    let ico_images = usize::from(u16::from_le_bytes([ico[4], ico[5]]));
    assert!(
        !group.is_null(),
        "buddy.exe has no icon resource 1, so Windows shows its default icon"
    );
    assert_eq!(
        images, ico_images,
        "buddy.exe should embed every image of public/icon.ico"
    );
}
