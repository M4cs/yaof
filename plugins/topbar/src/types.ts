export interface TopbarServiceData {
  network: {
    connected: boolean;
    signal_strength: number | null;
    connection_type: string;
  };
  cpu_usage: number;
  focused_window: {
    title: string;
    app_name: string | null;
    process_id: number | null;
  } | null;
  active_desktop: number;
  now_playing: {
    title: string;
    artist: string | null;
    album: string | null;
    duration_ms: number | null;
    position_ms: number | null;
    is_playing: boolean;
  } | null;
}

export enum Widget {
  ActiveWindow = "ActiveWindow",
  Clock = "Clock",
  CPU = "CPU",
  Network = "Network",
  NowPlaying = "NowPlaying",
  Signal = "Signal",
  Tickers = "Tickers",
}
