import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(price: string | number | undefined): string {
  if (!price) return 'N/A'
  const numPrice = typeof price === 'string' ? parseFloat(price) : price
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(numPrice)
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function parseManaCost(manaCost: string): Array<{ symbol: string; type: string }> {
  if (!manaCost) return []
  
  // Simple mana cost parser - can be enhanced
  const symbols = manaCost.match(/\{[^}]+\}/g) || []
  
  return symbols.map(symbol => {
    const clean = symbol.replace(/[{}]/g, '')
    
    if (/^\d+$/.test(clean)) {
      return { symbol: clean, type: 'generic' }
    }
    
    const colorMap: Record<string, string> = {
      'W': 'white',
      'U': 'blue', 
      'B': 'black',
      'R': 'red',
      'G': 'green',
    }
    
    if (colorMap[clean]) {
      return { symbol: clean, type: colorMap[clean] }
    }
    
    return { symbol: clean, type: 'special' }
  })
}

export function getRarityColor(rarity: string): string {
  const rarityColors: Record<string, string> = {
    'common': 'text-gray-400',
    'uncommon': 'text-gray-300',
    'rare': 'text-yellow-400',
    'mythic': 'text-orange-400',
  }
  
  return rarityColors[rarity.toLowerCase()] || 'text-gray-400'
}

export function getColorIdentityColors(colors: string): string[] {
  if (!colors) return []
  
  const colorMap: Record<string, string> = {
    'W': '#FFFBD5',
    'U': '#0E68AB', 
    'B': '#150B00',
    'R': '#D3202A',
    'G': '#00733E',
  }
  
  return colors.split('').map(color => colorMap[color]).filter(Boolean)
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), delay)
  }
}

export function truncate(text: string, length: number): string {
  if (text.length <= length) return text
  return text.slice(0, length) + '...'
}