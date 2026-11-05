import { useAuth } from "../context/AuthContext";
import Modal from "./Modal";

export default function SessionTimeoutWarning() {
  const { isWarning, secondsLeft, extendSession, logout } = useAuth();

  if (!isWarning || secondsLeft == null || secondsLeft <= 0) return null;

  return (
    <Modal
      title="Your session is about to expire"
      footer={
        <>
          <button className="btn btn-outline" onClick={logout}>Log out now</button>
          <button className="btn btn-primary" onClick={extendSession}>Stay signed in</button>
        </>
      }
    >
      <p>
        Due to inactivity, you'll be automatically logged out in <strong>{secondsLeft}s</strong>. Any
        unsaved work should be completed now.
      </p>
    </Modal>
  );
}
