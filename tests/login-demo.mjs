import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();

// Set viewport
await page.setViewportSize({ width: 1280, height: 800 });

// Navigate to test artifact
console.log('Opening test app...');
await page.goto('https://claude.ai/artifact/VBe1uMrj1mtNNeXc7h6tgy', { waitUntil: 'networkidle' });

await page.waitForTimeout(2000);

// Look for signup/login elements
const emailInput = page.locator('input[type="email"], input[name="email"]').first();
const exists = await emailInput.isVisible().catch(() => false);

if (exists) {
  console.log('Found email input, signing up...');
  
  const randomEmail = `test-${Date.now()}@example.com`;
  const passwordInput = page.locator('input[type="password"]').first();
  const nameInput = page.locator('input[placeholder*="name" i], input[placeholder*="Name" i]').first();
  const submitBtn = page.locator('button').filter({ hasText: /sign up|login|enter|submit/i }).first();
  
  // Try to fill signup form
  await emailInput.fill(randomEmail);
  await page.waitForTimeout(500);
  
  if (await passwordInput.isVisible()) {
    await passwordInput.fill('TestPass123!');
  }
  
  if (await nameInput.isVisible()) {
    await nameInput.fill('Test User');
  }
  
  await page.waitForTimeout(500);
  
  // Click submit
  if (await submitBtn.isVisible()) {
    await submitBtn.click();
    console.log('Submitted form, waiting for home page...');
    await page.waitForTimeout(3000);
  }
} else {
  console.log('No auth form found, checking if already logged in...');
}

// Take screenshot of authenticated app
await page.screenshot({ path: '/tmp/app-authenticated.png', fullPage: false });
console.log('✓ Screenshot saved to /tmp/app-authenticated.png');

// Get page content info
const title = await page.title();
const bodyText = await page.locator('body').evaluate(el => el.innerText.split('\n').slice(0, 5).join(' | '));

console.log('Title:', title);
console.log('Page content:', bodyText.substring(0, 150));

await browser.close();
console.log('\n✅ Login demo complete!');
