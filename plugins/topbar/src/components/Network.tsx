import { useSystemService } from "@m4cs/yaof-sdk";
import { Fragment, useMemo } from "react";
import {
  NetworkIcon,
  NetworkSlashIcon,
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
    if (!data?.network.connected) {
      return <Fragment />;
    }
    if (!data.network.connected) {
      return <WifiSlashIcon size={16} />;
    }
    if (data.network.connection_type === "wifi") {
      if (data.network.strength === null || data.network.strength < 5) {
        return <WifiNoneIcon size={16} />;
      } else if (data.network.strength > 5 && data.network.strength < 50) {
        return <WifiLowIcon size={16} />;
      } else if (data.network.strength >= 50 && data.network.strength < 75) {
        return <WifiMediumIcon size={16} />;
      } else if (data.network.strength >= 75) {
        return <WifiHighIcon size={16} />;
      }
    } else {
      if (data.network.strength === null || data.network.strength < 5) {
        return <NetworkSlashIcon size={16} />;
      } else {
        return <NetworkIcon size={16} />;
      }
    }
  }, [data]);

  return <div className="w-fit text-foreground">{getSignalDisplay}</div>;
}
