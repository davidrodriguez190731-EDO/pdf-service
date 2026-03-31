const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json({ limit: '5mb' }));

// ── Clave de seguridad ──
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

// ── Generar PDF ──
app.post('/generate', async (req, res) => {
  // Verificar API key
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { html, filename } = req.body;
  if (!html) {
    return res.status(400).json({ error: 'Missing html' });
  }

  let page = null;
  try {
    const b = await getBrowser();
    page = await b.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    // Opciones de PDF
    const pdfOptions = {
      format: 'Letter',
      printBackground: true,
      preferCSSPageSize: false
    };

    // Footer y Header personalizados
    if (req.body.displayHeaderFooter) {
      pdfOptions.displayHeaderFooter = true;
      pdfOptions.headerTemplate = req.body.headerTemplate || '<span></span>';
      pdfOptions.footerTemplate = req.body.footerTemplate || '<span></span>';
    }

    // Márgenes personalizados
    if (req.body.margin) {
      pdfOptions.margin = req.body.margin;
    } else if (req.body.displayHeaderFooter) {
      // Márgenes por defecto cuando hay header/footer
      pdfOptions.margin = { top: '20px', bottom: '60px', left: '0px', right: '0px' };
    }

    const pdfBuffer = await page.pdf(pdfOptions);

    res.json({
      success: true,
      pdf: pdfBuffer.toString('base64'),
      filename: filename || 'document.pdf'
    });

  } catch (err) {
    console.error('Error generating PDF:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (page) {
      try { await page.close(); } catch (e) {}
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PDF Service running on port ${PORT}`);
});
