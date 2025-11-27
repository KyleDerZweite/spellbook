'use client';

import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
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
      page: 1
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
    <div className="bg-ui-bg rounded-lg p-md">
      <button 
        onClick={() => setOpen(!open)} 
        className="w-full flex items-center justify-between text-left hover:text-text-primary transition-colors"
      >
        <span className="font-medium text-sm text-text-secondary">
          Advanced Filters {hasActiveFilters() && '(Active)'}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform text-text-secondary ${open && 'rotate-180'}`} />
      </button>
      
      {open && (
        <div className="mt-md space-y-md">
          <div>
            <div className="text-xs text-text-secondary mb-sm font-medium">Colors</div>
            <div className="flex gap-sm flex-wrap">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => toggleArray('colors', color)}
                  className={`px-sm py-xs rounded-full border text-sm transition-all hover:scale-105 ${(value.colors || []).includes(color)
                      ? 'border-focus-border text-text-primary bg-accent-primary/20'
                      : 'border-border text-text-secondary hover:border-focus-border hover:text-text-primary'}`}
                >
                  {color}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs text-text-secondary mb-sm font-medium">Rarity</div>
            <div className="flex gap-sm flex-wrap">
              {RARITIES.map((rarity) => (
                <button
                  key={rarity}
                  onClick={() => toggleArray('rarity', rarity)}
                  className={`px-sm py-xs rounded-full border text-sm capitalize transition-all hover:scale-105 ${(value.rarity || []).includes(rarity)
                      ? 'border-focus-border text-text-primary bg-accent-primary/20'
                      : 'border-border text-text-secondary hover:border-focus-border hover:text-text-primary'}`}
                >
                  {rarity}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs text-text-secondary mb-sm font-medium">Type</div>
            <div className="flex gap-sm flex-wrap">
              {TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => toggleArray('types', type)}
                  className={`px-sm py-xs rounded-full border text-sm transition-all hover:scale-105 ${(value.types || []).includes(type)
                      ? 'border-focus-border text-text-primary bg-accent-primary/20'
                      : 'border-border text-text-secondary hover:border-focus-border hover:text-text-primary'}`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-sm border-t border-border/50">
            <button 
              onClick={clearAll} 
              className="text-sm text-text-secondary hover:text-text-primary flex items-center gap-xs transition-colors rounded-md px-sm py-xs"
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