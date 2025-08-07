'use client';

import { useForm } from 'react-hook-form';
import { useAuth } from '../../../lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2, Eye, EyeOff, CheckCircle } from 'lucide-react';
import Link from 'next/link';

interface RegisterForm {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  invite_code?: string;
}

export default function RegisterPage() {
  const { register: registerMutation, isAuthenticated } = useAuth();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const { register, handleSubmit, formState: { errors }, watch, reset } = useForm<RegisterForm>({
    defaultValues: { 
      email: '', 
      username: '', 
      password: '', 
      confirmPassword: '',
      invite_code: ''
    }
  });

  const password = watch('password');

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  const onSubmit = (values: RegisterForm) => {
    const { confirmPassword, ...payload } = values;
    
    registerMutation.mutate(payload, {
      onSuccess: () => {
        setIsSuccess(true);
        reset();
        // Redirect to login after a delay
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      },
    });
  };

  if (isAuthenticated) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-2 text-text-secondary">
            <Loader2 className="animate-spin" size={16} />
            Redirecting...
          </div>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen grid place-items-center px-4">
        <div className="w-full max-w-sm glass rounded-xl p-6 text-center">
          <CheckCircle className="mx-auto mb-4 text-green-500" size={48} />
          <h2 className="text-xl font-semibold text-text-primary mb-2">Account Created!</h2>
          <p className="text-text-secondary mb-4">
            Your account has been created successfully. You will be redirected to the login page.
          </p>
          <div className="flex items-center justify-center gap-2 text-text-muted">
            <Loader2 className="animate-spin" size={16} />
            Redirecting...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 py-8">
      <div className="w-full max-w-md">
        <form onSubmit={handleSubmit(onSubmit)} className="glass rounded-xl p-6 space-y-4">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-semibold text-text-primary">Create account</h1>
            <p className="text-text-secondary mt-2">Join Spellbook to manage your collection</p>
          </div>
          
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-text-secondary">
              Email
            </label>
            <input
              id="email"
              type="email"
              {...register('email', { 
                required: 'Email is required',
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: 'Invalid email address'
                }
              })}
              className="w-full bg-surface-variant border border-border rounded-md px-3 py-2 outline-none focus:border-border-accent transition-colors"
              placeholder="Enter your email"
            />
            {errors.email && (
              <p className="text-red-400 text-xs">{errors.email.message}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <label htmlFor="username" className="block text-sm font-medium text-text-secondary">
              Username
            </label>
            <input
              id="username"
              type="text"
              {...register('username', { 
                required: 'Username is required',
                minLength: {
                  value: 3,
                  message: 'Username must be at least 3 characters'
                },
                maxLength: {
                  value: 50,
                  message: 'Username must be less than 50 characters'
                },
                pattern: {
                  value: /^[a-zA-Z0-9_-]+$/,
                  message: 'Username can only contain letters, numbers, hyphens, and underscores'
                }
              })}
              className="w-full bg-surface-variant border border-border rounded-md px-3 py-2 outline-none focus:border-border-accent transition-colors"
              placeholder="Choose a username"
            />
            {errors.username && (
              <p className="text-red-400 text-xs">{errors.username.message}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium text-text-secondary">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                {...register('password', { 
                  required: 'Password is required',
                  minLength: {
                    value: 8,
                    message: 'Password must be at least 8 characters'
                  }
                })}
                className="w-full bg-surface-variant border border-border rounded-md px-3 py-2 pr-10 outline-none focus:border-border-accent transition-colors"
                placeholder="Create a password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-text-muted hover:text-text-secondary"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && (
              <p className="text-red-400 text-xs">{errors.password.message}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-secondary">
              Confirm Password
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                {...register('confirmPassword', { 
                  required: 'Please confirm your password',
                  validate: (value) => value === password || 'Passwords do not match'
                })}
                className="w-full bg-surface-variant border border-border rounded-md px-3 py-2 pr-10 outline-none focus:border-border-accent transition-colors"
                placeholder="Confirm your password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-2.5 text-text-muted hover:text-text-secondary"
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-red-400 text-xs">{errors.confirmPassword.message}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <label htmlFor="invite_code" className="block text-sm font-medium text-text-secondary">
              Invite Code <span className="text-text-muted">(if required)</span>
            </label>
            <input
              id="invite_code"
              type="text"
              {...register('invite_code')}
              className="w-full bg-surface-variant border border-border rounded-md px-3 py-2 outline-none focus:border-border-accent transition-colors"
              placeholder="Enter invite code (optional)"
            />
          </div>
          
          <button 
            type="submit"
            disabled={registerMutation.isPending} 
            className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-md py-2.5 flex items-center justify-center font-medium"
          >
            {registerMutation.isPending ? (
              <>
                <Loader2 className="animate-spin mr-2" size={16} />
                Creating account...
              </>
            ) : (
              'Create Account'
            )}
          </button>
          
          {registerMutation.isError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-md p-3">
              <p className="text-red-400 text-sm text-center">
                Registration failed. Please check your information and try again.
              </p>
            </div>
          )}
          
          <div className="text-center pt-4 border-t border-border">
            <p className="text-text-secondary text-sm">
              Already have an account?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}