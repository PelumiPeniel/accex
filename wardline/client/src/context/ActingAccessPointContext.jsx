import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "./AuthContext";

// System Administrator has no Access Point of their own — unlike
// Administrator and Access Officer, whose account already carries one
// permanently. So for the handful of things System Administrator can now
// also do (sign visitors in, monitor who's on-site, search records),
// something has to say which Access Point they mean right now.
//
// This is deliberately NOT the old device-claiming system from earlier in
// this project. There's no physical device involved, nothing is "locked,"
// and nothing here is written to the server at all — it's purely an
// in-session choice, remembered for convenience (sessionStorage) so it
// survives a page refresh within the same login, and reset the moment
// they log out. Administrator and Access Officer never touch this context
// at all; their own fixed accessPointId always governs instead.
const Ctx = createContext(null);
const STORAGE_KEY = "accex_acting_access_point";

export function ActingAccessPointProvider({ children }) {
  const { user } = useAuth();
  const [allPoints, setAllPoints] = useState([]);
  const [accessPointId, setAccessPointIdState] = useState(() => sessionStorage.getItem(STORAGE_KEY) || "");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || user.role !== "SystemAdministrator") {
      setLoading(false);
      return;
    }
    api.get("/access-points").then((d) => {
      const active = d.accessPoints.filter((a) => a.active);
      setAllPoints(active);
      setAccessPointIdState((current) => {
        if (current && active.some((a) => a.id === current)) return current;
        return active[0] ? active[0].id : "";
      });
      setLoading(false);
    });
  }, [user]);

  function setAccessPointId(id) {
    setAccessPointIdState(id);
    sessionStorage.setItem(STORAGE_KEY, id);
  }

  const accessPoint = allPoints.find((a) => a.id === accessPointId) || null;

  return (
    <Ctx.Provider value={{ accessPoint, accessPointId, setAccessPointId, allPoints, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export function useActingAccessPoint() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useActingAccessPoint must be used within ActingAccessPointProvider");
  return ctx;
}
