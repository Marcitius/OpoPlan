import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";

export function PwaStatus() {
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [waiting, setWaiting] = useState(false),
    [error, setError] = useState(false);
  const activating = useRef(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let disposed = false;
    const hadController = !!navigator.serviceWorker.controller;
    const changed = () => {
      if (activating.current || hadController) location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        if (disposed) return;
        setRegistration(reg);
        setError(false);
        setWaiting(!!reg.waiting);
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (
              !disposed &&
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            )
              setWaiting(!!reg.waiting);
            if (!disposed && worker.state === "redundant" && !reg.active)
              setError(true);
          });
        });
      } catch {
        if (!disposed) setError(true);
      }
    };
    void register();
    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
    };
  }, []);
  if (!waiting && !error) return null;
  return (
    <div className="pwa-banner" role="status">
      <span>
        {waiting
          ? "Hay una actualización de OpoPlan. El cronómetro y los cambios guardados se conservan."
          : "No se pudo preparar el modo sin conexión. Recarga cuando tengas conexión."}
      </span>
      {waiting && (
        <Button
          variant="secondary"
          onClick={() => {
            activating.current = true;
            registration?.waiting?.postMessage("ACTIVATE_UPDATE");
          }}
        >
          Actualizar
        </Button>
      )}
    </div>
  );
}
