# ExcelCalc Hybrid Modernization Plan

## Philosophy: Evolution, Not Revolution

Keep your working vanilla JS app while gradually adding modern tooling and patterns. No big rewrite, just smart incremental improvements.

---

## Phase 1: Foundation Setup (Week 1)

### 1.1 Add TypeScript Support (No Breaking Changes)
```bash
npm install --save-dev typescript @types/node
npm install --save-dev esbuild  # Fast bundler for TS
```

**Create `tsconfig.json`:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM"],
    "allowJs": true,           // Key: allows .js and .ts to coexist
    "checkJs": false,          // Don't type-check existing JS yet
    "strict": false,           // Start lenient, tighten later
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*", "*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**Strategy**:
- Existing `.js` files keep working
- New features written in `.ts`
- Gradually convert `.js` → `.ts` when touched

### 1.2 Reorganize File Structure
```
BrandonsCalc/
├── src/
│   ├── core/
│   │   ├── state.ts          # NEW: Central state management
│   │   └── events.ts         # NEW: Event bus for communication
│   ├── features/
│   │   ├── auth/
│   │   │   ├── auth-state.ts      # NEW: Auth logic
│   │   │   └── profile-manager.ts # NEW: Profile handling
│   │   ├── calculator/
│   │   │   ├── loan-calculator.ts # Extract from app.js
│   │   │   └── slider-manager.ts  # NEW: Fix slider centering
│   │   ├── offers/
│   │   │   ├── offer-builder.ts   # Extract from app.js
│   │   │   └── sms-sender.ts      # NEW: Twilio integration
│   │   └── garage/
│   │       └── garage-manager.ts  # Extract from app.js
│   ├── lib/
│   │   ├── supabase.ts       # Existing, add types
│   │   └── utils.ts          # Utility functions
│   └── types/
│       └── index.ts          # NEW: Shared TypeScript types
├── app.js                    # Existing (gradually shrinks)
├── index.html                # Existing (stays the same)
├── styles.css                # Existing (keep as-is)
└── server/
    └── edge-functions/       # NEW: Supabase Edge Functions
        └── send-sms/
```

**Benefits:**
- Clear separation of concerns
- Easy to find code
- Gradual migration path

---

## Phase 2: Lightweight State Management (Week 1-2)

Instead of full React, use **Zustand** (works with vanilla JS!)

### 2.1 Install Zustand
```bash
npm install zustand
```

### 2.2 Create State Stores

**`src/core/state.ts`** - Central State:
```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Types
interface User {
  id: string;
  email: string;
  full_name?: string;
  phone?: string;
}

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  preferred_credit_score?: string;
  preferred_down_payment?: number;
  preferred_trade_value?: number;
}

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  isAuthenticated: boolean;

  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  signOut: () => void;
}

// Auth Store
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      profile: null,
      isAuthenticated: false,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setProfile: (profile) => set({ profile }),
      signOut: () => set({ user: null, profile: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// Calculator Store
interface CalculatorState {
  wizardData: any;  // Your existing wizardData structure
  originalValues: Record<string, number>;

  updateWizardData: (updates: any) => void;
  setOriginalValue: (key: string, value: number) => void;
  reset: () => void;
}

export const useCalculatorStore = create<CalculatorState>((set) => ({
  wizardData: {},
  originalValues: {},

  updateWizardData: (updates) =>
    set((state) => ({
      wizardData: { ...state.wizardData, ...updates }
    })),

  setOriginalValue: (key, value) =>
    set((state) => ({
      originalValues: { ...state.originalValues, [key]: value }
    })),

  reset: () => set({ wizardData: {}, originalValues: {} }),
}));
```

### 2.3 Use Stores in Existing Code

**Update `app.js` to use stores:**
```javascript
// At top of app.js
import { useAuthStore, useCalculatorStore } from './src/core/state';

// Replace global wizardData with store
const calcStore = useCalculatorStore.getState();

// Instead of: wizardData.financing.salePrice = value
calcStore.updateWizardData({
  financing: { ...calcStore.wizardData.financing, salePrice: value }
});

// Subscribe to changes
useCalculatorStore.subscribe((state) => {
  console.log('Calculator state changed:', state.wizardData);
  refreshReview(); // Auto-refresh when state changes
});

// Auth usage
const authStore = useAuthStore.getState();
authStore.setUser(userData);
authStore.setProfile(profileData);
```

**Benefits:**
- Centralized state (no more scattered globals)
- Automatic localStorage persistence
- Easy to debug (Zustand DevTools)
- React-ready when needed
- Works perfectly with vanilla JS

---

## Phase 3: Twilio SMS Integration (Week 2)

### 3.1 Create Supabase Edge Function

**`supabase/functions/send-sms/index.ts`:**
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!;
const TWILIO_PHONE = Deno.env.get('TWILIO_PHONE_NUMBER')!;

interface SendSMSRequest {
  to: string;
  dealerName: string;
  customerName: string;
  vehicle: string;
  monthlyPayment: number;
  term: number;
  apr: number;
  downPayment: number;
  message?: string;
  offerUrl?: string;
}

serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const data: SendSMSRequest = await req.json();

    // Build SMS message
    const message = `
Hi ${data.dealerName},

${data.customerName} is interested in the ${data.vehicle}.

💰 Offer Summary:
• Monthly: $${data.monthlyPayment.toFixed(2)}
• Down: $${data.downPayment.toFixed(2)}
• Term: ${data.term} months @ ${data.apr}% APR

${data.message ? `Notes: ${data.message}\n` : ''}
${data.offerUrl ? `\nView details: ${data.offerUrl}` : ''}

Reply or call to discuss!
    `.trim();

    // Send via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const formData = new URLSearchParams({
      To: data.to,
      From: TWILIO_PHONE,
      Body: message,
    });

    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    });

    const twilioData = await twilioResponse.json();

    if (!twilioResponse.ok) {
      throw new Error(twilioData.message || 'Failed to send SMS');
    }

    // Log to database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    await supabase.from('sms_logs').insert({
      message_sid: twilioData.sid,
      to: data.to,
      dealer_name: data.dealerName,
      customer_name: data.customerName,
      status: twilioData.status,
      sent_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        messageSid: twilioData.sid,
        status: twilioData.status
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    );
  }
});
```

### 3.2 Create SMS Sender Module

**`src/features/offers/sms-sender.ts`:**
```typescript
import { supabase } from '../../lib/supabase';

interface SMSOfferData {
  dealerPhone: string;
  dealerName: string;
  customerName: string;
  vehicle: string;
  monthlyPayment: number;
  downPayment: number;
  term: number;
  apr: number;
  message?: string;
}

export class SMSSender {
  static async sendOffer(data: SMSOfferData): Promise<{ success: boolean; error?: string }> {
    try {
      // Call Supabase Edge Function
      const { data: result, error } = await supabase.functions.invoke('send-sms', {
        body: data,
      });

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      console.error('SMS send error:', error);
      return {
        success: false,
        error: error.message || 'Failed to send SMS'
      };
    }
  }
}
```

### 3.3 Update Submit Offer Modal (in app.js)

```javascript
// Add to existing handleSmsOffer function
import { SMSSender } from './src/features/offers/sms-sender';

async function handleSmsOffer() {
  const dealerPhone = document.getElementById('dealerPhone').value;
  const dealerName = document.getElementById('dealerName').value;

  // Show loading state
  const btn = document.getElementById('btnSmsOffer');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Sending...';

  try {
    const result = await SMSSender.sendOffer({
      dealerPhone,
      dealerName,
      customerName: wizardData.customer.name,
      vehicle: `${wizardData.vehicle.year} ${wizardData.vehicle.make} ${wizardData.vehicle.model}`,
      monthlyPayment: parseFloat(document.getElementById('quickPaymentAmount').textContent.replace(/[$,]/g, '')),
      downPayment: wizardData.financing.cashDown || 0,
      term: wizardData.financing.term || 72,
      apr: wizardData.financing.apr || 0,
      message: document.getElementById('smsMessage')?.value,
    });

    if (result.success) {
      showToast('SMS sent successfully! 📱', 'success');
      closeSubmitOfferModal();
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    showToast(`Failed to send SMS: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg>...</svg> SMS';
  }
}
```

### 3.4 Create Database Migration

**`supabase/migrations/20251105_create_sms_logs.sql`:**
```sql
-- SMS Logs Table
CREATE TABLE IF NOT EXISTS sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_sid TEXT NOT NULL,
  to TEXT NOT NULL,
  dealer_name TEXT,
  customer_name TEXT,
  status TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX idx_sms_logs_message_sid ON sms_logs(message_sid);
CREATE INDEX idx_sms_logs_sent_at ON sms_logs(sent_at DESC);

-- RLS Policies (if needed)
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view their SMS logs"
  ON sms_logs FOR SELECT
  TO authenticated
  USING (true);
```

---

## Phase 4: Fix Slider Centering (Week 2)

### 4.1 Create Slider Manager

**`src/features/calculator/slider-manager.ts`:**
```typescript
export class SliderManager {
  private sliders: Map<string, HTMLInputElement> = new Map();
  private originalValues: Map<string, number> = new Map();

  initialize(sliders: { id: string; originalValue: number }[]) {
    sliders.forEach(({ id, originalValue }) => {
      const slider = document.getElementById(id) as HTMLInputElement;
      if (!slider) return;

      this.sliders.set(id, slider);
      this.originalValues.set(id, originalValue);

      // Dynamically set min/max to center the original value
      this.centerSlider(id, originalValue);

      // Update visual progress
      this.updateProgress(slider, originalValue);

      // Listen for changes
      slider.addEventListener('input', () => this.handleSliderChange(id));
    });
  }

  private centerSlider(id: string, originalValue: number) {
    const slider = this.sliders.get(id);
    if (!slider) return;

    // Create symmetric range around original value
    // Example: if original = $30k, set min=$0, max=$60k (30k in each direction)
    const rangeSize = originalValue * 2 || 100000; // Fallback if 0

    slider.min = '0';
    slider.max = String(rangeSize);
    slider.value = String(originalValue);

    // Store center point as data attribute
    slider.dataset.centerValue = String(originalValue);
  }

  private updateProgress(slider: HTMLInputElement, currentValue: number) {
    const originalValue = this.originalValues.get(slider.id) || 0;
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);

    // Calculate progress percentage where original value = 50%
    let progress: number;

    if (currentValue <= originalValue) {
      // Left side: 0% to 50%
      progress = originalValue === min ? 50 : ((currentValue - min) / (originalValue - min)) * 50;
    } else {
      // Right side: 50% to 100%
      progress = max === originalValue ? 50 : 50 + ((currentValue - originalValue) / (max - originalValue)) * 50;
    }

    // Set CSS custom properties
    slider.style.setProperty('--slider-progress', `${progress}%`);
    slider.style.setProperty('--slider-center', '50%');

    // Set fill direction
    if (progress < 50) {
      slider.style.setProperty('--fill-start', `${progress}%`);
      slider.style.setProperty('--fill-end', '50%');
    } else {
      slider.style.setProperty('--fill-start', '50%');
      slider.style.setProperty('--fill-end', `${progress}%`);
    }
  }

  private handleSliderChange(id: string) {
    const slider = this.sliders.get(id);
    if (!slider) return;

    const value = parseFloat(slider.value);
    this.updateProgress(slider, value);

    // Dispatch custom event for app.js to handle
    window.dispatchEvent(new CustomEvent('slider-changed', {
      detail: { id, value }
    }));
  }

  updateOriginalValue(id: string, newValue: number) {
    this.originalValues.set(id, newValue);
    this.centerSlider(id, newValue);
  }
}

// Singleton instance
export const sliderManager = new SliderManager();
```

### 4.2 Update CSS for Centered Sliders

**Add to `styles.css`:**
```css
/* Centered slider styling */
.quick-slider {
  position: relative;
  --slider-center: 50%;
  --slider-progress: 50%;
  --fill-start: 50%;
  --fill-end: 50%;
}

/* Center marker */
.quick-slider::before {
  content: '';
  position: absolute;
  left: var(--slider-center);
  top: 50%;
  transform: translate(-50%, -50%);
  width: 3px;
  height: 16px;
  background: var(--primary-start);
  border-radius: 2px;
  pointer-events: none;
  z-index: 1;
  opacity: 0.6;
}

/* Fill from center */
.quick-slider::-webkit-slider-runnable-track {
  background: linear-gradient(
    to right,
    #e2e8f0 0%,
    #e2e8f0 var(--fill-start),
    var(--primary-start) var(--fill-start),
    var(--primary-start) var(--fill-end),
    #e2e8f0 var(--fill-end),
    #e2e8f0 100%
  );
}

.quick-slider::-moz-range-track {
  background: linear-gradient(
    to right,
    #e2e8f0 0%,
    #e2e8f0 var(--fill-start),
    var(--primary-start) var(--fill-start),
    var(--primary-start) var(--fill-end),
    #e2e8f0 var(--fill-end),
    #e2e8f0 100%
  );
}
```

### 4.3 Initialize in app.js

```javascript
import { sliderManager } from './src/features/calculator/slider-manager';

// After vehicle is selected and initial values are set:
function initializeSliders() {
  sliderManager.initialize([
    { id: 'quickSliderSalePrice', originalValue: wizardData.financing.salePrice },
    { id: 'quickSliderCashDown', originalValue: wizardData.financing.cashDown },
    { id: 'quickSliderTradeAllowance', originalValue: wizardData.tradein.tradeValue },
    { id: 'quickSliderTradePayoff', originalValue: wizardData.tradein.tradePayoff },
  ]);
}

// Listen for slider changes
window.addEventListener('slider-changed', (e) => {
  const { id, value } = e.detail;

  // Update your wizard data
  if (id === 'quickSliderSalePrice') {
    wizardData.financing.salePrice = value;
  }
  // ... handle other sliders

  // Refresh calculations
  refreshReview();
});
```

---

## Phase 5: Better Auth & Auto-Population (Week 3)

### 5.1 Create Auth Manager

**`src/features/auth/auth-manager.ts`:**
```typescript
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../core/state';

export class AuthManager {
  static async initialize() {
    // Check for existing session
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      await this.handleUserSession(session.user);
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        await this.handleUserSession(session.user);
      } else if (event === 'SIGNED_OUT') {
        this.handleSignOut();
      }
    });
  }

  private static async handleUserSession(user: any) {
    const authStore = useAuthStore.getState();
    authStore.setUser(user);

    // Fetch profile
    const { data: profile } = await supabase
      .from('customer_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (profile) {
      authStore.setProfile(profile);
      this.autoPopulateFields(profile);
    }

    // Update UI
    this.updateAuthUI(true, user, profile);
  }

  private static handleSignOut() {
    const authStore = useAuthStore.getState();
    authStore.signOut();
    this.updateAuthUI(false);
  }

  private static autoPopulateFields(profile: any) {
    // Auto-fill form fields from profile
    const fieldMappings = {
      'quick-customer-name': profile.full_name,
      'quick-customer-email': profile.email,
      'quick-customer-phone': profile.phone,
      'quick-credit-score': profile.preferred_credit_score,
      'quick-down-payment': profile.preferred_down_payment,
    };

    Object.entries(fieldMappings).forEach(([fieldId, value]) => {
      const field = document.getElementById(fieldId) as HTMLInputElement;
      if (field && value && !field.value) {
        field.value = value;

        // Add visual feedback
        field.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
        setTimeout(() => {
          field.style.backgroundColor = '';
        }, 1000);
      }
    });

    // Dispatch event for app.js to handle
    window.dispatchEvent(new CustomEvent('profile-loaded', {
      detail: { profile }
    }));
  }

  private static updateAuthUI(isAuthenticated: boolean, user?: any, profile?: any) {
    const profileBtn = document.getElementById('openCustomerProfileBtn');
    const profileLabel = document.getElementById('customerProfileLabel');

    if (isAuthenticated && profile) {
      if (profileLabel) {
        profileLabel.textContent = profile.full_name || 'Profile';
      }
    } else {
      if (profileLabel) {
        profileLabel.textContent = 'Sign In';
      }
    }
  }
}
```

### 5.2 Initialize in app.js

```javascript
import { AuthManager } from './src/features/auth/auth-manager';

// Initialize on app load
document.addEventListener('DOMContentLoaded', async () => {
  await AuthManager.initialize();

  // Rest of your init code...
});

// Listen for profile loaded
window.addEventListener('profile-loaded', (e) => {
  const { profile } = e.detail;
  console.log('Profile loaded:', profile);

  // Update wizardData with profile defaults
  wizardData.customer = {
    name: profile.full_name,
    email: profile.email,
    phone: profile.phone,
  };
});
```

---

## Phase 6: Build Setup (Week 3)

### 6.1 Update package.json

```json
{
  "name": "excelcalc",
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "type-check": "tsc --noEmit",
    "server": "node server/server.js"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.5.0",
    "vite": "^5.0.0"
  }
}
```

### 6.2 Create vite.config.js

```javascript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

---

## Migration Checklist

### Week 1
- [x] Set up TypeScript (allowJs: true)
- [x] Install Zustand
- [x] Create auth store
- [x] Create calculator store
- [x] Reorganize file structure

### Week 2
- [ ] Create Twilio Edge Function
- [ ] Add SMS sender module
- [ ] Update submit offer modal
- [ ] Create SliderManager class
- [ ] Fix slider centering
- [ ] Add center marker to sliders

### Week 3
- [ ] Create AuthManager
- [ ] Add auto-population logic
- [ ] Set up Vite build
- [ ] Add type checking script
- [ ] Test all features

### Week 4
- [ ] Gradually convert .js files to .ts
- [ ] Add JSDoc types to remaining .js
- [ ] Add error boundaries
- [ ] Improve loading states
- [ ] Performance testing

---

## Key Benefits of Hybrid Approach

✅ **No Breaking Changes**: Existing code keeps working
✅ **Gradual Migration**: Convert files one at a time
✅ **Modern State Management**: Zustand without React
✅ **Type Safety**: TypeScript where it matters
✅ **SMS Integration**: Production-ready Twilio
✅ **Better Organization**: Clear folder structure
✅ **Future-Proof**: Easy to add React later if needed
✅ **Low Risk**: Can rollback any change

---

## Next Steps

1. **Start with Week 1 tasks** - Foundation setup
2. **Test after each phase** - Don't move forward until stable
3. **Keep existing app running** - No big bang deployment
4. **Add features incrementally** - One module at a time

Would you like me to start implementing Phase 1?
