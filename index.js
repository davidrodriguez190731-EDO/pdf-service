const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json({ limit: '5mb' }));

// ── Clave de seguridad — se define como variable de entorno en Railway ──
const API_KEY = process.env.API_KEY || 'cambiar-esta-clave';

// ── Pool simple: una instancia de browser reutilizada ──
let browser = null;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process'
      ]
    });
  }
  return browser;
}

// ── Health check ──
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'pdf-service' });
});

// ── Endpoint principal: POST /generate ──
app.post('/generate', async (req, res) => {

  // Validar API key
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { html, filename } = req.body;
  if (!html) {
    return res.status(400).json({ error: 'Missing html field' });
  }

  let page = null;
  try {
    const b = await getBrowser();
    page = await b.newPage();

    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      margin: { top: '0.5in', right: '0.55in', bottom: '0.5in', left: '0.55in' },
      printBackground: true   // ← CLAVE: renderiza colores de fondo
    });

    await page.close();

    // Devolver PDF como base64
    const base64 = pdfBuffer.toString('base64');
    res.json({ success: true, pdf: base64, filename: filename || 'document.pdf' });

  } catch (err) {
    if (page) await page.close().catch(() => {});
    console.error('Error generando PDF:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PDF Service corriendo en puerto ${PORT}`);
});
