'use client';

import { useForm } from 'react-hook-form';
import { useAuth } from '../../../lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2, Eye, EyeOff, Sparkles } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'; // Ensure Card components are imported
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils'; // Ensure cn is imported

interface LoginForm {
  username: string;
  password: string;
}

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    defaultValues: { username: '', password: '' }
  });

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  const onSubmit = (values: LoginForm) => {
    login.mutate(values, {
      onSuccess: () => router.push('/'),
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
    <div className="min-h-screen flex items-center justify-center bg-mystic noise-overlay p-4">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-mana-gold/5 rounded-full blur-3xl" />
      </div>
      
      <div className="w-full max-w-md relative">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/15 border border-primary/30 mb-4 shadow-glow"> {/* Changed accent to primary */}
            <Sparkles className="w-7 h-7 text-primary" />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight text-foreground"> {/* Replaced h1 with CardTitle */}
            Welcome Back
          </CardTitle>
          <CardDescription className="text-base"> {/* Replaced p with CardDescription */}
            Sign in to your Spellbook account
          </CardDescription>
        </div>

        {/* Form Card */}
        <Card className="rounded-2xl p-6 card-hover-glow"> {/* Replaced div with Card */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Username/Email Field */}
            <div className="space-y-2">
              <Label htmlFor="username"> {/* Replaced label with Label component */}
                Email or Username
              </Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                {...register('username', {
                  required: 'Email or username is required',
                  minLength: { value: 3, message: 'Must be at least 3 characters' }
                })}
                className={cn("w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all")} // Using cn
                placeholder="you@example.com"
              />
              {errors.username && (
                <p className="text-sm text-error">{errors.username.message}</p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password"> {/* Replaced label with Label component */}
                  Password
                </Label>
                <Link href="#" className="text-xs text-primary hover:text-primary/80 transition-colors"> {/* Changed accent to primary */}
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 6, message: 'Password must be at least 6 characters' }
                  })}
                  className={cn("w-full px-4 py-2.5 pr-11 bg-background border border-border rounded-xl text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all")} // Using cn
                  placeholder="••••••••"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-foreground-muted hover:text-foreground transition-colors" // Changed text-muted-foreground to text-foreground-muted
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </Button>
              </div>
              {errors.password && (
                <p className="text-sm text-error">{errors.password.message}</p>
              )}
            </div>

            {/* Error Message */}
            {login.isError && (
              <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
                {(login.error as Error)?.message || 'Invalid credentials. Please try again.'}
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isSubmitting || login.isPending}
              className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-medium shadow-[0_0_20px_rgb(var(--primary)/0.3)] hover:shadow-[0_0_25px_rgb(var(--primary)/0.5)] transition-all duration-300" // Changed bg-accent to bg-primary and related shadows
            >
              {login.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 spinner" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-border"></div>
            <span className="text-sm text-foreground-muted">or</span>
            <div className="flex-1 h-px bg-border"></div>
          </div>

          {/* Register Link */}
          <p className="text-center text-foreground-muted">
            Don't have an account?{' '}
            <Link href="/register" className="text-primary hover:text-primary/80 font-medium transition-colors"> {/* Changed accent to primary */}
              Create account
            </Link>
          </p>
        </Card>

        {/* Footer */}
        <p className="text-center text-sm text-foreground-muted mt-6">
          By signing in, you agree to our Terms of Service
        </p>
      </div>
    </div>
  );
}

