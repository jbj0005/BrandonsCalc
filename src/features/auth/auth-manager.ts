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
      console.error('Error creating user profile:', error);
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
        console.error('❌ [Auth Manager] Header element not found! Cannot inject profile dropdown');
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
    
    // Reset form
    const form = document.getElementById('auth-form') as HTMLFormElement;
    form?.reset();
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
        }
      }
    });
    
    if (error) throw error;
    
    // Session will be handled by auth state change listener
  }
  
  /**
   * Sign out user
   */
  public async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      console.error('Error signing out:', error);
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
}

// Export singleton instance
export default AuthManager.getInstance();
