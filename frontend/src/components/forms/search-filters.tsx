'use client';

import { useState } from 'react';
import { ChevronDown, X, Filter } from 'lucide-react';
import type { CardSearchParams } from '../../lib/types';

import { Button } from '@/components/ui/button'; // Import Button component
import { cn } from '@/lib/utils'; // Import cn utility

const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];
const COLOR_LABELS: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
  C: 'Colorless'
};
const COLOR_STYLES: Record<string, { bg: string; border: string; text: string; activeBg: string }> = {
  W: { bg: 'bg-mana-white/10', border: 'border-mana-white/30', text: 'text-mana-white', activeBg: 'bg-mana-white/20' },
  U: { bg: 'bg-mana-blue/10', border: 'border-mana-blue/30', text: 'text-mana-blue', activeBg: 'bg-mana-blue/20' },
  B: { bg: 'bg-mana-black/15', border: 'border-mana-black/40', text: 'text-foreground-muted', activeBg: 'bg-mana-black/25' },
  R: { bg: 'bg-mana-red/10', border: 'border-mana-red/30', text: 'text-mana-red', activeBg: 'bg-mana-red/20' },
  G: { bg: 'bg-mana-green/10', border: 'border-mana-green/30', text: 'text-mana-green', activeBg: 'bg-mana-green/20' },
  C: { bg: 'bg-mana-colorless/10', border: 'border-mana-colorless/30', text: 'text-mana-colorless', activeBg: 'bg-mana-colorless/20' },
};
const RARITIES = ['common', 'uncommon', 'rare', 'mythic'];
const RARITY_STYLES: Record<string, { color: string; glow?: string }> = {
  common: { color: 'text-rarity-common' },
  uncommon: { color: 'text-rarity-uncommon' },
  rare: { color: 'text-rarity-rare', glow: 'shadow-[0_0_10px_rgb(var(--rarity-rare)/0.3)]' },
  mythic: { color: 'text-rarity-mythic', glow: 'shadow-[0_0_10px_rgb(var(--rarity-mythic)/0.3)]' },
};
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
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <Button
        variant="ghost" // Use ghost variant for the main toggle button
        onClick={() => setOpen(!open)} 
        className="w-full flex items-center justify-between p-4 text-left hover:bg-card-hover transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center"> {/* Changed accent to primary */}
            <Filter className="h-4 w-4 text-primary" />
          </div>
          <span className="font-medium text-foreground">
            Advanced Filters
          </span>
          {activeCount > 0 && (
            <span className="text-xs bg-primary/15 text-primary px-2.5 py-1 rounded-full border border-primary/20"> {/* Changed accent to primary */}
              {activeCount} active
            </span>
          )}
        </div>
        <ChevronDown className={cn("h-4 w-4 text-foreground-muted transition-transform", open && 'rotate-180')} />
      </Button>
      
      {open && (
        <div className="px-4 pb-4 space-y-6 border-t border-border/50">
          {/* Colors - MTG Mana Symbols */}
          <div className="pt-4">
            <div className="text-xs text-foreground-muted mb-3 font-medium uppercase tracking-wide">Mana Colors</div>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((color) => {
                const isActive = (value.colors || []).includes(color);
                const styles = COLOR_STYLES[color];
                return (
                  <Button
                    key={color}
                    variant="secondary" // Use secondary variant for color buttons
                    onClick={() => toggleArray('colors', color)}
                    title={COLOR_LABELS[color]}
                    className={cn(`w-10 h-10 rounded-full border-2 text-sm font-bold transition-all flex items-center justify-center`,
                      isActive
                        ? `${styles.activeBg} ${styles.border} ${styles.text} shadow-glow`
                        : `${styles.bg} border-border ${styles.text} opacity-60 hover:opacity-100 hover:${styles.border}`
                    )}
                  >
                    {color}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Rarity */}
          <div>
            <div className="text-xs text-foreground-muted mb-3 font-medium uppercase tracking-wide">Rarity</div>
            <div className="flex gap-2 flex-wrap">
              {RARITIES.map((rarity) => {
                const isActive = (value.rarity || []).includes(rarity);
                const styles = RARITY_STYLES[rarity];
                return (
                  <Button
                    key={rarity}
                    variant="secondary" // Use secondary variant for rarity buttons
                    onClick={() => toggleArray('rarity', rarity)}
                    className={cn(`px-4 py-2 rounded-xl border text-sm font-medium capitalize transition-all`,
                      isActive
                        ? `border-current ${styles.color} bg-current/10 ${styles.glow || ''}`
                        : 'border-border text-foreground-muted hover:text-foreground hover:border-border-hover'
                    )}
                  >
                    {rarity}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Types */}
          <div>
            <div className="text-xs text-foreground-muted mb-3 font-medium uppercase tracking-wide">Card Type</div>
            <div className="flex gap-2 flex-wrap">
              {TYPES.map((type) => (
                <Button
                  key={type}
                  variant="secondary" // Use secondary variant for type buttons
                  onClick={() => toggleArray('types', type)}
                  className={cn(`px-4 py-2 rounded-xl border text-sm font-medium transition-all`,
                    (value.types || []).includes(type)
                      ? 'border-primary/50 bg-primary/10 text-primary' // Changed accent to primary
                      : 'border-border text-foreground-muted hover:border-primary/30 hover:text-foreground' // Changed accent to primary
                  )}
                >
                  {type}
                </Button>
              ))}
            </div>
          </div>

          {/* Clear button */}
          {hasActiveFilters() && (
            <div className="pt-4 border-t border-border/50">
              <Button 
                variant="ghost" // Use ghost variant for clear button
                onClick={clearAll} 
                className="text-sm text-foreground-muted hover:text-error flex items-center gap-2 transition-colors px-3 py-2 rounded-lg hover:bg-error/10"
              >
                <X className="h-4 w-4" /> 
                Clear all filters
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
