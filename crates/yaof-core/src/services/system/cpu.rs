//! CPU monitoring service

use sysinfo::System;

use super::CpuStatus;

/// Service for monitoring CPU usage
pub struct CpuService {
    system: System,
}

impl CpuService {
    pub fn new() -> Self {
        let mut system = System::new();
        // Initial refresh to get baseline
        system.refresh_cpu_all();
        Self { system }
    }

    /// Get current CPU status
    pub fn get_status(&mut self) -> CpuStatus {
        // Refresh CPU info
        self.system.refresh_cpu_all();

        // Calculate average CPU usage across all cores
        let cpus = self.system.cpus();
        let total_usage: f32 = cpus.iter().map(|cpu| cpu.cpu_usage()).sum();
        let avg_usage = if cpus.is_empty() {
            0.0
        } else {
            total_usage / cpus.len() as f32
        };

        CpuStatus { usage: avg_usage }
    }
}

impl Default for CpuService {
    fn default() -> Self {
        Self::new()
    }
}
