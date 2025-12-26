const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const { createWorker } = require("tesseract.js");

const upload = multer({ dest: "uploads/" });

/* -------- TEXT EXTRACTION -------- */

async function extractText(filePath, mimeType) {
  if (mimeType === "application/pdf") {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (mimeType.startsWith("image/")) {
    const worker = await createWorker("eng");
    const {
      data: { text },
    } = await worker.recognize(filePath);
    await worker.terminate();
    return text;
  }

  throw new Error("Unsupported file type");
}

/* -------- UPLOAD API -------- */

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }

    const extractedText = await extractText(
      req.file.path,
      req.file.mimetype
    );

    // 🔥 ONLY RAW DATA IN JSON
    res.json({
      data: extractedText.trim(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
