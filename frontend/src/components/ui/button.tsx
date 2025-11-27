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
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variantStyles = {
    default: 'bg-accent hover:bg-accent-hover text-white',
    secondary: 'bg-background-tertiary hover:bg-card-hover text-foreground border border-border',
    outline: 'border border-border bg-transparent hover:bg-card-hover text-foreground',
    ghost: 'bg-transparent hover:bg-card-hover text-foreground',
    destructive: 'bg-error hover:bg-error/90 text-white',
  };
  
  const sizeStyles = {
    default: 'h-10 px-4 py-2 rounded-lg',
    sm: 'h-8 px-3 text-sm rounded-md',
    lg: 'h-12 px-6 text-lg rounded-lg',
    icon: 'h-10 w-10 rounded-lg',
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    />
  );
}
