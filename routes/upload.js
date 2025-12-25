const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { createWorker } = require('tesseract.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const upload = multer({ dest: 'uploads/' });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Extract text from PDF
async function extractTextFromPDF(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  return data.text;
}

// Extract text from Image using OCR
async function extractTextFromImage(imagePath) {
  const worker = await createWorker();
  await worker.loadLanguage('eng');
  await worker.initialize('eng');
  const { data: { text } } = await worker.recognize(imagePath);
  await worker.terminate();
  return text;
}

// Process text with Gemini AI to get structured JSON
async function processWithAI(text, fileType) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    const prompt = `
    Extract structured data from the following document content and return ONLY valid JSON.
    Do not include any explanations, just the JSON object.
    
    Document Type: ${fileType}
    Content: ${text.substring(0, 15000)} // Limit text length
    
    Return JSON with structure like:
    {
      "document_type": "invoice|resume|form|letter|other",
      "entities": {
        "names": [],
        "dates": [],
        "amounts": [],
        "addresses": [],
        "emails": [],
        "phone_numbers": []
      },
      "key_value_pairs": {},
      "extracted_text": "summary",
      "confidence_score": 0.95
    }
    `;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const aiText = response.text();
    
    // Clean the response to get pure JSON
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('No valid JSON found in AI response');
  } catch (error) {
    console.error('AI Processing Error:', error);
    // Fallback to basic extraction
    return {
      document_type: "unknown",
      entities: {},
      extracted_text: text.substring(0, 500),
      confidence_score: 0.5
    };
  }
}

// Upload endpoint
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileType = req.file.mimetype;
    let extractedText = '';

    console.log(`Processing file: ${filePath}, Type: ${fileType}`);

    // Extract text based on file type
    if (fileType === 'application/pdf') {
      extractedText = await extractTextFromPDF(filePath);
    } else if (fileType.startsWith('image/')) {
      extractedText = await extractTextFromImage(filePath);
    } else {
      throw new Error('Unsupported file type');
    }

    console.log('Text extracted, length:', extractedText.length);

    // Process with AI for structured data
    const structuredData = await processWithAI(extractedText, fileType);

    // Prepare response
    const response = {
      success: true,
      filename: req.file.originalname,
      filetype: fileType,
      filesize: req.file.size,
      extracted_text: extractedText.substring(0, 1000) + '...',
      structured_data: structuredData,
      download_url: `/api/download/${path.basename(filePath)}.json`
    };

    // Save JSON file
    const jsonFilePath = `uploads/${path.basename(filePath)}.json`;
    fs.writeFileSync(jsonFilePath, JSON.stringify(response, null, 2));

    res.json(response);
  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).json({ 
      error: 'Processing failed', 
      message: error.message 
    });
  }
});

// Download endpoint
router.get('/download/:filename', (req, res) => {
  const filePath = path.join(__dirname, '../uploads', req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

module.exports = router;