//! Native plugin host for loading and running Rust plugins

use std::ffi::c_void;
use std::path::Path;

use libloading::{Library, Symbol};
use tauri::{AppHandle, Emitter};

use crate::error::Error;

/// ABI version - must match yaof-plugin
const ABI_VERSION: u32 = 1;

/// C-compatible plugin vtable (must match yaof-plugin::abi)
#[repr(C)]
struct PluginVTable {
    abi_version: u32,
    init: unsafe extern "C" fn(*mut PluginContext) -> i32,
    tick: Option<unsafe extern "C" fn(*mut PluginContext) -> i32>,
    shutdown: unsafe extern "C" fn(*mut PluginContext) -> i32,
    handle_message:
        Option<unsafe extern "C" fn(*mut PluginContext, *const u8, usize, *const u8, usize) -> i32>,
}

/// Context passed to native plugins
#[repr(C)]
struct PluginContext {
    host_data: *mut c_void,
    emit_event: unsafe extern "C" fn(*mut c_void, *const u8, usize, *const u8, usize) -> i32,
    log: unsafe extern "C" fn(*mut c_void, u32, *const u8, usize),
}

/// Host data stored in the context
struct HostData {
    app: AppHandle,
    plugin_id: String,
}

/// Hosts a native plugin
pub struct NativePluginHost {
    _library: Library,
    vtable: &'static PluginVTable,
    context: Box<PluginContext>,
    host_data: Box<HostData>,
}

// SAFETY: NativePluginHost is safe to send between threads because:
// - The Library is thread-safe (libloading guarantees this)
// - The vtable is a static reference
// - The context and host_data are owned by this struct and only accessed through &mut self
// - The raw pointers in PluginContext point to memory owned by this struct
unsafe impl Send for NativePluginHost {}
unsafe impl Sync for NativePluginHost {}

impl NativePluginHost {
    /// Load a native plugin from a dynamic library
    pub fn load(path: &Path, plugin_id: String, app: AppHandle) -> Result<Self, Error> {
        // Load the library
        let library = unsafe { Library::new(path) }
            .map_err(|e| Error::PluginNotFound(format!("Failed to load library: {}", e)))?;

        // Get the vtable symbol
        let vtable: Symbol<*const PluginVTable> = unsafe { library.get(b"YAOF_PLUGIN") }
            .map_err(|e| Error::PluginNotFound(format!("Symbol not found: {}", e)))?;

        let vtable: &'static PluginVTable = unsafe { &**vtable };

        // Check ABI version
        if vtable.abi_version != ABI_VERSION {
            return Err(Error::PluginNotFound(format!(
                "ABI version mismatch: expected {}, got {}",
                ABI_VERSION, vtable.abi_version
            )));
        }

        // Create host data
        let mut host_data = Box::new(HostData { app, plugin_id });

        // Create context
        let mut context = Box::new(PluginContext {
            host_data: host_data.as_mut() as *mut HostData as *mut c_void,
            emit_event: emit_event_callback,
            log: log_callback,
        });

        // Initialize the plugin
        let result = unsafe { (vtable.init)(context.as_mut()) };
        if result != 0 {
            return Err(Error::PluginNotFound(format!(
                "Plugin init returned error code: {}",
                result
            )));
        }

        Ok(Self {
            _library: library,
            vtable,
            context,
            host_data,
        })
    }

    /// Call the plugin's tick function
    pub fn tick(&mut self) -> i32 {
        if let Some(tick) = self.vtable.tick {
            unsafe { tick(self.context.as_mut()) }
        } else {
            0
        }
    }

    /// Send a message to the plugin
    pub fn send_message(&mut self, msg_type: &str, payload: &[u8]) -> i32 {
        if let Some(handle_message) = self.vtable.handle_message {
            unsafe {
                handle_message(
                    self.context.as_mut(),
                    msg_type.as_ptr(),
                    msg_type.len(),
                    payload.as_ptr(),
                    payload.len(),
                )
            }
        } else {
            0
        }
    }
}

impl Drop for NativePluginHost {
    fn drop(&mut self) {
        unsafe {
            (self.vtable.shutdown)(self.context.as_mut());
        }
    }
}

// Callback for plugins to emit events
unsafe extern "C" fn emit_event_callback(
    host_data: *mut c_void,
    event_name: *const u8,
    event_name_len: usize,
    payload: *const u8,
    payload_len: usize,
) -> i32 {
    unsafe {
        let host = &*(host_data as *const HostData);
        let event_name =
            std::str::from_utf8_unchecked(std::slice::from_raw_parts(event_name, event_name_len));
        let payload = std::slice::from_raw_parts(payload, payload_len);

        // Parse payload as JSON
        let payload_json: serde_json::Value = match serde_json::from_slice(payload) {
            Ok(v) => v,
            Err(_) => return -1,
        };

        // Emit to the service event channel that useService listens on
        // Format: yaof:service:{event_name} - this matches what the SDK's useService hook expects
        let full_event = format!("yaof:service:{}", event_name);
        match host.app.emit(&full_event, payload_json) {
            Ok(_) => 0,
            Err(_) => -1,
        }
    }
}

// Callback for plugins to log messages
unsafe extern "C" fn log_callback(
    host_data: *mut c_void,
    level: u32,
    message: *const u8,
    message_len: usize,
) {
    unsafe {
        let host = &*(host_data as *const HostData);
        let message =
            std::str::from_utf8_unchecked(std::slice::from_raw_parts(message, message_len));

        let level_str = match level {
            0 => "TRACE",
            1 => "DEBUG",
            2 => "INFO",
            3 => "WARN",
            4 => "ERROR",
            _ => "UNKNOWN",
        };

        println!("[{}][{}] {}", host.plugin_id, level_str, message);
    }
}
