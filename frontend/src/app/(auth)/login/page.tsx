'use client';

import { useForm } from 'react-hook-form';
import { useAuth } from '../../../lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

interface LoginForm {
  username: string;
  password: string;
}

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    defaultValues: { username: '', password: '' }
  });

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  const onSubmit = (values: LoginForm) => {
    login.mutate(values, {
      onSuccess: () => {
        router.push('/');
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

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <form onSubmit={handleSubmit(onSubmit)} className="glass rounded-xl p-6 space-y-4">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-semibold text-text-primary">Welcome back</h1>
            <p className="text-text-secondary mt-2">Sign in to your account</p>
          </div>
          
          <div className="space-y-2">
            <label htmlFor="username" className="block text-sm font-medium text-text-secondary">
              Email or Username
            </label>
            <input
              id="username"
              type="text"
              {...register('username', { 
                required: 'Email or username is required',
                minLength: {
                  value: 3,
                  message: 'Must be at least 3 characters'
                }
              })}
              className="w-full bg-surface-variant border border-border rounded-md px-3 py-2 outline-none focus:border-border-accent transition-colors"
              placeholder="Enter your email or username"
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
                    value: 6,
                    message: 'Password must be at least 6 characters'
                  }
                })}
                className="w-full bg-surface-variant border border-border rounded-md px-3 py-2 pr-10 outline-none focus:border-border-accent transition-colors"
                placeholder="Enter your password"
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
          
          <button 
            type="submit"
            disabled={login.isPending} 
            className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-md py-2.5 flex items-center justify-center font-medium"
          >
            {login.isPending ? (
              <>
                <Loader2 className="animate-spin mr-2" size={16} />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
          
          {login.isError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-md p-3">
              <p className="text-red-400 text-sm text-center">
                Login failed. Please check your credentials and try again.
              </p>
            </div>
          )}
          
          <div className="text-center pt-4 border-t border-border">
            <p className="text-text-secondary text-sm">
              Don't have an account?{' '}
              <Link href="/register" className="text-primary hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}