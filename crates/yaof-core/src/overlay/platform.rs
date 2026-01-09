//! Platform-specific overlay window configuration
//!
//! This module handles configuring overlay windows to:
//! - Stay below the menu bar but above normal windows on macOS
//! - Persist across all virtual desktops/spaces
//! - Stay always on top of other windows
//! - Allow positioning in the notch/menu bar area (unconstrained)
//! - Properly handle click-through without causing focus changes

use tauri::WebviewWindow;

use crate::Error;

/// Configure an overlay window with platform-specific settings
///
/// This sets up the window to behave as a proper overlay:
/// - Floating window level (above normal windows, below menu bar)
/// - Visible on all virtual desktops/spaces
/// - Doesn't appear in window switchers
/// - Proper click-through handling when enabled
pub fn configure_overlay(window: &WebviewWindow, click_through: bool) -> Result<(), Error> {
    println!(
        "[Platform] configure_overlay called, click_through: {}",
        click_through
    );

    #[cfg(target_os = "macos")]
    {
        println!("[Platform] Running macOS-specific configuration...");
        configure_overlay_macos(window, click_through)?;
        println!("[Platform] macOS configuration completed");
    }

    #[cfg(target_os = "windows")]
    {
        println!("[Platform] Running Windows-specific configuration...");
        configure_overlay_windows(window, click_through)?;
        println!("[Platform] Windows configuration completed");
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        println!("[Platform] No platform-specific configuration needed");
        // Linux and other platforms - no special configuration needed
        // The always_on_top setting from Tauri should be sufficient
        let _ = window;
        let _ = click_through;
    }

    Ok(())
}

/// macOS-specific overlay configuration
#[cfg(target_os = "macos")]
fn configure_overlay_macos(window: &WebviewWindow, click_through: bool) -> Result<(), Error> {
    println!("[Platform/macOS] configure_overlay_macos starting...");

    use objc2::rc::Retained;
    use objc2_app_kit::{
        NSAccessibility, NSAccessibilityFloatingWindowSubrole, NSMainMenuWindowLevel,
        NSStatusWindowLevel, NSWindow, NSWindowCollectionBehavior, NSWindowLevel,
    };

    // Get the native NSWindow handle using the raw window handle
    // Tauri's WebviewWindow provides access to the underlying NSWindow via raw-window-handle
    println!("[Platform/macOS] Getting NSWindow handle...");
    let ns_window_ptr = window
        .ns_window()
        .map_err(|e| Error::WindowCreation(format!("Failed to get NSWindow handle: {}", e)))?;
    println!(
        "[Platform/macOS] NSWindow handle obtained: {:?}",
        ns_window_ptr
    );

    // Convert raw pointer to Retained<NSWindow>
    // SAFETY: The pointer is valid as long as the window exists, and we're
    // retaining it to ensure it stays valid during our operations
    println!("[Platform/macOS] Converting to Retained<NSWindow>...");
    let ns_window: Retained<NSWindow> = unsafe { Retained::retain(ns_window_ptr as *mut NSWindow) }
        .ok_or_else(|| Error::WindowCreation("NSWindow pointer was null".to_string()))?;
    println!("[Platform/macOS] Retained<NSWindow> created successfully");

    // Set window level to status window level (25)
    // This is above normal windows and floating windows, but below the menu bar (level 24)
    // Status window level is appropriate for overlay widgets that should stay visible
    // but not interfere with system UI
    // CGWindowLevelForKey(kCGStatusWindowLevelKey) = 25
    println!("[Platform/macOS] Setting window level...");
    let status_window_level: NSWindowLevel = NSMainMenuWindowLevel;
    ns_window.setLevel(status_window_level);
    println!("[Platform/macOS] Window level set");

    if click_through {
        println!("[Platform/macOS] Applying click-through settings...");
        // For true click-through behavior, we need multiple settings:
        // 1. Ignore all mouse events - clicks pass through to windows below
        ns_window.setIgnoresMouseEvents(true);
        println!("[Platform/macOS]   - setIgnoresMouseEvents(true)");

        // 2. Don't accept mouse moved events - prevents hover tracking
        ns_window.setAcceptsMouseMovedEvents(false);
        println!("[Platform/macOS]   - setAcceptsMouseMovedEvents(false)");

        // 3. Remove shadow - shadows can sometimes intercept clicks
        ns_window.setHasShadow(false);
        println!("[Platform/macOS]   - setHasShadow(false)");
    }

    // Set collection behavior for overlay windows:
    // - CanJoinAllSpaces: Window appears on ALL virtual desktops/spaces
    // - Stationary: Window stays in place during Mission Control/Exposé
    // - IgnoresCycle: Doesn't appear in Cmd+Tab window switcher
    // - FullScreenAuxiliary: Can appear alongside fullscreen apps
    // - Transient: Window is transient and should NOT be managed by window managers (yabai, etc.)
    println!("[Platform/macOS] Setting collection behavior...");
    let behavior = NSWindowCollectionBehavior::CanJoinAllSpaces
        | NSWindowCollectionBehavior::Stationary
        | NSWindowCollectionBehavior::IgnoresCycle
        | NSWindowCollectionBehavior::FullScreenAuxiliary
        | NSWindowCollectionBehavior::Transient;

    ns_window.setCollectionBehavior(behavior);
    println!("[Platform/macOS] Collection behavior set");

    println!("[Platform/macOS] Setting accessibility subrole...");
    unsafe {
        use objc2_app_kit::NSAccessibilitySystemDialogSubrole;

        ns_window.setAccessibilitySubrole(Some(NSAccessibilitySystemDialogSubrole));
    }
    println!("[Platform/macOS] Accessibility subrole set");

    println!("[Platform/macOS] configure_overlay_macos completed successfully");
    Ok(())
}

/// Set window position without macOS frame constraining and show the window
///
/// This function positions a window using absolute screen coordinates,
/// bypassing macOS's automatic frame constraining that normally prevents
/// windows from being placed in the menu bar/notch area.
///
/// The coordinates use the standard macOS coordinate system where:
/// - (0, 0) is at the bottom-left of the primary screen
/// - Y increases upward
///
/// For convenience, this function accepts top-left origin coordinates
/// (like Tauri uses) and converts them internally.
///
/// This function dispatches the work to the main thread to ensure
/// thread safety with macOS window operations. The window is made
/// visible AFTER positioning to prevent visual glitches.
#[cfg(target_os = "macos")]
pub fn set_unconstrained_position(
    window: &WebviewWindow,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), Error> {
    // Get the native NSWindow handle pointer (this is safe to get from any thread)
    let ns_window_ptr = window
        .ns_window()
        .map_err(|e| Error::WindowCreation(format!("Failed to get NSWindow handle: {}", e)))?;

    // Convert pointer to usize for thread-safe transfer
    // SAFETY: We're just storing the address as a number, and will convert it back
    // on the main thread where it's safe to use
    let ptr_addr = ns_window_ptr as usize;

    // Dispatch the actual window positioning to the main thread
    // This is required because macOS window operations must happen on the main thread
    window
        .run_on_main_thread(move || {
            use objc2::MainThreadMarker;
            use objc2::rc::Retained;
            use objc2_app_kit::{NSScreen, NSWindow};
            use objc2_foundation::NSRect;

            // SAFETY: We're now on the main thread (guaranteed by run_on_main_thread)
            let mtm = unsafe { MainThreadMarker::new_unchecked() };

            // Convert usize back to pointer
            // SAFETY: The pointer is valid as long as the window exists
            let ns_window: Option<Retained<NSWindow>> =
                unsafe { Retained::retain(ptr_addr as *mut NSWindow) };

            let Some(ns_window) = ns_window else {
                eprintln!("Failed to retain NSWindow pointer");
                return;
            };

            // Get the main screen to calculate coordinate conversion
            // macOS uses bottom-left origin, but we receive top-left origin coordinates
            let screen_height = NSScreen::mainScreen(mtm)
                .map(|screen| screen.frame().size.height)
                .unwrap_or(1080.0);

            // Convert from top-left origin (Tauri/web style) to bottom-left origin (macOS style)
            // In macOS coordinates: y_macos = screen_height - y_topleft - window_height
            let macos_y = screen_height - y - height;

            // Create the frame rect with the unconstrained position
            let frame = NSRect::new(
                objc2_foundation::NSPoint::new(x, macos_y),
                objc2_foundation::NSSize::new(width, height),
            );

            // Set the frame directly, bypassing any constraining
            // The second parameter (display: false) prevents immediate redraw
            // We'll redraw when we make the window visible
            ns_window.setFrame_display(frame, false);

            // Now make the window visible after positioning
            // This prevents the window from appearing in the wrong position first
            ns_window.orderFront(None);
        })
        .map_err(|e| Error::WindowCreation(format!("Failed to run on main thread: {}", e)))?;

    Ok(())
}

/// No-op for non-macOS platforms - they don't have the same constraining issues
#[cfg(not(target_os = "macos"))]
pub fn set_unconstrained_position(
    _window: &WebviewWindow,
    _x: f64,
    _y: f64,
    _width: f64,
    _height: f64,
) -> Result<(), Error> {
    // On non-macOS platforms, the standard positioning should work fine
    // The window position is already set by Tauri's WebviewWindowBuilder
    Ok(())
}

/// Windows-specific overlay configuration
#[cfg(target_os = "windows")]
fn configure_overlay_windows(window: &WebviewWindow, click_through: bool) -> Result<(), Error> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GWL_EXSTYLE, GetWindowLongPtrW, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SetWindowLongPtrW,
        SetWindowPos, WS_EX_LAYERED, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
    };

    // Get the native HWND handle
    let hwnd = window
        .hwnd()
        .map_err(|e| Error::WindowCreation(format!("Failed to get HWND handle: {}", e)))?;

    unsafe {
        let hwnd = HWND(hwnd.0);

        // Add WS_EX_TOOLWINDOW style to prevent the window from appearing
        // in the taskbar and Alt+Tab switcher
        let mut ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        ex_style |= WS_EX_TOOLWINDOW.0 as isize;

        // If click-through is enabled, add WS_EX_LAYERED and WS_EX_TRANSPARENT
        // to make the window truly click-through without focus changes
        if click_through {
            ex_style |= WS_EX_LAYERED.0 as isize;
            ex_style |= WS_EX_TRANSPARENT.0 as isize;
        }

        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_style);

        // Ensure the window is topmost
        SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE,
        )
        .map_err(|e| Error::WindowCreation(format!("Failed to set window position: {}", e)))?;

        // Note: Pinning to all virtual desktops on Windows requires the
        // IVirtualDesktopPinnedApps COM interface which is more complex.
        // The HWND_TOPMOST flag should keep the window visible across
        // desktop switches in most cases.
    }

    Ok(())
}
