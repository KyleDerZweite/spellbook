import * as React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function Button({ 
  className = '', 
  variant = 'default',
  size = 'default',
  ...props 
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-all focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variantStyles = {
    default: 'bg-accent hover:bg-accent-hover text-white shadow-glow hover:shadow-glow-lg',
    secondary: 'bg-card hover:bg-card-hover text-foreground border border-border hover:border-accent/30',
    outline: 'border border-border bg-transparent hover:bg-card-hover hover:border-accent/30 text-foreground',
    ghost: 'bg-transparent hover:bg-card-hover text-foreground',
    destructive: 'bg-error hover:bg-error/90 text-white',
  };
  
  const sizeStyles = {
    default: 'h-10 px-4 py-2 rounded-xl',
    sm: 'h-8 px-3 text-sm rounded-lg',
    lg: 'h-12 px-6 text-lg rounded-xl',
    icon: 'h-10 w-10 rounded-xl',
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    />
  );
}
