import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();

// Set viewport
await page.setViewportSize({ width: 1280, height: 800 });

// Navigate to local app
console.log('Opening local app at http://localhost:5173...');
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

await page.waitForTimeout(2000);

// Check if we're on auth page or home
let onAuthPage = await page.locator('input[type="email"]').isVisible().catch(() => false);

if (onAuthPage) {
  console.log('✓ Found auth form, signing up...');
  
  const randomEmail = `test-${Date.now()}@example.com`;
  
  // Get form elements
  const emailInput = page.locator('input[type="email"]').first();
  const passwordInputs = page.locator('input[type="password"]');
  const nameInput = page.locator('input[type="text"]').first();
  
  // Fill form
  await emailInput.fill(randomEmail);
  await page.waitForTimeout(300);
  
  // Get all password inputs (usually 2 for password and confirm)
  const pwCount = await passwordInputs.count();
  for (let i = 0; i < pwCount; i++) {
    await passwordInputs.nth(i).fill('TestPass123!');
  }
  
  // Try to fill name if visible
  if (await nameInput.isVisible()) {
    const value = await nameInput.inputValue();
    if (!value) {
      await nameInput.fill('Test User');
    }
  }
  
  console.log('Submitted form with email:', randomEmail);
  
  // Click signup button
  const signupBtn = page.locator('button').filter({ hasText: /sign up|create account/i }).first();
  if (await signupBtn.isVisible()) {
    await signupBtn.click();
    console.log('✓ Clicked signup button');
  }
  
  // Wait for navigation to home
  await page.waitForTimeout(3000);
}

// Take screenshot
console.log('Taking screenshot of authenticated app...');
await page.screenshot({ path: '/tmp/app-authenticated.png', fullPage: false });

// Get page info
const title = await page.title();
const hasKanban = await page.locator('text=OPS KANBAN').isVisible().catch(() => false);
const hasHome = await page.locator('text=DASHBOARD|Home').isVisible().catch(() => false);
const hasTickets = await page.locator('[class*="ticket"], [class*="card"]').count();

console.log('\n📊 App Status:');
console.log('Title:', title);
console.log('Kanban board visible:', hasKanban);
console.log('Home/Dashboard visible:', hasHome);
console.log('Ticket cards found:', await hasTickets);
console.log('✓ Screenshot saved to /tmp/app-authenticated.png');

await browser.close();
