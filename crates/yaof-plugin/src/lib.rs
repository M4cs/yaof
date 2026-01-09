pub mod abi;
pub mod context;

pub use abi::*;
pub use context::*;
pub use serde;
pub use serde_json;

/// Declare a YAOF plugin
///
/// # Example
/// ```ignore
/// use yaof_plugin::{declare_plugin, Context};
///
/// struct MyPlugin {
///     counter: u32,
/// }
///
/// impl MyPlugin {
///     fn new() -> Self {
///         Self { counter: 0 }
///     }
/// }
///
/// declare_plugin!(MyPlugin, |ctx| {
///     ctx.info("MyPlugin initialized!");
///     Ok(MyPlugin::new())
/// });
/// ```
///

#[macro_export]
macro_rules! declare_plugin {
    ($plugin_type:ty, $init:expr) => {
        static mut PLUGIN_INSTANCE: Option<$plugin_type> = None;

        #[unsafe(no_mangle)]
        pub static YAOF_PLUGIN: $crate::PluginVTable = $crate::PluginVTable {
            abi_version: $crate::ABI_VERSION,
            init: __yaof_init,
            tick: Some(__yaof_tick),
            shutdown: __yaof_shutdown,
            handle_message: Some(__yaof_handle_message),
        };

        unsafe extern "C" fn __yaof_init(ctx: *mut $crate::PluginContext) -> i32 {
            let context = $crate::Context::from_raw(ctx);
            let init_fn: fn(&$crate::Context) -> Result<$plugin_type, i32> = $init;

            match init_fn(&context) {
                Ok(plugin) => {
                    PLUGIN_INSTANCE = Some(plugin);
                    0
                }
                Err(code) => code,
            }
        }

        unsafe extern "C" fn __yaof_tick(ctx: *mut $crate::PluginContext) -> i32 {
            if let Some(ref mut plugin) = PLUGIN_INSTANCE {
                let context = $crate::Context::from_raw(ctx);
                plugin.tick(&context)
            } else {
                -1
            }
        }

        unsafe extern "C" fn __yaof_shutdown(ctx: *mut $crate::PluginContext) -> i32 {
            if let Some(ref mut plugin) = PLUGIN_INSTANCE {
                let context = $crate::Context::from_raw(ctx);
                plugin.shutdown(&context);
            }
            PLUGIN_INSTANCE = None;
            0
        }

        unsafe extern "C" fn __yaof_handle_message(
            ctx: *mut $crate::PluginContext,
            msg_type: *const u8,
            msg_type_len: usize,
            payload: *const u8,
            payload_len: usize,
        ) -> i32 {
            if let Some(ref mut plugin) = PLUGIN_INSTANCE {
                let context = $crate::Context::from_raw(ctx);
                let msg_type = std::str::from_utf8_unchecked(std::slice::from_raw_parts(
                    msg_type,
                    msg_type_len,
                ));
                let payload = std::slice::from_raw_parts(payload, payload_len);
                plugin.handle_message(&context, msg_type, payload)
            } else {
                -1
            }
        }
    };
}

/// Trait that native plugins should implement
pub trait NativePlugin: Send + Sync {
    /// Called on each tick interval
    fn tick(&mut self, ctx: &Context) -> i32 {
        0
    }

    /// Called when plugin is being unloaded
    fn shutdown(&mut self, ctx: &Context) {}

    /// Handle a message from the frontend
    fn handle_message(&mut self, ctx: &Context, msg_type: &str, payload: &[u8]) -> i32 {
        0
    }
}
