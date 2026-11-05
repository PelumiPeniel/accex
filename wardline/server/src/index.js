require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const accessPointRoutes = require("./routes/accessPoints");
const departmentRoutes = require("./routes/departments");
const visitorRoutes = require("./routes/visitors");
const settingsRoutes = require("./routes/settings");
const auditRoutes = require("./routes/audit");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: (process.env.CLIENT_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
}));
app.use(express.json({ limit: "2mb" })); // headroom for signature data URLs

app.get("/api/health", (req, res) => res.json({ ok: true, service: "AcceX API" }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/access-points", accessPointRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/visitors", visitorRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/audit", auditRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(PORT, () => {
  console.log(`AcceX API listening on http://localhost:${PORT}`);
});
