'use client';

import { useState } from 'react';
import { ChevronDown, X, Filter } from 'lucide-react';
import type { CardSearchParams } from '../../lib/types';

const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];
const COLOR_LABELS: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
  C: 'Colorless'
};
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

  const activeCount = 
    (value.colors?.length || 0) + 
    (value.rarity?.length || 0) + 
    (value.types?.length || 0);

  return (
    <div className="bg-card border border-border rounded-xl">
      <button 
        onClick={() => setOpen(!open)} 
        className="w-full flex items-center justify-between p-4 text-left hover:bg-card-hover transition-colors rounded-xl"
      >
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-foreground-muted" />
          <span className="font-medium text-foreground">
            Advanced Filters
          </span>
          {activeCount > 0 && (
            <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">
              {activeCount} active
            </span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-foreground-muted transition-transform ${open && 'rotate-180'}`} />
      </button>
      
      {open && (
        <div className="px-4 pb-4 space-y-5 border-t border-border/50">
          {/* Colors */}
          <div className="pt-4">
            <div className="text-xs text-foreground-muted mb-3 font-medium uppercase tracking-wide">Colors</div>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => toggleArray('colors', color)}
                  title={COLOR_LABELS[color]}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                    (value.colors || []).includes(color)
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-foreground-muted hover:border-accent/50 hover:text-foreground'
                  }`}
                >
                  {color}
                </button>
              ))}
            </div>
          </div>

          {/* Rarity */}
          <div>
            <div className="text-xs text-foreground-muted mb-3 font-medium uppercase tracking-wide">Rarity</div>
            <div className="flex gap-2 flex-wrap">
              {RARITIES.map((rarity) => (
                <button
                  key={rarity}
                  onClick={() => toggleArray('rarity', rarity)}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-medium capitalize transition-all ${
                    (value.rarity || []).includes(rarity)
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-foreground-muted hover:border-accent/50 hover:text-foreground'
                  }`}
                >
                  {rarity}
                </button>
              ))}
            </div>
          </div>

          {/* Types */}
          <div>
            <div className="text-xs text-foreground-muted mb-3 font-medium uppercase tracking-wide">Card Type</div>
            <div className="flex gap-2 flex-wrap">
              {TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => toggleArray('types', type)}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                    (value.types || []).includes(type)
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-foreground-muted hover:border-accent/50 hover:text-foreground'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Clear button */}
          {hasActiveFilters() && (
            <div className="pt-3 border-t border-border/50">
              <button 
                onClick={clearAll} 
                className="text-sm text-foreground-muted hover:text-foreground flex items-center gap-2 transition-colors"
              >
                <X className="h-4 w-4" /> 
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
