import { test, expect } from '@playwright/test';

test('export format popup works', async ({ page }) => {
  await page.goto('file://' + process.cwd().replace(/\/tests$/, '') + '/index.html#/inventory');
  await page.waitForLoadState('networkidle');
  
  // Click Tools menu
  await page.click('[aria-label="Tools"]');
  await page.waitForTimeout(300);
  
  // Screenshot the menu
  await page.screenshot({ path: '/tmp/claude-0/-home-user/68979983-ad52-54ed-a410-94f461390fd7/scratchpad/tools-menu.png' });
  
  // Click "Filtered assets/stock" button
  const buttons = await page.locator('button:has-text("Filtered assets/stock")').all();
  if (buttons.length > 0) {
    await buttons[0].click();
    await page.waitForTimeout(300);
    
    // Screenshot the export format popup
    await page.screenshot({ path: '/tmp/claude-0/-home-user/68979983-ad52-54ed-a410-94f461390fd7/scratchpad/export-popup.png' });
  }
});
