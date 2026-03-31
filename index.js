const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json({ limit: '5mb' }));

const API_KEY = process.env.API_KEY || 'cambiar-esta-clave';

let browser = null;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
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

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'pdf-service' });
});

// Función interna que genera el PDF
async function generatePDF(html, options) {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    const pdfOptions = {
      format: 'Letter',
      printBackground: true,
      preferCSSPageSize: false
    };

    if (options.displayHeaderFooter) {
      pdfOptions.displayHeaderFooter = true;
      pdfOptions.headerTemplate = options.headerTemplate || '<span></span>';
      pdfOptions.footerTemplate = options.footerTemplate || '<span></span>';
    }

    if (options.margin) {
      pdfOptions.margin = options.margin;
    } else if (options.displayHeaderFooter) {
      pdfOptions.margin = { top: '20px', bottom: '60px', left: '0px', right: '0px' };
    }

    const pdfBuffer = await page.pdf(pdfOptions);
    return Buffer.from(pdfBuffer).toString('base64');
  } finally {
    try { await page.close(); } catch (e) {}
  }
}

app.post('/generate', async (req, res) => {
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { html, filename } = req.body;
  if (!html) {
    return res.status(400).json({ error: 'Missing html' });
  }

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const pdf = await generatePDF(html, req.body);
      return res.json({
        success: true,
        pdf: pdf,
        filename: filename || 'document.pdf'
      });
    } catch (err) {
      console.error(`Attempt ${attempt}/${maxRetries} failed:`, err.message);
      // Si el browser se desconectó, forzar reconexión
      if (err.message.includes('detached') || err.message.includes('disconnected') || err.message.includes('closed')) {
        try { await browser.close(); } catch (e) {}
        browser = null;
      }
      if (attempt === maxRetries) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PDF Service running on port ${PORT}`);
});
