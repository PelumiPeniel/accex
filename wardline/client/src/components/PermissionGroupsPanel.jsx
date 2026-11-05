import { useEffect, useState } from "react";
import { api } from "../api";

export default function PermissionGroupsPanel({ user, onChanged }) {
  const [catalog, setCatalog] = useState([]);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");

  useEffect(() => {
    api.get("/users/permission-groups/catalog").then((d) => setCatalog(d.groups));
  }, []);

  async function toggle(groupKey, currentlyHeld) {
    setError("");
    setBusyKey(groupKey);
    try {
      const data = await api.patch("/users/" + user.id + "/permission-groups", {
        groupKey,
        grant: !currentlyHeld
      });
      onChanged(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyKey("");
    }
  }

  return (
    <div>
      {error && <div className="banner banner-error">{error}</div>}
      {catalog.map((g) => {
        const held = (user.permissionGroups || []).includes(g.key);
        const isBaseline = g.key === "OfficerDuties";
        return (
          <div className="group-row" key={g.key}>
            <div>
              <div className="name">{g.label}</div>
              <div className="desc">{g.description}</div>
              {g.systemAdminOnlyToDelegate && (
                <div className="locked-note">Only a System Administrator can grant/revoke this group.</div>
              )}
              {isBaseline && <div className="locked-note">Baseline capability - always on.</div>}
            </div>
            <label className="toggle-switch" style={{ marginTop: 4 }}>
              <input
                type="checkbox"
                checked={held}
                disabled={isBaseline || busyKey === g.key}
                onChange={() => toggle(g.key, held)}
              />
              <span className="track" />
            </label>
          </div>
        );
      })}
    </div>
  );
}
