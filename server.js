require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();

// ---------------- ENSURE UPLOADS FOLDER ----------------
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// ---------------- MIDDLEWARE ----------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// static access (optional)
app.use("/uploads", express.static(uploadDir));

// ---------------- ROUTES ----------------
const uploadRoute = require("./routes/upload");
app.use("/api", uploadRoute);

// ---------------- ROOT TEST ----------------
app.get("/", (req, res) => {
  res.send("Document to JSON Converter API running");
});

// ---------------- START SERVER ----------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
