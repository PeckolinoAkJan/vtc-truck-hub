"use client";

import { useEffect, useState, type ComponentType } from "react";

export default function LiveMapPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [LiveMapClient, setLiveMapClient] = useState<ComponentType | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);

    // Leaflet greift beim Auswerten des Moduls auf Browser-Globals zu. Der
    // Import darf deshalb nicht Teil des serverseitigen Modulgraphen werden.
    void import("../../components/LiveMapClient")
      .then(({ default: MapComponent }) => {
        if (active) setLiveMapClient(() => MapComponent);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loadFailed) {
    return (
      <div className="p-10 text-white" role="alert">
        Livemap konnte nicht geladen werden.
      </div>
    );
  }

  if (!isMounted || !LiveMapClient) {
    return <div className="p-10 text-white">Livemap wird geladen...</div>;
  }

  return <LiveMapClient />;
}
