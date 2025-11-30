import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function rarityColor(rarity?: string) {
  switch (rarity) {
    case 'mythic': return 'text-[var(--card-mythic)]';
    case 'rare': return 'text-[var(--card-rare)]';
    case 'uncommon': return 'text-[var(--card-uncommon)]';
    default: return 'text-[var(--card-common)]';
  }
}

export function formatPrice(price?: string | null): string {
  if (!price || price === '0' || price === '0.00') return '—';
  const num = parseFloat(price);
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(num);
}

export function formatDate(dateString: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(new Date(dateString));
  } catch {
    return dateString;
  }
}

export function getCardImageUrl(card: { image_uris?: any }, size: 'small' | 'normal' | 'large' = 'normal'): string {
  const fallback = '/card-back.svg';
  if (!card.image_uris) return fallback;
  
  return card.image_uris[size] || card.image_uris.normal || card.image_uris.small || fallback;
}

export function debounce<T extends (...args: any[]) => void>(func: T, wait: number): T {
  let timeout: NodeJS.Timeout;
  return ((...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  }) as T;
}