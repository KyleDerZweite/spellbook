'use client';

import { useForm } from 'react-hook-form';
import { useAuth } from '../../../lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2, Eye, EyeOff, Sparkles, Check, X } from 'lucide-react';
import Link from 'next/link';

interface RegisterForm {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  invite_code?: string;
}

export default function RegisterPage() {
  const { register: registerUser, isAuthenticated } = useAuth();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<RegisterForm>({
    defaultValues: { email: '', username: '', password: '', confirmPassword: '', invite_code: '' }
  });

  const password = watch('password');
  
  const passwordChecks = {
    length: password?.length >= 8,
    lowercase: /[a-z]/.test(password || ''),
    uppercase: /[A-Z]/.test(password || ''),
    number: /[0-9]/.test(password || ''),
  };

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  const onSubmit = (values: RegisterForm) => {
    const { confirmPassword, ...data } = values;
    registerUser.mutate(data, {
      onSuccess: () => router.push('/login?registered=true'),
    });
  };

  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-foreground-muted">
          <Loader2 className="w-5 h-5 spinner" />
          <span>Redirecting...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-mystic noise-overlay p-4 py-12">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-mana-gold/5 rounded-full blur-3xl" />
      </div>
      
      <div className="w-full max-w-md relative">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/15 border border-accent/30 mb-4 shadow-glow">
            <Sparkles className="w-7 h-7 text-accent" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Create your account</h1>
          <p className="text-foreground-muted mt-2">Start managing your card collection today</p>
        </div>

        {/* Form Card */}
        <div className="bg-card border border-border rounded-2xl p-6 card-hover-glow">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Email Field */}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-foreground">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                {...register('email', { 
                  required: 'Email is required',
                  pattern: { value: /^\S+@\S+$/i, message: 'Invalid email address' }
                })}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
                placeholder="you@example.com"
              />
              {errors.email && (
                <p className="text-sm text-error">{errors.email.message}</p>
              )}
            </div>

            {/* Username Field */}
            <div className="space-y-2">
              <label htmlFor="username" className="block text-sm font-medium text-foreground">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                {...register('username', { 
                  required: 'Username is required',
                  minLength: { value: 3, message: 'Must be at least 3 characters' },
                  maxLength: { value: 20, message: 'Must be less than 20 characters' },
                  pattern: { value: /^[a-zA-Z0-9_]+$/, message: 'Only letters, numbers, and underscores' }
                })}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
                placeholder="Choose a username"
              />
              {errors.username && (
                <p className="text-sm text-error">{errors.username.message}</p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-foreground">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  {...register('password', { 
                    required: 'Password is required',
                    minLength: { value: 8, message: 'Password must be at least 8 characters' }
                  })}
                  className="w-full px-4 py-2.5 pr-11 bg-background border border-border rounded-xl text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              
              {/* Password Requirements */}
              {password && (
                <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                  <div className={`flex items-center gap-1.5 ${passwordChecks.length ? 'text-success' : 'text-foreground-muted'}`}>
                    {passwordChecks.length ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    8+ characters
                  </div>
                  <div className={`flex items-center gap-1.5 ${passwordChecks.lowercase ? 'text-success' : 'text-foreground-muted'}`}>
                    {passwordChecks.lowercase ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    Lowercase letter
                  </div>
                  <div className={`flex items-center gap-1.5 ${passwordChecks.uppercase ? 'text-success' : 'text-foreground-muted'}`}>
                    {passwordChecks.uppercase ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    Uppercase letter
                  </div>
                  <div className={`flex items-center gap-1.5 ${passwordChecks.number ? 'text-success' : 'text-foreground-muted'}`}>
                    {passwordChecks.number ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    Number
                  </div>
                </div>
              )}
              
              {errors.password && (
                <p className="text-sm text-error">{errors.password.message}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                {...register('confirmPassword', { 
                  required: 'Please confirm your password',
                  validate: value => value === password || 'Passwords do not match'
                })}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
                placeholder="••••••••"
              />
              {errors.confirmPassword && (
                <p className="text-sm text-error">{errors.confirmPassword.message}</p>
              )}
            </div>

            {/* Error Message */}
            {registerUser.isError && (
              <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
                {(registerUser.error as Error)?.message || 'Registration failed. Please try again.'}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || registerUser.isPending}
              className="w-full py-3 px-4 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all shadow-glow hover:shadow-glow-lg flex items-center justify-center gap-2"
            >
              {registerUser.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 spinner" />
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-border"></div>
            <span className="text-sm text-foreground-muted">or</span>
            <div className="flex-1 h-px bg-border"></div>
          </div>

          {/* Login Link */}
          <p className="text-center text-foreground-muted">
            Already have an account?{' '}
            <Link href="/login" className="text-accent hover:text-accent-hover font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-foreground-muted mt-6">
          By creating an account, you agree to our Terms of Service
        </p>
      </div>
    </div>
  );
}
