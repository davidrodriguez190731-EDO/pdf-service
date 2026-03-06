const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json({ limit: '5mb' }));

const API_KEY = process.env.API_KEY || 'cambiar-esta-clave';

let browser = null;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--metrics-recording-only',
        '--mute-audio',
        '--safebrowsing-disable-auto-update'
      ]
    });
  }
  return browser;
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'pdf-service' });
});

app.post('/generate', async (req, res) => {
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
    // Crear browser nuevo por cada request para evitar crashes
    const b = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process'
      ]
    });

    page = await b.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Extraer nombre empresa del HTML para el footer
    const empNombre = await page.evaluate(() => {
      const el = document.getElementById('emp-nombre');
      return el ? el.textContent : 'TTM BUILDERS LLC';
    });

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `
        <div style="width:100%;font-family:Arial,sans-serif;font-size:7pt;padding:8px 40px 10px 40px;border-top:1px solid #eeeeee;text-align:center;box-sizing:border-box;">
          <strong style="color:#2d5a1b;">${empNombre}</strong><br>
          <span style="color:#aaaaaa;font-style:italic;">Powered by </span>
          <strong style="color:#f97316;">EDO INGENIERÍA DIGITAL</strong>
        </div>`,
      margin: { top: '0.5in', right: '0.55in', bottom: '0.9in', left: '0.55in' }
    });

    await b.close();

    const base64 = Buffer.from(pdfBuffer).toString('base64');
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
