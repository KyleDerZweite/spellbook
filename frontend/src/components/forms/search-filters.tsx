'use client';

import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { CardSearchParams } from '../../lib/types';

const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];
const RARITIES = ['common', 'uncommon', 'rare', 'mythic'];
const TYPES = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land'];

interface SearchFiltersProps {
  value: CardSearchParams;
  onChange: (value: CardSearchParams) => void;
}

export function SearchFilters({ value, onChange }: SearchFiltersProps) {
  const [open, setOpen] = useState(true);

  const toggleArray = (key: keyof CardSearchParams, item: string) => {
    const currentArray = (value[key] as string[]) || [];
    const arr = new Set(currentArray);
    
    if (arr.has(item)) {
      arr.delete(item);
    } else {
      arr.add(item);
    }
    
    onChange({ 
      ...value, 
      [key]: Array.from(arr),
      page: 1 // Reset to first page when filters change
    });
  };

  const clearAll = () => {
    onChange({ 
      q: value.q || '', 
      page: 1, 
      per_page: value.per_page || 24 
    });
  };

  const hasActiveFilters = () => {
    return (value.colors && value.colors.length > 0) ||
           (value.rarity && value.rarity.length > 0) ||
           (value.types && value.types.length > 0);
  };

  return (
    <div className="elevated p-4">
      <button 
        onClick={() => setOpen(!open)} 
        className="w-full flex items-center justify-between text-left hover:text-white transition-colors"
      >
        <span className="font-medium text-sm text-text-secondary">
          Advanced Filters {hasActiveFilters() && '(Active)'}
        </span>
        <ChevronDown className={cn('h-4 w-4 transition-transform text-text-secondary', open && 'rotate-180')} />
      </button>
      
      {open && (
        <div className="mt-4 space-y-4">
          {/* Colors */}
          <div>
            <div className="text-xs text-text-secondary mb-2 font-medium">Colors</div>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => toggleArray('colors', color)}
                  className={cn(
                    'px-3 py-1 rounded-full border text-sm transition-all hover:scale-105',
                    (value.colors || []).includes(color)
                      ? 'border-primary text-white bg-primary/20 shadow-glow'
                      : 'border-border text-text-secondary hover:border-border-accent hover:text-white'
                  )}
                >
                  {color}
                </button>
              ))}
            </div>
          </div>

          {/* Rarity */}
          <div>
            <div className="text-xs text-text-secondary mb-2 font-medium">Rarity</div>
            <div className="flex gap-2 flex-wrap">
              {RARITIES.map((rarity) => (
                <button
                  key={rarity}
                  onClick={() => toggleArray('rarity', rarity)}
                  className={cn(
                    'px-3 py-1 rounded-full border text-sm capitalize transition-all hover:scale-105',
                    (value.rarity || []).includes(rarity)
                      ? 'border-primary-variant text-white bg-primary-variant/20 shadow-glow'
                      : 'border-border text-text-secondary hover:border-border-accent hover:text-white'
                  )}
                >
                  {rarity}
                </button>
              ))}
            </div>
          </div>

          {/* Types */}
          <div>
            <div className="text-xs text-text-secondary mb-2 font-medium">Type</div>
            <div className="flex gap-2 flex-wrap">
              {TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => toggleArray('types', type)}
                  className={cn(
                    'px-3 py-1 rounded-full border text-sm transition-all hover:scale-105',
                    (value.types || []).includes(type)
                      ? 'border-primary text-white bg-primary/15 shadow-glow'
                      : 'border-border text-text-secondary hover:border-border-accent hover:text-white'
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Clear filters */}
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <button 
              onClick={clearAll} 
              className="text-sm text-text-secondary hover:text-white flex items-center gap-1 transition-colors hover:accent-ring rounded-md px-2 py-1"
              disabled={!hasActiveFilters()}
            >
              <X className="h-4 w-4" /> 
              Clear filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}