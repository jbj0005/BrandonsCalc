import React, { useState } from 'react';
import { Modal } from './Modal';
import { Input } from './Input';
import { Button } from './Button';
import { useToast } from './Toast';
import { formatPhoneNumber } from '../../utils/formatters';

export interface AuthModalProps {
  /** Is modal open */
  isOpen: boolean;
  /** Close modal handler */
  onClose: () => void;
  /** Initial mode */
  initialMode?: 'signin' | 'signup';
  /** Sign in handler */
  onSignIn?: (email: string, password: string) => Promise<void>;
  /** Sign up handler */
  onSignUp?: (email: string, password: string, fullName?: string, phone?: string) => Promise<void>;
  /** Forgot password handler */
  onForgotPassword?: (email: string) => Promise<void>;
}

/**
 * AuthModal - Modal for sign in / sign up with form validation
 */
export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'signin',
  onSignIn,
  onSignUp,
  onForgotPassword,
}) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  // Validation errors
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [fullNameError, setFullNameError] = useState('');

  // Reset form
  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setFullName('');
    setPhone('');
    setEmailError('');
    setPasswordError('');
    setConfirmPasswordError('');
    setFullNameError('');
    setLoading(false);
  };

  // Validate email
  const validateEmail = (email: string): boolean => {
    if (!email) {
      setEmailError('Email is required');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Please enter a valid email address');
      return false;
    }
    setEmailError('');
    return true;
  };

  // Validate password
  const validatePassword = (password: string, isSignup: boolean = false): boolean => {
    if (!password) {
      setPasswordError('Password is required');
      return false;
    }
    if (isSignup && password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return false;
    }
    setPasswordError('');
    return true;
  };

  // Validate confirm password
  const validateConfirmPassword = (): boolean => {
    if (!confirmPassword) {
      setConfirmPasswordError('Please confirm your password');
      return false;
    }
    if (confirmPassword !== password) {
      setConfirmPasswordError('Passwords do not match');
      return false;
    }
    setConfirmPasswordError('');
    return true;
  };

  // Validate full name
  const validateFullName = (): boolean => {
    if (!fullName.trim()) {
      setFullNameError('Name is required');
      return false;
    }
    setFullNameError('');
    return true;
  };

  // Handle sign in
  const handleSignIn = async () => {
    const emailValid = validateEmail(email);
    const passwordValid = validatePassword(password);

    if (!emailValid || !passwordValid) return;

    setLoading(true);
    try {
      await onSignIn?.(email, password);
      toast.push({ kind: 'success', title: 'Signed in successfully!' });
      resetForm();
      onClose();
    } catch (error: any) {
      toast.push({ kind: 'error', title: 'Sign in failed', detail: error.message });
    } finally {
      setLoading(false);
    }
  };

  // Handle sign up
  const handleSignUp = async () => {
    const emailValid = validateEmail(email);
    const passwordValid = validatePassword(password, true);
    const confirmPasswordValid = validateConfirmPassword();
    const fullNameValid = validateFullName();

    if (!emailValid || !passwordValid || !confirmPasswordValid || !fullNameValid) return;

    setLoading(true);
    try {
      await onSignUp?.(email, password, fullName, phone);
      // Toast is handled by auth-manager (includes email verification message)
      resetForm();
      onClose();
    } catch (error: any) {
      toast.push({ kind: 'error', title: 'Sign up failed', detail: error.message });
    } finally {
      setLoading(false);
    }
  };

  // Handle forgot password
  const handleForgotPassword = async () => {
    const emailValid = validateEmail(email);
    if (!emailValid) return;

    setLoading(true);
    try {
      await onForgotPassword?.(email);
      toast.push({ kind: 'success', title: 'Password reset email sent!', detail: 'Check your inbox' });
      setMode('signin');
    } catch (error: any) {
      toast.push({ kind: 'error', title: 'Failed to send reset email', detail: error.message });
    } finally {
      setLoading(false);
    }
  };

  // Handle modal close
  const handleClose = () => {
    resetForm();
    setMode(initialMode);
    onClose();
  };

  // Unified submit handler so Enter key works across modes
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    if (mode === 'signin') {
      handleSignIn();
    } else if (mode === 'signup') {
      handleSignUp();
    } else if (mode === 'forgot') {
      handleForgotPassword();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        mode === 'signin'
          ? 'Sign In'
          : mode === 'signup'
          ? 'Create Account'
          : 'Reset Password'
      }
      size="sm"
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        {/* Sign In Form */}
        {mode === 'signin' && (
          <>
            <Input
              label="Email Address"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError('');
              }}
              onBlur={() => validateEmail(email)}
              error={emailError}
              autoComplete="email"
              fullWidth
            />
            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError('');
              }}
              error={passwordError}
              autoComplete="current-password"
              fullWidth
            />

            <div className="flex items-center justify-between">
              <button
                onClick={() => setMode('forgot')}
                className="text-sm text-blue-400 hover:text-blue-300 font-medium"
              >
                Forgot password?
              </button>
            </div>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              type="submit"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>

            <div className="text-center text-sm text-white/60">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('signup')}
                className="text-blue-400 hover:text-blue-300 font-medium"
              >
                Sign up
              </button>
            </div>
          </>
        )}

        {/* Sign Up Form */}
        {mode === 'signup' && (
          <>
            <Input
              label="Full Name"
              type="text"
              placeholder="John Doe"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setFullNameError('');
              }}
              onBlur={validateFullName}
              error={fullNameError}
              autoComplete="name"
              fullWidth
            />
            <Input
              label="Email Address"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError('');
              }}
              onBlur={() => validateEmail(email)}
              error={emailError}
              autoComplete="email"
              fullWidth
            />
            <Input
              label="Phone Number (Optional)"
              type="tel"
              placeholder="(555) 123-4567"
              value={phone}
              onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
              autoComplete="tel"
              helperText="We'll send you updates via SMS"
              fullWidth
            />
            <Input
              label="Password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError('');
              }}
              onBlur={() => validatePassword(password, true)}
              error={passwordError}
              autoComplete="new-password"
              fullWidth
            />
            <Input
              label="Confirm Password"
              type="password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setConfirmPasswordError('');
              }}
              onBlur={validateConfirmPassword}
              error={confirmPasswordError}
              autoComplete="new-password"
              fullWidth
            />

            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              type="submit"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>

            <div className="text-center text-sm text-white/60">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="text-blue-400 hover:text-blue-300 font-medium"
              >
                Sign in
              </button>
            </div>
          </>
        )}

        {/* Forgot Password Form */}
        {mode === 'forgot' && (
          <>
            <p className="text-sm text-white/60">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            <Input
              label="Email Address"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError('');
              }}
              onBlur={() => validateEmail(email)}
              error={emailError}
              autoComplete="email"
              fullWidth
            />

            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              type="submit"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </Button>

            <div className="text-center text-sm text-white/60">
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="text-blue-400 hover:text-blue-300 font-medium"
              >
                Back to sign in
              </button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
};

export default AuthModal;
