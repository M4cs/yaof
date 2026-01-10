use crate::abi::PluginContext;

pub struct Context {
    inner: *mut PluginContext,
}

impl Context {
    pub unsafe fn from_raw(ptr: *mut PluginContext) -> Self {
        Self { inner: ptr }
    }

    pub fn emit(&self, event_name: &str, payload: &serde_json::Value) -> Result<(), i32> {
        let payload_str = serde_json::to_string(payload).unwrap_or_default();

        unsafe {
            let ctx = &*self.inner;
            let result = (ctx.emit_event)(
                ctx.host_data,
                event_name.as_ptr(),
                event_name.len(),
                payload_str.as_ptr(),
                payload_str.len(),
            );

            if result == 0 { Ok(()) } else { Err(result) }
        }
    }

    pub fn trace(&self, message: &str) {
        self.log_internal(0, message);
    }

    pub fn debug(&self, message: &str) {
        self.log_internal(1, message);
    }

    pub fn info(&self, message: &str) {
        self.log_internal(2, message);
    }

    pub fn warn(&self, message: &str) {
        self.log_internal(3, message);
    }

    pub fn error(&self, message: &str) {
        self.log_internal(4, message);
    }

    fn log_internal(&self, level: u32, message: &str) {
        unsafe {
            let ctx = &*self.inner;
            (ctx.log)(ctx.host_data, level, message.as_ptr(), message.len())
        }
    }
}

unsafe impl Send for Context {}
unsafe impl Sync for Context {}
