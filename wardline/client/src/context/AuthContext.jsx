import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, getToken, setToken } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [warningSeconds, setWarningSeconds] = useState(60);
  const [justRenewed, setJustRenewed] = useState(false);
  const expiryRef = useRef(null);
  const tickRef = useRef(null);
  const activityThrottleRef = useRef(0);

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
    expiryRef.current = null;
    setSecondsLeft(null);
    if (tickRef.current) clearInterval(tickRef.current);
  }, []);

  const armExpiry = useCallback((minutes) => {
    expiryRef.current = Date.now() + minutes * 60000;
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api.post(
      "/auth/login",
      { username, password },
      { auth: false }
    );
    setToken(data.token);
    setUser(data.user);
    setWarningSeconds(data.sessionWarningSeconds || 60);
    armExpiry(data.sessionTimeoutMinutes || 15);
    return data.user;
  }, [armExpiry]);

  const logout = useCallback(async () => {
    try {
      if (getToken()) await api.post("/auth/logout");
    } catch {
      // ignore
    }
    clearSession();
  }, [clearSession]);

  const extendSession = useCallback(() => {
    if (!getToken()) return;
    api
      .post("/auth/heartbeat")
      .then((data) => {
        setToken(data.token);
        armExpiry(data.sessionTimeoutMinutes || 15);
        setJustRenewed(true);
        setTimeout(() => setJustRenewed(false), 450);
      })
      .catch(() => clearSession());
  }, [armExpiry, clearSession]);

  const registerActivity = useCallback(() => {
    const now = Date.now();
    if (now - activityThrottleRef.current < 20000) return;
    activityThrottleRef.current = now;
    extendSession();
  }, [extendSession]);

  const toggleSessionTimerVisible = useCallback(async () => {
    const next = !user?.sessionTimerVisible;
    setUser((u) => (u ? { ...u, sessionTimerVisible: next } : u));
    try {
      await api.patch("/auth/session-timer-visibility", { visible: next });
    } catch {
      // best-effort — local state already updated
    }
  }, [user]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setBooting(false);
      return;
    }
    api
      .get("/auth/me")
      .then((data) => {
        setUser(data.user);
        // Re-arm the countdown on page refresh — without this, the timer
        // stays at its initial null value forever and shows "--:--" even
        // though the session is actually live and counting down server-side.
        setWarningSeconds(data.sessionWarningSeconds || 60);
        armExpiry(data.sessionTimeoutMinutes || 15);
      })
      .catch(() => clearSession())
      .finally(() => setBooting(false));
  }, [clearSession, armExpiry]);

  useEffect(() => {
    tickRef.current = setInterval(() => {
      if (!expiryRef.current) {
        setSecondsLeft(null);
        return;
      }
      const remaining = Math.round((expiryRef.current - Date.now()) / 1000);
      setSecondsLeft(remaining);
      if (remaining <= 0) clearSession();
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, [clearSession]);

  useEffect(() => {
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, registerActivity, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, registerActivity));
  }, [registerActivity]);

  const isWarning = secondsLeft != null && secondsLeft <= warningSeconds;

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        booting,
        login,
        logout,
        secondsLeft,
        isWarning,
        justRenewed,
        extendSession,
        toggleSessionTimerVisible
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
