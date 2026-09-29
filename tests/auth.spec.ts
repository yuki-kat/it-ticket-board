import { expect, test } from '@playwright/test'

// Test the auth flow: signup, login, and localStorage persistence
test.describe('Authentication', () => {
  test('signup persists both token and user to localStorage', async ({ page, context }) => {
    // Clear all cookies and storage before test
    await context.clearCookies()
    await page.goto('/index.html')

    // Clear localStorage on the page
    await page.evaluate(() => {
      localStorage.clear()
    })

    // Generate unique email for this test run
    const uniqueEmail = `test-${Date.now()}@example.com`
    const password = 'test123456'
    const name = 'Test User'

    console.log('Starting signup test with:', uniqueEmail)

    // Fill signup form
    await page.fill('input[type="email"]', uniqueEmail)
    await page.fill('input[type="password"]', password)

    // Switch to signup mode if not already there
    const toggleButton = page.locator('button:has-text("Don\'t have an account")')
    const isVisible = await toggleButton.isVisible()
    if (isVisible) {
      await toggleButton.click()
    }

    // Now fill the name field (only visible in signup mode)
    await page.fill('input[placeholder="Your name"]', name)

    // Submit form
    const submitButton = page.locator('button[type="submit"]:has-text("Sign up")')
    await submitButton.click()

    // Wait for page to redirect - look for the authenticated state
    // The app should show the main content (home page) not the signin page
    await expect(page.locator('.home-kpi-grid, .primary-nav')).toBeVisible({ timeout: 10000 })

    // Now check localStorage
    const storedToken = await page.evaluate(() => localStorage.getItem('auth_token'))
    const storedUser = await page.evaluate(() => localStorage.getItem('auth_user'))

    console.log('auth_token:', storedToken ? storedToken.substring(0, 50) + '...' : 'null')
    console.log('auth_user:', storedUser)

    // Verify both are stored
    expect(storedToken).toBeTruthy()
    expect(storedToken).toMatch(/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'Token should be a valid JWT')

    expect(storedUser).toBeTruthy()

    // Parse and verify user object structure
    const userObj = JSON.parse(storedUser!)
    expect(userObj).toHaveProperty('id')
    expect(userObj).toHaveProperty('email')
    expect(userObj).toHaveProperty('name')
    expect(userObj.email).toBe(uniqueEmail)
    expect(userObj.name).toBe(name)

    console.log('✓ Signup persisted user object:', userObj)
  })

  test('reload page preserves auth state from localStorage', async ({ page, context }) => {
    // Clear before test
    await context.clearCookies()

    const uniqueEmail = `test-reload-${Date.now()}@example.com`
    const password = 'test123456'
    const name = 'Reload Test User'

    // First signup
    await page.goto('/index.html')
    await page.evaluate(() => localStorage.clear())

    await page.fill('input[type="email"]', uniqueEmail)
    await page.fill('input[type="password"]', password)

    const toggleButton = page.locator('button:has-text("Don\'t have an account")')
    if (await toggleButton.isVisible()) {
      await toggleButton.click()
    }

    await page.fill('input[placeholder="Your name"]', name)
    await page.locator('button[type="submit"]:has-text("Sign up")').click()

    // Wait for authenticated state
    await expect(page.locator('.home-kpi-grid, .primary-nav')).toBeVisible({ timeout: 10000 })

    // Get the stored auth data
    const tokenBefore = await page.evaluate(() => localStorage.getItem('auth_token'))
    const userBefore = await page.evaluate(() => localStorage.getItem('auth_user'))

    expect(tokenBefore).toBeTruthy()
    expect(userBefore).toBeTruthy()

    // Now reload the page
    console.log('Reloading page...')
    await page.reload()

    // Should still be authenticated without needing to sign in again
    await expect(page.locator('.home-kpi-grid, .primary-nav')).toBeVisible({ timeout: 5000 })

    // Verify localStorage is still intact
    const tokenAfter = await page.evaluate(() => localStorage.getItem('auth_token'))
    const userAfter = await page.evaluate(() => localStorage.getItem('auth_user'))

    expect(tokenAfter).toBe(tokenBefore)
    expect(userAfter).toBe(userBefore)

    console.log('✓ Auth state persisted across reload')
  })

  test('login also persists token and user to localStorage', async ({ page, context }) => {
    // Use a pre-existing test account (must exist in database)
    // For this test to work, you need to have created an account with this email first
    await context.clearCookies()

    const testEmail = 'test-login@example.com'
    const testPassword = 'test123456'

    // First, create the account
    await page.goto('/index.html')
    await page.evaluate(() => localStorage.clear())

    // Signup with this email first
    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', testPassword)

    const toggleButton = page.locator('button:has-text("Don\'t have an account")')
    if (await toggleButton.isVisible()) {
      await toggleButton.click()
    }

    await page.fill('input[placeholder="Your name"]', 'Test Login User')
    await page.locator('button[type="submit"]:has-text("Sign up")').click()

    // Wait for authenticated state
    await expect(page.locator('.home-kpi-grid, .primary-nav')).toBeVisible({ timeout: 10000 })

    // Logout
    const logoutButton = page.locator('button:has-text("Logout")')
    await logoutButton.click()

    // Should be back to signin page
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 5000 })

    // Now login
    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', testPassword)

    // Make sure we're in login mode (not signup)
    const signupToggle = page.locator('button:has-text("Don\'t have an account")')
    if (await signupToggle.isVisible()) {
      // Already in login mode
    }

    await page.locator('button[type="submit"]:has-text("Sign in")').click()

    // Wait for authenticated state
    await expect(page.locator('.home-kpi-grid, .primary-nav')).toBeVisible({ timeout: 10000 })

    // Check localStorage
    const storedToken = await page.evaluate(() => localStorage.getItem('auth_token'))
    const storedUser = await page.evaluate(() => localStorage.getItem('auth_user'))

    expect(storedToken).toBeTruthy()
    expect(storedUser).toBeTruthy()

    const userObj = JSON.parse(storedUser!)
    expect(userObj.email).toBe(testEmail)

    console.log('✓ Login persisted user object:', userObj)
  })
})
