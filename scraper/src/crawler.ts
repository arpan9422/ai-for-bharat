import { chromium } from 'playwright';
import { PageConfig } from './pages.config';

export async function scrapePage(config: PageConfig): Promise<string> {
  console.log(`Scraping: ${config.url}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    await page.goto(config.url, { waitUntil: 'networkidle' });

    // Remove exclude selectors
    if (config.exclude && config.exclude.length > 0) {
      for (const sel of config.exclude) {
        await page.evaluate((s) => {
          document.querySelectorAll(s).forEach((el: any) => el.remove());
        }, sel);
      }
    }

    // Extract text from target selectors
    const text = await page.evaluate((sels) => {
      return sels.map(s => {
        const elements = Array.from(document.querySelectorAll(s));
        return elements
          .map((el: any) => (el as HTMLElement).innerText?.trim() || el.textContent?.trim())
          .filter(Boolean)
          .join('\n\n');
      }).join('\n\n');
    }, config.selectors);

    return text;
  } catch (error) {
    console.error(`Error scraping ${config.url}:`, error);
    return '';
  } finally {
    await browser.close();
  }
}
