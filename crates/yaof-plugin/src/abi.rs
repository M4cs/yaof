use std::ffi::c_void;

pub const ABI_VERSION: u32 = 1;

#[repr(C)]
pub struct PluginVTable {
    pub abi_version: u32,

    /// Called when plugin is loaded
    /// Returns 0 on success, non-zero on error
    pub init: unsafe extern "C" fn(ctx: *mut PluginContext) -> i32,

    /// Called periodically (configurable interval)
    /// Returns 0 on success, non-zero on error
    pub tick: Option<unsafe extern "C" fn(ctx: *mut PluginContext) -> i32>,

    /// Called when plugin is unloaded
    pub shutdown: unsafe extern "C" fn(cts: *mut PluginContext) -> i32,

    /// Handle a message from the frontend
    /// Returns 0 on success, non-zero on error
    pub handle_message: Option<
        unsafe extern "C" fn(
            ctx: *mut PluginContext,
            msg_type: *const u8,
            msg_type_len: usize,
            payload: *const u8,
            payload_len: usize,
        ) -> i32,
    >,
}

#[repr(C)]
pub struct PluginContext {
    /// Opaque pointer to host data
    pub host_data: *mut c_void,

    /// Emit an event to subscribed frontends
    pub emit_event: unsafe extern "C" fn(
        host_data: *mut c_void,
        event_name: *const u8,
        event_name_len: usize,
        payload: *const u8,
        payload_len: usize,
    ) -> i32,

    /// Log a message
    pub log: unsafe extern "C" fn(
        host_data: *mut c_void,
        level: u32,
        message: *const u8,
        message_len: usize,
    ),
}

pub const PLUGIN_SYMBOL: &str = "YAOF_PLUGIN";
