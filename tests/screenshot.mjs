import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();

// Set viewport size
await page.setViewportSize({ width: 1280, height: 720 });

// Navigate to the app
console.log('Navigating to http://localhost:5173...');
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

// Wait for React to render
await page.waitForTimeout(2000);

// Take screenshot
await page.screenshot({ path: '/tmp/app-home.png', fullPage: false });
console.log('✓ Screenshot saved to /tmp/app-home.png');

// Get page info
const title = await page.title();
const heading = await page.locator('h1, h2').first().textContent().catch(() => 'N/A');
const hasContent = await page.locator('body').evaluate(el => el.textContent.length > 100);

console.log('Title:', title);
console.log('Has content:', hasContent);
console.log('Heading:', heading);

await browser.close();
