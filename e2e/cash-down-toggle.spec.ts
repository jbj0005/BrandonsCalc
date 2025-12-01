import { test, expect } from '@playwright/test';

test.describe('Cash Down three-state toggle', () => {
  test('cycles to $0 and updates the slider value', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('h1:has-text("Brandon\'s Calculator")', { timeout: 10000 });

    // Locate the Cash Down currency input that sits beside the label
    const cashDownInput = page
      .locator('label:has-text("Cash Down")')
      .locator('xpath=../following-sibling::input');

    await expect(cashDownInput).toBeVisible();

    // Set a manual value so we can verify the toggle overwrites it
    await cashDownInput.fill('4400');
    await cashDownInput.press('Tab');
    await expect(cashDownInput).toHaveValue(/\$4,?400/i);

    // Click the three-state toggle once (preference -> $0)
    const cashDownToggle = page.getByTitle(/Click to cycle/i);
    await cashDownToggle.click();

    // Verify both the input and underlying range reflect $0
    await expect(cashDownInput).toHaveValue('$0');

    const cashDownRange = cashDownInput.locator('xpath=../following-sibling::div//input[@type="range"]');
    await expect(cashDownRange).toHaveValue('0');
  });
});
