const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const { createWorker } = require("tesseract.js");
const OpenAI = require("openai");

const upload = multer({ dest: "uploads/" });

// ✅ Hugging Face Router (NEW & WORKING)
const client = new OpenAI({
  apiKey: process.env.HF_TOKEN,
  baseURL: "https://router.huggingface.co/v1",
});

// ---------------- TEXT EXTRACTION ----------------
async function extractText(filePath, mimeType) {
  if (mimeType === "application/pdf") {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (mimeType.startsWith("image/")) {
    const worker = await createWorker();
    await worker.loadLanguage("eng");
    await worker.initialize("eng");
    const { data: { text } } = await worker.recognize(filePath);
    await worker.terminate();
    return text;
  }

  throw new Error("Unsupported file type");
}

// ---------------- AI JSON CONVERSION ----------------
async function convertTextToJSONWithAI(text) {
  try {
    const prompt = `
Convert the following document text into clean JSON.
Return ONLY valid JSON. No explanation.

TEXT:
${text}
`;

    const response = await client.chat.completions.create({
      model: "deepseek-ai/DeepSeek-V3.2:novita", // ✅ FREE
      messages: [{ role: "user", content: prompt }],
    });

    const aiText = response.choices[0].message.content;

    const match = aiText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON found");

    return JSON.parse(match[0]);
  } catch (err) {
    console.error("AI Error:", err.message);
    return { fallbackText: text.slice(0, 500) };
  }
}

// ---------------- UPLOAD API ----------------
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "File required" });

    const text = await extractText(req.file.path, req.file.mimetype);
    const json = await convertTextToJSONWithAI(text);

    res.json(json);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
