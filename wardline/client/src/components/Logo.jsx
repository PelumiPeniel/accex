import logo from "../assets/logo.png";

export default function Logo({ size = 34, showWordmark = false, brand = "AcceX" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <img src={logo} alt="Organization" style={{ height: size, width: "auto", borderRadius: 6 }} />
      {showWordmark && (
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, lineHeight: 1.1 }}>
            {brand}
          </div>
          <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-500)" }}>
            Access Management
          </div>
        </div>
      )}
    </div>
  );
}
