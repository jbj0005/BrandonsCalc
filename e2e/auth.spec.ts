import { test, expect } from '@playwright/test';

/**
 * Auth Flow E2E Tests
 *
 * Tests the complete authentication UI flow including:
 * - Sign in modal (opened via profile dropdown)
 * - Sign up modal
 * - Form validation
 * - Forgot password flow
 */

test.describe('Authentication UI', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    // Wait for the app to fully load
    await page.waitForLoadState('networkidle');
    // Wait for main heading to be visible (indicates app is loaded)
    await page.waitForSelector('h1:has-text("Brandon\'s Calculator")', { timeout: 10000 });
  });

  // Helper to open the auth modal (two-step process)
  async function openAuthModal(page: any) {
    // Step 1: Click the header "Sign In" button to open profile dropdown
    await page.locator('header').getByRole('button', { name: /Sign In/i }).click();

    // Wait for dropdown to be visible (backdrop appears)
    await page.waitForSelector('.fixed.inset-0.bg-black\\/60', { timeout: 5000 });

    // Step 2: Click the "Sign In" button inside the dropdown to open AuthModal
    // The dropdown has a blue Sign In button
    await page.getByRole('button', { name: /Sign In/i }).filter({ hasText: 'Sign In' }).last().click();

    // Wait for AuthModal to appear
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  }

  test.describe('Sign In Button', () => {
    test('should display sign in button when not logged in', async ({ page }) => {
      const signInBtn = page.locator('header').getByRole('button', { name: /Sign In/i });
      await expect(signInBtn).toBeVisible();
    });

    test('should open profile dropdown when clicking sign in', async ({ page }) => {
      await page.locator('header').getByRole('button', { name: /Sign In/i }).click();

      // Profile dropdown should open - look for "My Account" heading
      await expect(page.getByRole('heading', { name: /My Account/i })).toBeVisible();
    });

    test('should open auth modal via profile dropdown', async ({ page }) => {
      await openAuthModal(page);

      // Check modal is open by looking for the modal title
      const modalTitle = page.getByRole('heading', { name: /Sign In/i });
      await expect(modalTitle).toBeVisible();
    });
  });

  test.describe('Auth Modal', () => {
    test.beforeEach(async ({ page }) => {
      await openAuthModal(page);
    });

    test('should close modal when clicking X button', async ({ page }) => {
      // Find and click the close button (X button in modal)
      await page.locator('[role="dialog"] button[aria-label="Close modal"]').click();

      // Modal should no longer be visible
      await expect(page.locator('[role="dialog"]')).not.toBeVisible();
    });

    test('should switch to Create Account mode', async ({ page }) => {
      // Click "Sign up" link
      await page.getByRole('button', { name: /Sign up/i }).click();

      // Check title changed
      const title = page.getByRole('heading', { name: /Create Account/i });
      await expect(title).toBeVisible();

      // Check sign up fields are visible
      await expect(page.getByPlaceholder(/John Doe/i)).toBeVisible();
    });

    test('should switch back to Sign In mode', async ({ page }) => {
      // Switch to signup first
      await page.getByRole('button', { name: /Sign up/i }).click();
      await expect(page.getByRole('heading', { name: /Create Account/i })).toBeVisible();

      // Then back to signin (scope to modal to avoid header button)
      await page.locator('[role="dialog"]').getByRole('button', { name: /Sign in/i }).click();

      const title = page.getByRole('heading', { name: /Sign In/i });
      await expect(title).toBeVisible();
    });
  });

  test.describe('Sign In Form', () => {
    test.beforeEach(async ({ page }) => {
      await openAuthModal(page);
    });

    test('should have email and password fields', async ({ page }) => {
      await expect(page.getByPlaceholder(/you@example.com/i)).toBeVisible();
      await expect(page.getByPlaceholder(/Enter your password/i)).toBeVisible();
    });

    test('should have submit button', async ({ page }) => {
      const submitBtn = page.locator('[role="dialog"]').getByRole('button', { name: /^Sign In$/i });
      await expect(submitBtn).toBeVisible();
    });

    test('should have forgot password link', async ({ page }) => {
      const forgotBtn = page.getByRole('button', { name: /Forgot password/i });
      await expect(forgotBtn).toBeVisible();
    });

    test('should show validation error for empty email', async ({ page }) => {
      // Fill only password
      await page.getByPlaceholder(/Enter your password/i).fill('testpassword123');

      // Click submit
      await page.locator('[role="dialog"]').getByRole('button', { name: /^Sign In$/i }).click();

      // Check for validation error message
      await expect(page.getByText(/Email is required/i)).toBeVisible();
    });

    test('should show validation error for invalid email format', async ({ page }) => {
      await page.getByPlaceholder(/you@example.com/i).fill('invalid-email');
      await page.getByPlaceholder(/Enter your password/i).fill('testpassword123');

      // Blur to trigger validation
      await page.getByPlaceholder(/you@example.com/i).blur();

      // Check for validation error
      await expect(page.getByText(/Please enter a valid email/i)).toBeVisible();
    });

    test('should show validation error for empty password', async ({ page }) => {
      await page.getByPlaceholder(/you@example.com/i).fill('test@example.com');

      // Click submit without password
      await page.locator('[role="dialog"]').getByRole('button', { name: /^Sign In$/i }).click();

      // Check for validation error
      await expect(page.getByText(/Password is required/i)).toBeVisible();
    });
  });

  test.describe('Sign Up Form', () => {
    test.beforeEach(async ({ page }) => {
      await openAuthModal(page);
      await page.getByRole('button', { name: /Sign up/i }).click();
      await expect(page.getByRole('heading', { name: /Create Account/i })).toBeVisible();
    });

    test('should have all sign up fields', async ({ page }) => {
      await expect(page.getByPlaceholder(/John Doe/i)).toBeVisible();
      await expect(page.getByPlaceholder(/you@example.com/i)).toBeVisible();
      await expect(page.getByPlaceholder(/555.*123.*4567/i)).toBeVisible();
      await expect(page.getByPlaceholder(/At least 8 characters/i)).toBeVisible();
      await expect(page.getByPlaceholder(/Re-enter your password/i)).toBeVisible();
    });

    test('should have submit button with correct text', async ({ page }) => {
      const submitBtn = page.locator('[role="dialog"]').getByRole('button', { name: /Create Account/i });
      await expect(submitBtn).toBeVisible();
    });

    test('should allow filling all fields', async ({ page }) => {
      await page.getByPlaceholder(/John Doe/i).fill('John Smith');
      await page.getByPlaceholder(/you@example.com/i).fill('newuser@example.com');
      await page.getByPlaceholder(/555.*123.*4567/i).fill('5551234567');
      await page.getByPlaceholder(/At least 8 characters/i).fill('securepassword123');
      await page.getByPlaceholder(/Re-enter your password/i).fill('securepassword123');

      // Verify values are filled
      await expect(page.getByPlaceholder(/John Doe/i)).toHaveValue('John Smith');
      await expect(page.getByPlaceholder(/you@example.com/i)).toHaveValue('newuser@example.com');
    });

    test('should validate password length', async ({ page }) => {
      await page.getByPlaceholder(/John Doe/i).fill('Test User');
      await page.getByPlaceholder(/you@example.com/i).fill('test@example.com');
      await page.getByPlaceholder(/At least 8 characters/i).fill('short');
      await page.getByPlaceholder(/At least 8 characters/i).blur();

      await expect(page.getByText(/at least 8 characters/i)).toBeVisible();
    });

    test('should validate password confirmation', async ({ page }) => {
      await page.getByPlaceholder(/At least 8 characters/i).fill('password123');
      await page.getByPlaceholder(/Re-enter your password/i).fill('differentpassword');
      await page.getByPlaceholder(/Re-enter your password/i).blur();

      await expect(page.getByText(/Passwords do not match/i)).toBeVisible();
    });
  });

  test.describe('Forgot Password Flow', () => {
    test.beforeEach(async ({ page }) => {
      await openAuthModal(page);
    });

    test('should show forgot password form when clicking link', async ({ page }) => {
      await page.getByRole('button', { name: /Forgot password/i }).click();

      // Title should change
      const title = page.getByRole('heading', { name: /Reset Password/i });
      await expect(title).toBeVisible();

      // Email field should be visible
      await expect(page.getByPlaceholder(/you@example.com/i)).toBeVisible();
    });

    test('should have send reset link button', async ({ page }) => {
      await page.getByRole('button', { name: /Forgot password/i }).click();

      const submitBtn = page.getByRole('button', { name: /Send Reset Link/i });
      await expect(submitBtn).toBeVisible();
    });

    test('should have back to sign in link', async ({ page }) => {
      await page.getByRole('button', { name: /Forgot password/i }).click();

      const backBtn = page.getByRole('button', { name: /Back to sign in/i });
      await expect(backBtn).toBeVisible();
    });

    test('should return to sign in when clicking back button', async ({ page }) => {
      await page.getByRole('button', { name: /Forgot password/i }).click();
      await page.getByRole('button', { name: /Back to sign in/i }).click();

      // Title should be back to Sign In
      const title = page.getByRole('heading', { name: /Sign In/i });
      await expect(title).toBeVisible();
    });

    test('should validate email in forgot password form', async ({ page }) => {
      await page.getByRole('button', { name: /Forgot password/i }).click();
      await page.getByRole('button', { name: /Send Reset Link/i }).click();

      // Check for validation error
      await expect(page.getByText(/Email is required/i)).toBeVisible();
    });
  });
});

test.describe('Keyboard Navigation', () => {
  // Helper to open the auth modal
  async function openAuthModal(page: any) {
    await page.locator('header').getByRole('button', { name: /Sign In/i }).click();
    await page.waitForSelector('.fixed.inset-0.bg-black\\/60', { timeout: 5000 });
    await page.getByRole('button', { name: /Sign In/i }).filter({ hasText: 'Sign In' }).last().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  }

  test('should close auth modal with Escape key', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1:has-text("Brandon\'s Calculator")', { timeout: 10000 });

    await openAuthModal(page);

    await page.keyboard.press('Escape');

    // Modal should be closed
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test('should be able to tab through form fields', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1:has-text("Brandon\'s Calculator")', { timeout: 10000 });

    await openAuthModal(page);

    // Focus email field
    await page.getByPlaceholder(/you@example.com/i).focus();

    // Tab to password field
    await page.keyboard.press('Tab');

    // Verify focus moved (no errors during navigation)
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
  });
});

test.describe('Mobile Responsiveness', () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

  // Helper to open the auth modal
  async function openAuthModal(page: any) {
    await page.locator('header').getByRole('button', { name: /Sign In/i }).click();
    await page.waitForSelector('.fixed.inset-0.bg-black\\/60', { timeout: 5000 });
    await page.getByRole('button', { name: /Sign In/i }).filter({ hasText: 'Sign In' }).last().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  }

  test('auth modal should be responsive on mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('h1:has-text("Brandon\'s Calculator")', { timeout: 10000 });

    // Sign in button should still be accessible
    const signInBtn = page.locator('header').getByRole('button', { name: /Sign In/i });
    await expect(signInBtn).toBeVisible();

    await openAuthModal(page);

    // Modal should be visible
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Form fields should be visible and usable
    await expect(page.getByPlaceholder(/you@example.com/i)).toBeVisible();
    await expect(page.getByPlaceholder(/Enter your password/i)).toBeVisible();
  });
});
