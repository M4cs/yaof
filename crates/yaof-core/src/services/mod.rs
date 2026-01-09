//! Service registry and system services for yaof
//!
//! This module provides:
//! - ServiceRegistry for plugin-to-plugin communication
//! - Built-in system services (CPU, network, window, desktop, media)
//! - JSON Schema validation for service data

pub mod system;

use std::collections::HashMap;

use jsonschema::Validator;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Information about a service provider
#[derive(Debug, Clone, Serialize)]
pub struct ProviderInfo {
    pub service_id: String,
    pub plugin_id: String,
    pub schema: serde_json::Value,
}

/// Compiled schema validator for a service
pub struct ServiceValidator {
    pub service_id: String,
    pub validator: Validator,
}

impl ServiceValidator {
    /// Create a new validator from a JSON Schema
    pub fn new(service_id: String, schema: &serde_json::Value) -> Result<Self, String> {
        let validator = Validator::new(schema).map_err(|e| format!("Invalid schema: {}", e))?;
        Ok(Self {
            service_id,
            validator,
        })
    }

    /// Validate data against the schema
    pub fn validate(&self, data: &serde_json::Value) -> Result<(), Vec<String>> {
        let result = self.validator.validate(data);
        if result.is_ok() {
            Ok(())
        } else {
            let errors: Vec<String> = self
                .validator
                .iter_errors(data)
                .map(|e| format!("{}: {}", e.instance_path, e))
                .collect();
            Err(errors)
        }
    }
}

/// Registry for service providers and subscribers
pub struct ServiceRegistry {
    providers: HashMap<String, ProviderInfo>,
    validators: HashMap<String, ServiceValidator>,
    subscribers: HashMap<String, Vec<String>>, // service_id -> [window_labels]
    /// Whether to validate service data against schemas (can be disabled for performance)
    pub validate_data: bool,
}

impl ServiceRegistry {
    pub fn new() -> Self {
        Self {
            providers: HashMap::new(),
            validators: HashMap::new(),
            subscribers: HashMap::new(),
            validate_data: true, // Enable validation by default
        }
    }

    /// Register a service provider with optional schema validation
    pub fn register_provider(
        &mut self,
        service_id: String,
        plugin_id: String,
        schema: serde_json::Value,
    ) -> Result<(), String> {
        // Try to compile the schema validator if schema is not empty
        if !schema.is_null() && schema != serde_json::json!({}) {
            match ServiceValidator::new(service_id.clone(), &schema) {
                Ok(validator) => {
                    self.validators.insert(service_id.clone(), validator);
                }
                Err(e) => {
                    eprintln!(
                        "[YAOF] Warning: Failed to compile schema for service {}: {}",
                        service_id, e
                    );
                    // Continue without validation - don't fail registration
                }
            }
        }

        self.providers.insert(
            service_id.clone(),
            ProviderInfo {
                service_id,
                plugin_id,
                schema,
            },
        );

        Ok(())
    }

    /// Unregister a service provider
    pub fn unregister_provider(&mut self, service_id: &str) {
        self.providers.remove(service_id);
        self.subscribers.remove(service_id);
    }

    /// List all registered providers
    pub fn list_providers(&self) -> Vec<ProviderInfo> {
        self.providers.values().cloned().collect()
    }

    /// Subscribe a window to a service
    /// If the service is not registered, it will be auto-registered as a native plugin service
    pub fn subscribe(&mut self, service_id: &str, window_label: &str) -> Result<(), String> {
        // Auto-register the service if it doesn't exist
        // This allows native plugins to emit events without explicit registration
        if !self.providers.contains_key(service_id) {
            self.register_provider(
                service_id.to_string(),
                format!("native:{}", service_id), // Mark as native plugin
                serde_json::json!({}),
            )?;
        }

        self.subscribers
            .entry(service_id.to_string())
            .or_default()
            .push(window_label.to_string());

        Ok(())
    }

    /// Unsubscribe a window from a service
    pub fn unsubscribe(&mut self, service_id: &str, window_label: &str) {
        if let Some(subs) = self.subscribers.get_mut(service_id) {
            subs.retain(|l| l != window_label);
        }
    }

    /// Validate data against a service's schema
    pub fn validate_service_data(
        &self,
        service_id: &str,
        data: &serde_json::Value,
    ) -> Result<(), Vec<String>> {
        if !self.validate_data {
            return Ok(());
        }

        if let Some(validator) = self.validators.get(service_id) {
            validator.validate(data)
        } else {
            // No validator means no schema or schema compilation failed - allow data through
            Ok(())
        }
    }

    /// Broadcast data to all subscribers of a service with optional validation
    pub fn broadcast(
        &self,
        service_id: &str,
        data: serde_json::Value,
        app: &AppHandle,
    ) -> Result<(), String> {
        // Validate data against schema if validation is enabled
        if self.validate_data {
            if let Err(errors) = self.validate_service_data(service_id, &data) {
                let error_msg = format!(
                    "Service {} data validation failed: {}",
                    service_id,
                    errors.join(", ")
                );
                eprintln!("[YAOF] Warning: {}", error_msg);
                // Log but don't block - validation errors are warnings in production
            }
        }

        let event_name = format!("yaof:service:{}", service_id);

        // Emit to all windows (subscribers can filter on their end)
        app.emit(&event_name, data).map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Broadcast data with strict validation - returns error if validation fails
    pub fn broadcast_validated(
        &self,
        service_id: &str,
        data: serde_json::Value,
        app: &AppHandle,
    ) -> Result<(), String> {
        // Validate data against schema
        if let Err(errors) = self.validate_service_data(service_id, &data) {
            return Err(format!(
                "Service {} data validation failed: {}",
                service_id,
                errors.join(", ")
            ));
        }

        let event_name = format!("yaof:service:{}", service_id);
        app.emit(&event_name, data).map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Get the schema for a service
    pub fn get_schema(&self, service_id: &str) -> Option<&serde_json::Value> {
        self.providers.get(service_id).map(|p| &p.schema)
    }

    /// Check if a service has a validator
    pub fn has_validator(&self, service_id: &str) -> bool {
        self.validators.contains_key(service_id)
    }
}

impl Default for ServiceRegistry {
    fn default() -> Self {
        Self::new()
    }
}
