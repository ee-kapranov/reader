import { Router, Request, Response } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../logger.js';

const router = Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const requestId = req.requestId;
  const { url } = req.body as { url?: string };

  if (!url || url.trim() === '') {
    res.status(400).json({ error: 'URL is required' });
    return;
  }

  logger.info({ requestId, event: 'fetch_url_start', url });

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ReaderBot/1.0)',
      },
      timeout: 15000,
      responseType: 'text',
    });

    const contentType = (response.headers['content-type'] as string) || '';

    if (contentType.includes('text/plain')) {
      res.json({ text: response.data as string });
      return;
    }

    const $ = cheerio.load(response.data as string);

    // Remove scripts, styles, nav, footer, header, ads
    $('script, style, nav, footer, header, aside, noscript, [aria-hidden="true"]').remove();

    // Try to find main content
    const selectors = ['article', 'main', '[role="main"]', '.post-content', '.entry-content', '.article-body', '#content', '.content'];
    let text = '';
    for (const sel of selectors) {
      const el = $(sel);
      if (el.length > 0) {
        text = el.text().trim();
        break;
      }
    }

    if (!text) {
      text = $('body').text().trim();
    }

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    logger.info({ requestId, event: 'fetch_url_complete', textLength: text.length });

    res.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ requestId, event: 'fetch_url_error', url, error: message });
    res.status(500).json({ error: `Failed to fetch URL: ${message}` });
  }
});

export { router as fetchUrlRouter };
