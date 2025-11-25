// src/features/auth/auth-manager.ts

import { supabase, getUserProfile, updateUserProfile } from '@/lib/supabase';
import { useAuthStore } from '@/core/state';
import type { User, UserProfile, SignUpData, SignInData } from '@/types';
import type { User as SupabaseAuthUser } from '@supabase/supabase-js';

const normalizeSupabaseUser = (user: SupabaseAuthUser): User => ({
  id: user.id,
  email: user.email ?? '',
  created_at: user.created_at ?? new Date().toISOString(),
  app_metadata: user.app_metadata,
  user_metadata: user.user_metadata
});

declare global {
  interface Window {
    openCustomerProfileModal?: () => void;
    openMyGarageModal?: () => void;
    openMyOffersModal?: () => void;
    openMySavedVehiclesModal?: () => void;
    savedVehiclesCache?: any; // SavedVehiclesCache instance
  }
}

/**
 * Authentication Manager
 * Handles user authentication, profile management, and auto-population
 */
export class AuthManager {
  private static instance: AuthManager;
  private profileSubscription: any = null;
  private listenersAttached: boolean = false;
  private boundHandlers = {
    signInClick: () => this.showAuthModal('signin'),
    profileMenuClick: (e: Event) => {
      e.stopPropagation();
      document.getElementById('profile-menu')?.classList.toggle('active');
    },
    outsideClick: () => {
      document.getElementById('profile-menu')?.classList.remove('active');
    },
    menuClick: (e: Event) => {
      const target = e.target as HTMLElement;
      const action = target.closest('[data-action]')?.getAttribute('data-action');
      if (action) {
        e.preventDefault();
        this.handleMenuAction(action);
      }
    },
    fieldModification: (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.dataset.autoFilled === 'true') {
        target.dataset.userModified = 'true';
      }
    }
  };

  private constructor() {}
  
  /**
   * Get singleton instance
   */
  public static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }
  
  /**
   * Initialize auth manager
   */
  public static async initialize(): Promise<void> {
    const manager = AuthManager.getInstance();
    await manager.init();
  }
  
  /**
   * Initialize authentication
   */
  private async init(): Promise<void> {
    
    // Check for existing session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      await this.handleUserSession(session.user);
    } else {
      useAuthStore.getState().setIsLoading(false);
    }
    
    // Listen for auth state changes
    supabase.auth.onAuthStateChange(async (event, session) => {

      if (event === 'SIGNED_IN' && session) {
        await this.handleUserSession(session.user);
      } else if (event === 'SIGNED_OUT') {
        this.handleSignOut();
      } else if (event === 'TOKEN_REFRESHED' && session) {
        useAuthStore.getState().setUser(normalizeSupabaseUser(session.user));
      } else if (event === 'PASSWORD_RECOVERY') {
        // Show password reset modal when user clicks reset link
        this.showPasswordResetModal();
      }
    });

    this.setupProfileDropdown();

    // Subscribe to auth store changes to update UI
    useAuthStore.subscribe((state) => {
      this.updateProfileDropdownUI();
    });
  }
  
  /**
   * Handle user session
   */
  private async handleUserSession(user: SupabaseAuthUser): Promise<void> {
    // Check if email is verified (required for app access)
    if (!user.email_confirmed_at) {
      if (window.showToast) {
        window.showToast('Please verify your email before signing in. Check your inbox for a verification link.', 'warning');
      }
      // Sign out the unverified user
      await supabase.auth.signOut();
      useAuthStore.getState().setIsLoading(false);
      return;
    }

    const normalizedUser = normalizeSupabaseUser(user);
    const authStore = useAuthStore.getState();

    authStore.setUser(normalizedUser);
    authStore.setIsAuthenticated(true);

    // Load user profile
    const profile = await getUserProfile(normalizedUser.id);
    
    if (profile) {
      authStore.setProfile(profile);
      this.autoPopulateFields(profile);
      this.subscribeToProfileChanges(normalizedUser.id);

      // Subscribe to saved vehicles cache realtime updates
      if (window.savedVehiclesCache) {
        window.savedVehiclesCache.subscribe(normalizedUser.id, supabase);
        // Fetch initial vehicles to populate cache
        await window.savedVehiclesCache.getVehicles();
      }

      // Dispatch event for other modules
      window.dispatchEvent(new CustomEvent('profile-loaded', {
        detail: { profile }
      }));
    } else {
      // Create profile if it doesn't exist
      await this.createUserProfile(normalizedUser);
    }
    
    authStore.setIsLoading(false);
  }
  
  /**
   * Create user profile
   */
  private async createUserProfile(user: User): Promise<void> {
    const { data, error } = await supabase
      .from('customer_profiles')
      .insert({
        user_id: user.id,
        email: user.email ?? '',
        full_name: user.user_metadata?.full_name || '',
        phone: user.user_metadata?.phone || '',
      })
      .select()
      .single();
    
    if (data) {
      useAuthStore.getState().setProfile(data);
      this.autoPopulateFields(data);
    } else if (error) {
      // Error creating user profile
    }
  }
  
  /**
   * Handle sign out
   */
  private handleSignOut(): void {
    const authStore = useAuthStore.getState();

    authStore.reset();
    this.clearAutoPopulatedFields();

    if (this.profileSubscription) {
      this.profileSubscription.unsubscribe();
      this.profileSubscription = null;
    }

    // Unsubscribe and clear saved vehicles cache
    if (window.savedVehiclesCache) {
      window.savedVehiclesCache.clear();
    }

    // Dispatch event
    window.dispatchEvent(new CustomEvent('user-signed-out'));
  }
  
  /**
   * Subscribe to profile changes for real-time updates
   */
  private subscribeToProfileChanges(userId: string): void {
    if (this.profileSubscription) {
      this.profileSubscription.unsubscribe();
    }
    
    this.profileSubscription = supabase
      .channel(`profile-changes-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'customer_profiles',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          const updatedProfile = payload.new as UserProfile;
          useAuthStore.getState().setProfile(updatedProfile);
          this.autoPopulateFields(updatedProfile);
          
          // Show toast notification
          if (window.showToast) {
            window.showToast('Profile updated', 'success');
          }
        }
      )
      .subscribe();
  }
  
  /**
   * Auto-populate form fields with user profile data
   */
  private autoPopulateFields(profile: UserProfile): void {
    
    // Field mappings
    const fieldMappings: Record<string, keyof UserProfile | string> = {
      'customer-name': 'full_name',
      'customer-email': 'email',
      'customer-phone': 'phone',
      'credit-score': 'preferred_credit_score',
    };
    
    // Populate each field
    Object.entries(fieldMappings).forEach(([fieldId, profileKey]) => {
      const element = document.getElementById(fieldId) as HTMLInputElement;
      
      if (element && profile[profileKey as keyof UserProfile] !== undefined) {
        const value = profile[profileKey as keyof UserProfile];
        
        // Skip if user has already modified this field
        if (element.dataset.userModified === 'true') {
          return;
        }
        
        // Set value based on element type
        if (element.type === 'checkbox') {
          (element as HTMLInputElement).checked = Boolean(value);
        } else if (element.type === 'radio') {
          const radioElement = document.querySelector(
            `input[name="${element.name}"][value="${value}"]`
          ) as HTMLInputElement;
          if (radioElement) {
            radioElement.checked = true;
          }
        } else {
          element.value = String(value || '');
        }
        
        // Add visual feedback
        element.classList.add('auto-filled');
        element.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
        
        setTimeout(() => {
          element.style.backgroundColor = '';
          element.classList.remove('auto-filled');
        }, 1000);
        
        // Mark as auto-filled
        element.dataset.autoFilled = 'true';
      }
    });
    
    // Auto-populate location field if profile has address
    const locationInput = document.getElementById('quick-location') as HTMLInputElement;
    if (locationInput && profile.street_address && profile.city && profile.state_code) {
      const locationString = `${profile.street_address}, ${profile.city}, ${profile.state_code}${profile.zip_code ? ' ' + profile.zip_code : ''}`;

      if (locationInput.dataset.userModified !== 'true') {
        locationInput.value = locationString;
        locationInput.classList.add('auto-filled');
        locationInput.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';

        setTimeout(() => {
          locationInput.style.backgroundColor = '';
          locationInput.classList.remove('auto-filled');
        }, 1000);

        locationInput.dataset.autoFilled = 'true';
      }
    }

    // Update wizardData if it exists
    if (window.wizardData) {
      window.wizardData.customer.name = profile.full_name || '';
      window.wizardData.customer.email = profile.email || '';
      window.wizardData.customer.phone = profile.phone || '';

      if (profile.preferred_down_payment && window.wizardData.vehicle?.vin) {
        window.wizardData.financing.cashDown = profile.preferred_down_payment;
      }
    }
  }
  
  /**
   * Clear auto-populated fields
   */
  private clearAutoPopulatedFields(): void {
    document.querySelectorAll('[data-auto-filled="true"]').forEach((element) => {
      const input = element as HTMLInputElement;
      
      // Don't clear if user has modified
      if (input.dataset.userModified === 'true') {
        return;
      }
      
      if (input.type === 'checkbox' || input.type === 'radio') {
        input.checked = false;
      } else {
        input.value = '';
      }
      
      input.dataset.autoFilled = 'false';
    });
  }
  
  /**
   * Setup profile dropdown UI
   */
  private setupProfileDropdown(): void {

    // Create dropdown HTML if it doesn't exist
    if (!document.getElementById('profile-dropdown')) {
      const header = document.querySelector('header') || document.querySelector('.header');

      if (header) {
        header.insertAdjacentHTML('beforeend', this.getProfileDropdownHTML());
      } else {
        return;
      }
    }

    // Always attach listeners if not already attached
    if (!this.listenersAttached) {
      this.attachDropdownListeners();
      this.listenersAttached = true;
    }

    this.updateProfileDropdownUI();
  }
  
  /**
   * Get profile dropdown HTML
   */
  private getProfileDropdownHTML(): string {
    return `
      <div id="profile-dropdown" class="profile-dropdown-container">
        <!-- Signed Out State -->
        <button id="btn-sign-in" class="sign-in-btn" style="display: none;">
          <svg class="icon-user" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span>Sign In</span>
        </button>
        
        <!-- Signed In State -->
        <button id="btn-profile-menu" class="profile-trigger" style="display: none;">
          <div class="avatar-circle">
            <div class="avatar-inner">
              <span id="avatar-initial">?</span>
            </div>
          </div>
          <span id="profile-name" class="user-name">User</span>
          <svg class="chevron-down" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        
        <!-- Dropdown Menu -->
        <div id="profile-menu" class="profile-menu">
          <div class="profile-header">
            <div class="avatar-large">
              <span id="avatar-initial-large">?</span>
            </div>
            <div class="user-info">
              <h3 id="menu-user-name">User</h3>
              <p id="menu-user-email">email@example.com</p>
            </div>
          </div>
          
          <nav class="profile-nav">
            <a href="#" data-action="profile">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              My Profile
            </a>
            <a href="#" data-action="garage">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="9" y1="21" x2="9" y2="9"/>
              </svg>
              My Garage
            </a>
            <a href="#" data-action="saved-vehicles">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
              My Saved Vehicles
            </a>
            <a href="#" data-action="offers">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              Saved Offers
            </a>
            <hr class="divider" />
            <a href="#" data-action="sign-out">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign Out
            </a>
          </nav>
        </div>
        
        <!-- Auth Modal -->
        <div id="auth-modal" class="auth-modal">
          <div class="modal-backdrop"></div>
          <div class="modal-content">
            <div class="modal-header">
              <h2 id="auth-modal-title" class="modal-title">Sign In</h2>
              <button id="btn-close-auth" class="modal-close">&times;</button>
            </div>
            
            <div class="auth-tabs">
              <button class="tab active" data-mode="signin">Sign In</button>
              <button class="tab" data-mode="signup">Create Account</button>
            </div>
            
            <form id="auth-form" class="auth-form">
              <!-- Sign In/Up Fields -->
              <div class="form-group" data-show="signin signup">
                <label>Email</label>
                <input type="email" id="auth-email" name="email" required 
                       placeholder="Enter your email" autocomplete="email">
              </div>
              
              <div class="form-group" data-show="signin signup">
                <label>Password</label>
                <input type="password" id="auth-password" name="password" required
                       placeholder="Enter your password" autocomplete="current-password">
              </div>
              
              <!-- Sign Up Only Fields -->
              <div class="form-group" data-show="signup" style="display: none;">
                <label>Full Name</label>
                <input type="text" id="auth-fullname" name="fullName" 
                       placeholder="Enter your full name" autocomplete="name">
              </div>
              
              <div class="form-group" data-show="signup" style="display: none;">
                <label>Phone</label>
                <input type="tel" id="auth-phone" name="phone"
                       placeholder="(555) 123-4567" autocomplete="tel">
              </div>
              
              <button type="submit" class="btn-primary" id="btn-auth-submit">
                <span data-show="signin">Sign In</span>
                <span data-show="signup" style="display: none;">Create Account</span>
              </button>

              <!-- Forgot Password Link (sign in only) -->
              <div class="forgot-password-link" data-show="signin">
                <button type="button" id="btn-forgot-password">Forgot password?</button>
              </div>

              <!-- OAuth Divider -->
              <div class="oauth-divider">
                <span>or continue with</span>
              </div>

              <!-- OAuth Buttons -->
              <div class="oauth-buttons">
                <button type="button" class="oauth-btn" data-provider="google">
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span>Google</span>
                </button>
                <button type="button" class="oauth-btn" data-provider="apple">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  <span>Apple</span>
                </button>
              </div>
            </form>

            <!-- Forgot Password Form (hidden by default) -->
            <form id="forgot-password-form" class="auth-form" style="display: none;">
              <p class="forgot-password-desc">Enter your email and we'll send you a link to reset your password.</p>
              <div class="form-group">
                <label>Email</label>
                <input type="email" id="forgot-email" name="email" required
                       placeholder="Enter your email" autocomplete="email">
              </div>
              <button type="submit" class="btn-primary" id="btn-forgot-submit">
                Send Reset Link
              </button>
              <button type="button" class="btn-secondary" id="btn-back-to-signin">
                Back to Sign In
              </button>
            </form>
          </div>
        </div>

        <!-- Password Reset Modal (shown when user clicks reset link in email) -->
        <div id="password-reset-modal" class="auth-modal">
          <div class="modal-backdrop"></div>
          <div class="modal-content">
            <div class="modal-header">
              <h2 class="modal-title">Set New Password</h2>
              <button id="btn-close-reset" class="modal-close">&times;</button>
            </div>
            <form id="password-reset-form" class="auth-form">
              <p class="reset-password-desc">Enter your new password below.</p>
              <div class="form-group">
                <label>New Password</label>
                <input type="password" id="new-password" name="newPassword" required
                       minlength="6" placeholder="Enter new password" autocomplete="new-password">
              </div>
              <div class="form-group">
                <label>Confirm Password</label>
                <input type="password" id="confirm-password" name="confirmPassword" required
                       minlength="6" placeholder="Confirm new password" autocomplete="new-password">
              </div>
              <button type="submit" class="btn-primary" id="btn-reset-submit">
                Update Password
              </button>
            </form>
          </div>
        </div>
      </div>
    `;
  }
  
  /**
   * Attach dropdown event listeners
   */
  private attachDropdownListeners(): void {
    // Sign in button
    const signInBtn = document.getElementById('btn-sign-in');
    signInBtn?.removeEventListener('click', this.boundHandlers.signInClick);
    signInBtn?.addEventListener('click', this.boundHandlers.signInClick);

    // Profile menu trigger
    const profileMenuBtn = document.getElementById('btn-profile-menu');
    const profileMenu = document.getElementById('profile-menu');

    profileMenuBtn?.removeEventListener('click', this.boundHandlers.profileMenuClick);
    profileMenuBtn?.addEventListener('click', this.boundHandlers.profileMenuClick);

    // Close menu on outside click
    document.removeEventListener('click', this.boundHandlers.outsideClick);
    document.addEventListener('click', this.boundHandlers.outsideClick);

    // Menu actions - THIS IS THE KEY LISTENER FOR MODAL OPENING
    if (profileMenu) {
      profileMenu.removeEventListener('click', this.boundHandlers.menuClick);
      profileMenu.addEventListener('click', this.boundHandlers.menuClick);
    }

    // Track field modifications
    document.removeEventListener('input', this.boundHandlers.fieldModification);
    document.addEventListener('input', this.boundHandlers.fieldModification);

    // Auth modal
    this.setupAuthModal();
  }
  
  /**
   * Track when user manually modifies fields
   * NOTE: This is now handled directly via boundHandlers.fieldModification in attachDropdownListeners
   */
  
  /**
   * Setup auth modal
   */
  private setupAuthModal(): void {
    const modal = document.getElementById('auth-modal');
    const closeBtn = document.getElementById('btn-close-auth');
    const form = document.getElementById('auth-form') as HTMLFormElement;
    const tabs = document.querySelectorAll('.auth-tabs .tab');

    // Close modal
    closeBtn?.addEventListener('click', () => this.hideAuthModal());

    // Backdrop click
    modal?.querySelector('.modal-backdrop')?.addEventListener('click', () => {
      this.hideAuthModal();
    });

    // Tab switching
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const mode = tab.getAttribute('data-mode') as 'signin' | 'signup';
        this.switchAuthMode(mode);
      });
    });

    // Form submission
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleAuthSubmit(form);
    });

    // OAuth buttons
    document.querySelectorAll('.oauth-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const provider = btn.getAttribute('data-provider') as 'google' | 'apple';
        try {
          await this.signInWithOAuth(provider);
        } catch (error: any) {
          if (window.showToast) {
            window.showToast(error.message || 'OAuth sign in failed', 'error');
          }
        }
      });
    });

    // Forgot password button
    document.getElementById('btn-forgot-password')?.addEventListener('click', () => {
      this.showForgotPasswordUI();
    });

    // Forgot password form submission
    const forgotForm = document.getElementById('forgot-password-form') as HTMLFormElement;
    forgotForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleForgotPasswordSubmit(forgotForm);
    });

    // Back to sign in button
    document.getElementById('btn-back-to-signin')?.addEventListener('click', () => {
      this.resetAuthModalState();
      this.switchAuthMode('signin');
    });

    // Setup password reset modal
    this.setupPasswordResetModal();
  }

  /**
   * Setup password reset modal (for when user clicks reset link in email)
   */
  private setupPasswordResetModal(): void {
    const modal = document.getElementById('password-reset-modal');
    const closeBtn = document.getElementById('btn-close-reset');
    const form = document.getElementById('password-reset-form') as HTMLFormElement;

    // Close modal
    closeBtn?.addEventListener('click', () => this.hidePasswordResetModal());

    // Backdrop click
    modal?.querySelector('.modal-backdrop')?.addEventListener('click', () => {
      this.hidePasswordResetModal();
    });

    // Form submission
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handlePasswordResetSubmit(form);
    });
  }

  /**
   * Handle forgot password form submission
   */
  private async handleForgotPasswordSubmit(form: HTMLFormElement): Promise<void> {
    const formData = new FormData(form);
    const email = formData.get('email') as string;
    const submitBtn = document.getElementById('btn-forgot-submit') as HTMLButtonElement;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {
      await this.sendPasswordResetEmail(email);

      if (window.showToast) {
        window.showToast('Password reset link sent! Check your email.', 'success');
      }

      // Go back to sign in
      this.resetAuthModalState();
      this.switchAuthMode('signin');
      form.reset();
    } catch (error: any) {
      if (window.showToast) {
        window.showToast(error.message || 'Failed to send reset email', 'error');
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Reset Link';
    }
  }

  /**
   * Handle password reset form submission (new password)
   */
  private async handlePasswordResetSubmit(form: HTMLFormElement): Promise<void> {
    const formData = new FormData(form);
    const newPassword = formData.get('newPassword') as string;
    const confirmPassword = formData.get('confirmPassword') as string;
    const submitBtn = document.getElementById('btn-reset-submit') as HTMLButtonElement;

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      if (window.showToast) {
        window.showToast('Passwords do not match', 'error');
      }
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating...';

    try {
      await this.updatePassword(newPassword);

      if (window.showToast) {
        window.showToast('Password updated successfully!', 'success');
      }

      this.hidePasswordResetModal();
      form.reset();
    } catch (error: any) {
      if (window.showToast) {
        window.showToast(error.message || 'Failed to update password', 'error');
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Update Password';
    }
  }
  
  /**
   * Show auth modal
   */
  public showAuthModal(mode: 'signin' | 'signup'): void {
    const modal = document.getElementById('auth-modal');
    modal?.classList.add('active');
    this.switchAuthMode(mode);
  }
  
  /**
   * Hide auth modal
   */
  private hideAuthModal(): void {
    const modal = document.getElementById('auth-modal');
    modal?.classList.remove('active');

    // Reset forms
    const form = document.getElementById('auth-form') as HTMLFormElement;
    const forgotForm = document.getElementById('forgot-password-form') as HTMLFormElement;
    form?.reset();
    forgotForm?.reset();

    // Reset modal state (show auth form, hide forgot password form)
    this.resetAuthModalState();
  }
  
  /**
   * Switch auth mode
   */
  private switchAuthMode(mode: 'signin' | 'signup'): void {
    // Update tabs
    document.querySelectorAll('.auth-tabs .tab').forEach(tab => {
      if (tab.getAttribute('data-mode') === mode) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
    
    // Update title
    const title = document.getElementById('auth-modal-title');
    if (title) {
      title.textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
    }
    
    // Show/hide fields
    document.querySelectorAll('[data-show]').forEach(element => {
      const showFor = element.getAttribute('data-show')?.split(' ') || [];
      
      if (showFor.includes(mode)) {
        (element as HTMLElement).style.display = '';
      } else {
        (element as HTMLElement).style.display = 'none';
      }
    });
  }
  
  /**
   * Handle auth form submission
   */
  private async handleAuthSubmit(form: HTMLFormElement): Promise<void> {
    const formData = new FormData(form);
    const mode = document.querySelector('.auth-tabs .tab.active')?.getAttribute('data-mode');
    const submitBtn = document.getElementById('btn-auth-submit') as HTMLButtonElement;
    
    // Disable button
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Processing...';
    
    try {
      if (mode === 'signin') {
        await this.signIn({
          email: formData.get('email') as string,
          password: formData.get('password') as string
        });
      } else {
        await this.signUp({
          email: formData.get('email') as string,
          password: formData.get('password') as string,
          fullName: formData.get('fullName') as string,
          phone: formData.get('phone') as string
        });
      }
      
      this.hideAuthModal();
      
      if (window.showToast) {
        window.showToast(
          mode === 'signin' ? 'Welcome back!' : 'Account created successfully!',
          'success'
        );
      }
    } catch (error: any) {
      if (window.showToast) {
        window.showToast(error.message || 'Authentication failed', 'error');
      }
    } finally {
      // Reset button
      submitBtn.disabled = false;
      submitBtn.innerHTML = mode === 'signin' ? 'Sign In' : 'Create Account';
    }
  }
  
  /**
   * Handle menu actions
   */
  private async handleMenuAction(action: string): Promise<void> {
    const profileMenu = document.getElementById('profile-menu');
    profileMenu?.classList.remove('active');

    switch (action) {
      case 'profile':
        if (typeof window.openCustomerProfileModal === 'function') {
          window.openCustomerProfileModal();
        }
        break;

      case 'garage':
        if (typeof window.openMyGarageModal === 'function') {
          window.openMyGarageModal();
        }
        break;

      case 'saved-vehicles':
        if (typeof window.openMySavedVehiclesModal === 'function') {
          window.openMySavedVehiclesModal();
        }
        break;

      case 'offers':
        if (typeof window.openMyOffersModal === 'function') {
          window.openMyOffersModal();
        }
        break;

      case 'sign-out':
        await this.signOut();
        break;
    }
  }
  
  /**
   * Update profile dropdown UI based on auth state
   */
  private updateProfileDropdownUI(): void {
    const authStore = useAuthStore.getState();
    const signInBtn = document.getElementById('btn-sign-in');
    const profileMenuBtn = document.getElementById('btn-profile-menu');


    if (!signInBtn || !profileMenuBtn) {
      return;
    }

    if (authStore.isAuthenticated && authStore.profile) {
      // Show profile button
      signInBtn.style.display = 'none';
      profileMenuBtn.style.display = 'flex';

      // Update profile info
      const profile = authStore.profile;
      const initial = (profile.full_name || profile.email || '?')[0].toUpperCase();

      const avatarInitial = document.getElementById('avatar-initial');
      const avatarInitialLarge = document.getElementById('avatar-initial-large');
      const profileName = document.getElementById('profile-name');
      const menuUserName = document.getElementById('menu-user-name');
      const menuUserEmail = document.getElementById('menu-user-email');

      if (avatarInitial) avatarInitial.textContent = initial;
      if (avatarInitialLarge) avatarInitialLarge.textContent = initial;
      if (profileName) profileName.textContent = profile.full_name || 'User';
      if (menuUserName) menuUserName.textContent = profile.full_name || 'User';
      if (menuUserEmail) menuUserEmail.textContent = profile.email;

    } else {
      // Show sign in button
      signInBtn.style.display = 'flex';
      profileMenuBtn.style.display = 'none';
    }
  }
  
  // ========================================
  // Public API Methods
  // ========================================
  
  /**
   * Sign in user
   */
  public async signIn(data: SignInData): Promise<void> {
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password
    });
    
    if (error) throw error;
    
    // Session will be handled by auth state change listener
  }
  
  /**
   * Sign up user
   */
  public async signUp(data: SignUpData): Promise<void> {
    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.fullName,
          phone: data.phone
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      }
    });

    if (error) throw error;

    // Check if email confirmation is required
    if (authData.user && !authData.session) {
      // Email confirmation required - notify user with success message
      if (window.showToast) {
        window.showToast('Account created! Please check your email to verify your account.', 'success');
      }
      // Return normally - this is a success, not an error
      return;
    }

    // Session will be handled by auth state change listener
  }
  
  /**
   * Sign out user
   */
  public async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      throw error;
    }
    
    // State cleanup will be handled by auth state change listener
    
    if (window.showToast) {
      window.showToast('Signed out successfully', 'info');
    }
  }
  
  /**
   * Update user profile
   */
  public async updateProfile(updates: Partial<UserProfile>): Promise<void> {
    const user = useAuthStore.getState().user;

    if (!user) {
      throw new Error('No user logged in');
    }

    const updatedProfile = await updateUserProfile(user.id, updates);

    if (updatedProfile) {
      useAuthStore.getState().setProfile(updatedProfile);
      this.autoPopulateFields(updatedProfile);

      if (window.showToast) {
        window.showToast('Profile updated successfully', 'success');
      }
    }
  }

  /**
   * Sign in with OAuth provider (Google or Apple)
   */
  public async signInWithOAuth(provider: 'google' | 'apple'): Promise<void> {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      }
    });

    if (error) throw error;
  }

  /**
   * Send password reset email
   */
  public async sendPasswordResetEmail(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });

    if (error) throw error;
  }

  /**
   * Update password (after reset link clicked)
   */
  public async updatePassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) throw error;
  }

  /**
   * Show password reset modal (called when PASSWORD_RECOVERY event fires)
   */
  public showPasswordResetModal(): void {
    const modal = document.getElementById('password-reset-modal');
    modal?.classList.add('active');
  }

  /**
   * Hide password reset modal
   */
  private hidePasswordResetModal(): void {
    const modal = document.getElementById('password-reset-modal');
    modal?.classList.remove('active');

    // Reset form
    const form = document.getElementById('password-reset-form') as HTMLFormElement;
    form?.reset();
  }

  /**
   * Show forgot password UI in auth modal
   */
  public showForgotPasswordUI(): void {
    // Update modal to show forgot password view
    const title = document.getElementById('auth-modal-title');
    if (title) {
      title.textContent = 'Reset Password';
    }

    // Hide tabs
    const tabs = document.querySelector('.auth-tabs') as HTMLElement;
    if (tabs) {
      tabs.style.display = 'none';
    }

    // Show forgot password form, hide regular form
    const authForm = document.getElementById('auth-form') as HTMLElement;
    const forgotForm = document.getElementById('forgot-password-form') as HTMLElement;
    if (authForm) authForm.style.display = 'none';
    if (forgotForm) forgotForm.style.display = 'block';
  }

  /**
   * Reset auth modal to default state
   */
  private resetAuthModalState(): void {
    // Show tabs
    const tabs = document.querySelector('.auth-tabs') as HTMLElement;
    if (tabs) {
      tabs.style.display = '';
    }

    // Show auth form, hide forgot password form
    const authForm = document.getElementById('auth-form') as HTMLElement;
    const forgotForm = document.getElementById('forgot-password-form') as HTMLElement;
    if (authForm) authForm.style.display = '';
    if (forgotForm) forgotForm.style.display = 'none';
  }
}

// Export singleton instance
export default AuthManager.getInstance();
