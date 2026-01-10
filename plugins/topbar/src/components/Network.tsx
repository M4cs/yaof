import { useSystemService } from "@m4cs/yaof-sdk";
import { Fragment, useMemo } from "react";
import {
  NetworkIcon,
  WifiHighIcon,
  WifiLowIcon,
  WifiMediumIcon,
  WifiNoneIcon,
  WifiSlashIcon,
} from "@phosphor-icons/react";

export function Network() {
  const { data } = useSystemService();

  // Format network signal display
  const getSignalDisplay = useMemo(() => {
    // Data not loaded yet
    if (!data) {
      return <Fragment />;
    }
    // Network disconnected
    if (!data.network.connected) {
      return <WifiSlashIcon size={16} />;
    }
    if (data.network.connection_type === "wifi") {
      const strength = data.network.strength ?? 0;
      if (strength < 25) {
        return <WifiNoneIcon size={16} />;
      } else if (strength < 50) {
        return <WifiLowIcon size={16} />;
      } else if (strength < 75) {
        return <WifiMediumIcon size={16} />;
      } else {
        return <WifiHighIcon size={16} />;
      }
    }
    // Ethernet - no signal strength, just show connected icon
    return <NetworkIcon size={16} />;
  }, [data]);

  return <div className="w-fit text-foreground">{getSignalDisplay}</div>;
}
