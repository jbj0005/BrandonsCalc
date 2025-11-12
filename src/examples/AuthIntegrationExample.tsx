/**
 * AuthIntegrationExample - Shows how to integrate AuthModal with real Supabase auth
 *
 * This example demonstrates connecting the AuthModal component to your existing
 * Supabase authentication manager.
 */

import React, { useState, useEffect } from 'react';
import { AuthModal } from '../ui/components/AuthModal';
import { Button } from '../ui/components/Button';
import { useToast } from '../ui/components/Toast';
// Import your auth manager
// import { authManager } from '../features/auth/auth-manager';

export const AuthIntegrationExample: React.FC = () => {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const toast = useToast();

  // Listen to auth state changes
  useEffect(() => {
    // Subscribe to auth state changes
    // const unsubscribe = authManager.onAuthStateChange((user) => {
    //   setCurrentUser(user);
    // });

    // Check initial auth state
    // const checkAuth = async () => {
    //   const user = await authManager.getCurrentUser();
    //   setCurrentUser(user);
    // };
    // checkAuth();

    // return () => unsubscribe();

    // Demo: Listen to global auth events
    const handleAuth = (event: any) => {
      setCurrentUser(event.detail.user);
    };

    window.addEventListener('auth:state-changed', handleAuth as EventListener);
    return () => window.removeEventListener('auth:state-changed', handleAuth as EventListener);
  }, []);

  // Handle sign in
  const handleSignIn = async (email: string, password: string) => {
    // Real implementation with Supabase
    // const { error, user } = await authManager.signIn(email, password);
    // if (error) throw new Error(error.message);
    // return user;

    // Demo implementation
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Simulate success
    const mockUser = { id: '123', email };
    setCurrentUser(mockUser);

    // Dispatch event for other parts of app
    window.dispatchEvent(
      new CustomEvent('auth:state-changed', {
        detail: { user: mockUser, session: {} },
      })
    );
  };

  // Handle sign up
  const handleSignUp = async (
    email: string,
    password: string,
    fullName?: string,
    phone?: string
  ) => {
    // Real implementation with Supabase
    // const { error, user } = await authManager.signUp({
    //   email,
    //   password,
    //   options: {
    //     data: {
    //       full_name: fullName,
    //       phone,
    //     },
    //   },
    // });
    // if (error) throw new Error(error.message);
    // return user;

    // Demo implementation
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Simulate success
    const mockUser = { id: '123', email, user_metadata: { full_name: fullName, phone } };
    setCurrentUser(mockUser);

    // Dispatch event
    window.dispatchEvent(
      new CustomEvent('auth:state-changed', {
        detail: { user: mockUser, session: {} },
      })
    );
  };

  // Handle forgot password
  const handleForgotPassword = async (email: string) => {
    // Real implementation with Supabase
    // const { error } = await authManager.resetPassword(email);
    // if (error) throw new Error(error.message);

    // Demo implementation
    await new Promise((resolve) => setTimeout(resolve, 1500));
  };

  // Handle sign out
  const handleSignOut = async () => {
    // Real implementation
    // await authManager.signOut();

    // Demo implementation
    setCurrentUser(null);
    window.dispatchEvent(
      new CustomEvent('auth:state-changed', {
        detail: { user: null, session: null },
      })
    );
    toast.push({ kind: 'success', title: 'Signed out successfully' });
  };

  return (
    <div className="p-8">
      <div className="max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Auth Integration Example
        </h2>

        {currentUser ? (
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <div className="mb-4">
              <p className="text-sm text-gray-500 mb-1">Signed in as:</p>
              <p className="text-lg font-semibold text-gray-900">{currentUser.email}</p>
            </div>
            <Button variant="outline" onClick={handleSignOut} fullWidth>
              Sign Out
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Button
              variant="primary"
              fullWidth
              onClick={() => {
                setAuthMode('signin');
                setAuthModalOpen(true);
              }}
            >
              Sign In
            </Button>
            <Button
              variant="outline"
              fullWidth
              onClick={() => {
                setAuthMode('signup');
                setAuthModalOpen(true);
              }}
            >
              Create Account
            </Button>
          </div>
        )}

        {/* Auth Modal */}
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          initialMode={authMode}
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
          onForgotPassword={handleForgotPassword}
        />
      </div>
    </div>
  );
};

export default AuthIntegrationExample;
