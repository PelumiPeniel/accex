import { createContext, useCallback, useContext, useState } from "react";

const Ctx = createContext(null);

export function VisitorSignInModalProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const openModal = useCallback(() => setOpen(true), []);
  const closeModal = useCallback(() => setOpen(false), []);
  const triggerRefresh = useCallback(() => setRefreshToken((t) => t + 1), []);
  return (
    <Ctx.Provider value={{ open, openModal, closeModal, refreshToken, triggerRefresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useVisitorSignInModal() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useVisitorSignInModal must be used within VisitorSignInModalProvider");
  return ctx;
}
