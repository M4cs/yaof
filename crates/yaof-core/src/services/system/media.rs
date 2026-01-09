//! Media playback monitoring service using souvlaki
//!
//! Provides information about currently playing media:
//! - Title
//! - Artist
//! - Album
//! - Duration
//! - Position/Progress
//! - Playing state
//! - Application name

use std::sync::{Arc, Mutex};

use souvlaki::{MediaControlEvent, MediaControls, PlatformConfig};

use super::MediaStatus;

/// Cached media state from souvlaki events
#[derive(Debug, Clone, Default)]
struct MediaState {
    playing: bool,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    duration_ms: Option<u64>,
    position_ms: Option<u64>,
    app_name: Option<String>,
}

/// Service for monitoring media playback using souvlaki
pub struct MediaService {
    /// Cached media state (updated via callbacks)
    state: Arc<Mutex<MediaState>>,
    /// Media controls handle (kept alive for event receiving)
    #[allow(dead_code)]
    controls: Option<MediaControls>,
}

impl MediaService {
    pub fn new() -> Self {
        let state = Arc::new(Mutex::new(MediaState::default()));

        // Try to initialize souvlaki media controls
        let controls = Self::init_media_controls(state.clone());

        Self { state, controls }
    }

    fn init_media_controls(state: Arc<Mutex<MediaState>>) -> Option<MediaControls> {
        #[cfg(not(target_os = "windows"))]
        let hwnd = None;

        #[cfg(target_os = "windows")]
        let hwnd = {
            // On Windows, we need a window handle for media controls
            // For now, we'll skip this and use fallback methods
            None
        };

        let config = PlatformConfig {
            dbus_name: "yaof",
            display_name: "YAOF",
            hwnd,
        };

        match MediaControls::new(config) {
            Ok(mut controls) => {
                let state_clone = state.clone();

                // Attach event handler to receive media updates
                if controls
                    .attach(move |event: MediaControlEvent| {
                        Self::handle_media_event(&state_clone, event);
                    })
                    .is_ok()
                {
                    Some(controls)
                } else {
                    None
                }
            }
            Err(_) => None,
        }
    }

    fn handle_media_event(state: &Arc<Mutex<MediaState>>, event: MediaControlEvent) {
        if let Ok(mut state) = state.lock() {
            match event {
                MediaControlEvent::Play => {
                    state.playing = true;
                }
                MediaControlEvent::Pause => {
                    state.playing = false;
                }
                MediaControlEvent::Stop => {
                    state.playing = false;
                    state.title = None;
                    state.artist = None;
                    state.album = None;
                }
                MediaControlEvent::Toggle => {
                    state.playing = !state.playing;
                }
                _ => {}
            }
        }
    }

    /// Get current media status
    pub fn get_status(&self) -> MediaStatus {
        // First try to get status from souvlaki state
        if let Ok(state) = self.state.lock() {
            if state.title.is_some() {
                return MediaStatus {
                    playing: state.playing,
                    title: state.title.clone(),
                    artist: state.artist.clone(),
                    album: state.album.clone(),
                    duration_ms: state.duration_ms,
                    position_ms: state.position_ms,
                    app_name: state.app_name.clone(),
                };
            }
        }

        // Fallback to platform-specific detection
        #[cfg(target_os = "macos")]
        return self.get_status_macos();

        #[cfg(target_os = "windows")]
        return self.get_status_windows();

        #[cfg(target_os = "linux")]
        return self.get_status_linux();

        #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
        return MediaStatus::default();
    }

    #[cfg(target_os = "macos")]
    fn get_status_macos(&self) -> MediaStatus {
        use std::process::Command;

        // Use AppleScript to get now playing info from Music app or other media players
        let script = r#"
            set output to ""
            
            -- Try Spotify first
            if application "Spotify" is running then
                tell application "Spotify"
                    if player state is playing then
                        set trackName to name of current track
                        set artistName to artist of current track
                        set albumName to album of current track
                        set trackDuration to duration of current track
                        set trackPosition to player position
                        set output to "playing|" & trackName & "|" & artistName & "|" & albumName & "|" & (trackDuration as integer) & "|" & (trackPosition as integer) & "|Spotify"
                    else if player state is paused then
                        set trackName to name of current track
                        set artistName to artist of current track
                        set albumName to album of current track
                        set trackDuration to duration of current track
                        set trackPosition to player position
                        set output to "paused|" & trackName & "|" & artistName & "|" & albumName & "|" & (trackDuration as integer) & "|" & (trackPosition as integer) & "|Spotify"
                    end if
                end tell
            -- Try Apple Music
            else if application "Music" is running then
                tell application "Music"
                    if player state is playing then
                        set trackName to name of current track
                        set artistName to artist of current track
                        set albumName to album of current track
                        set trackDuration to duration of current track
                        set trackPosition to player position
                        set output to "playing|" & trackName & "|" & artistName & "|" & albumName & "|" & (trackDuration as integer) & "|" & (trackPosition as integer) & "|Music"
                    else if player state is paused then
                        set trackName to name of current track
                        set artistName to artist of current track
                        set albumName to album of current track
                        set trackDuration to duration of current track
                        set trackPosition to player position
                        set output to "paused|" & trackName & "|" & artistName & "|" & albumName & "|" & (trackDuration as integer) & "|" & (trackPosition as integer) & "|Music"
                    end if
                end tell
            end if
            
            return output
        "#;

        let output = Command::new("osascript").args(["-e", script]).output();

        match output {
            Ok(out) if out.status.success() => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let trimmed = stdout.trim();

                if trimmed.is_empty() {
                    return MediaStatus::default();
                }

                let parts: Vec<&str> = trimmed.split('|').collect();
                if parts.len() >= 7 {
                    let playing = parts[0] == "playing";
                    let title = Some(parts[1].to_string());
                    let artist = if parts[2].is_empty() {
                        None
                    } else {
                        Some(parts[2].to_string())
                    };
                    let album = if parts[3].is_empty() {
                        None
                    } else {
                        Some(parts[3].to_string())
                    };
                    // Spotify returns duration in ms, Music in seconds
                    let duration_ms = parts[4]
                        .parse::<u64>()
                        .ok()
                        .map(|d| if d > 100000 { d } else { d * 1000 });
                    let position_ms = parts[5]
                        .parse::<u64>()
                        .ok()
                        .map(|p| if p > 100000 { p } else { p * 1000 });
                    let app_name = Some(parts[6].to_string());

                    MediaStatus {
                        playing,
                        title,
                        artist,
                        album,
                        duration_ms,
                        position_ms,
                        app_name,
                    }
                } else {
                    MediaStatus::default()
                }
            }
            _ => MediaStatus::default(),
        }
    }

    #[cfg(target_os = "windows")]
    fn get_status_windows(&self) -> MediaStatus {
        use std::process::Command;

        // Use PowerShell to access Windows Media Session
        let script = r#"
            Add-Type -AssemblyName System.Runtime.WindowsRuntime
            
            $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
            
            Function Await($WinRtTask, $ResultType) {
                $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
                $netTask = $asTask.Invoke($null, @($WinRtTask))
                $netTask.Wait(-1) | Out-Null
                $netTask.Result
            }
            
            try {
                [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
                
                $sessionManager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
                $session = $sessionManager.GetCurrentSession()
                
                if ($session) {
                    $mediaProperties = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
                    $playbackInfo = $session.GetPlaybackInfo()
                    $timelineProperties = $session.GetTimelineProperties()
                    
                    $status = if ($playbackInfo.PlaybackStatus -eq 'Playing') { 'playing' } else { 'paused' }
                    $title = $mediaProperties.Title
                    $artist = $mediaProperties.Artist
                    $album = $mediaProperties.AlbumTitle
                    $duration = [int]$timelineProperties.EndTime.TotalMilliseconds
                    $position = [int]$timelineProperties.Position.TotalMilliseconds
                    $appName = $session.SourceAppUserModelId
                    
                    Write-Output "$status|$title|$artist|$album|$duration|$position|$appName"
                }
            } catch {
                # Silently fail
            }
        "#;

        let output = Command::new("powershell")
            .args(["-ExecutionPolicy", "Bypass", "-Command", script])
            .output();

        match output {
            Ok(out) if out.status.success() => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let trimmed = stdout.trim();

                if trimmed.is_empty() {
                    return MediaStatus::default();
                }

                let parts: Vec<&str> = trimmed.split('|').collect();
                if parts.len() >= 7 {
                    let playing = parts[0] == "playing";
                    let title = Some(parts[1].to_string());
                    let artist = if parts[2].is_empty() {
                        None
                    } else {
                        Some(parts[2].to_string())
                    };
                    let album = if parts[3].is_empty() {
                        None
                    } else {
                        Some(parts[3].to_string())
                    };
                    let duration_ms = parts[4].parse::<u64>().ok();
                    let position_ms = parts[5].parse::<u64>().ok();
                    let app_name = Some(parts[6].to_string());

                    MediaStatus {
                        playing,
                        title,
                        artist,
                        album,
                        duration_ms,
                        position_ms,
                        app_name,
                    }
                } else {
                    MediaStatus::default()
                }
            }
            _ => MediaStatus::default(),
        }
    }

    #[cfg(target_os = "linux")]
    fn get_status_linux(&self) -> MediaStatus {
        use std::process::Command;

        // Use playerctl to get MPRIS media info
        let output = Command::new("playerctl")
            .args([
                "metadata",
                "--format",
                "{{status}}|{{title}}|{{artist}}|{{album}}|{{mpris:length}}|{{position}}|{{playerName}}",
            ])
            .output();

        match output {
            Ok(out) if out.status.success() => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let trimmed = stdout.trim();

                if trimmed.is_empty() {
                    return MediaStatus::default();
                }

                let parts: Vec<&str> = trimmed.split('|').collect();
                if parts.len() >= 7 {
                    let playing = parts[0].to_lowercase() == "playing";
                    let title = Some(parts[1].to_string());
                    let artist = if parts[2].is_empty() {
                        None
                    } else {
                        Some(parts[2].to_string())
                    };
                    let album = if parts[3].is_empty() {
                        None
                    } else {
                        Some(parts[3].to_string())
                    };
                    // MPRIS returns microseconds, convert to milliseconds
                    let duration_ms = parts[4].parse::<u64>().ok().map(|d| d / 1000);
                    let position_ms = parts[5].parse::<u64>().ok().map(|p| p / 1000);
                    let app_name = Some(parts[6].to_string());

                    MediaStatus {
                        playing,
                        title,
                        artist,
                        album,
                        duration_ms,
                        position_ms,
                        app_name,
                    }
                } else {
                    MediaStatus::default()
                }
            }
            _ => MediaStatus::default(),
        }
    }
}

impl Default for MediaService {
    fn default() -> Self {
        Self::new()
    }
}
