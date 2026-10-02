import { expect, test } from '@playwright/test'

test('the local board opens without creating auth credentials', async ({ page }) => {
  await page.goto('/index.html')

  await expect(page.getByRole('heading', { name: 'Good to see you.' })).toBeVisible()

  const credentials = await page.evaluate(() => ({
    token: localStorage.getItem('auth_token'),
    user: localStorage.getItem('auth_user')
  }))

  expect(credentials).toEqual({ token: null, user: null })
})
