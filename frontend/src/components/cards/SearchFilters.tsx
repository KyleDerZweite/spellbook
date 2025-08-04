'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchFilters as SearchFiltersType } from '@/types/card';
import { X } from 'lucide-react';

interface SearchFiltersProps {
  filters: SearchFiltersType;
  onFiltersChange: (filters: SearchFiltersType) => void;
}

const RARITIES = ['common', 'uncommon', 'rare', 'mythic'];
const COLORS = [
  { id: 'W', name: 'White', color: '#FFFBD5' },
  { id: 'U', name: 'Blue', color: '#0E68AB' },
  { id: 'B', name: 'Black', color: '#150B00' },
  { id: 'R', name: 'Red', color: '#D3202A' },
  { id: 'G', name: 'Green', color: '#00733E' },
];

export function SearchFilters({ filters, onFiltersChange }: SearchFiltersProps) {
  const updateFilter = (key: keyof SearchFiltersType, value: any) => {
    const processedValue = value === 'all' || value === '' ? undefined : value;
    onFiltersChange({ ...filters, [key]: processedValue });
  };

  const toggleColor = (color: string) => {
    const currentColors = filters.colors || '';
    const hasColor = currentColors.includes(color);
    
    let newColors;
    if (hasColor) {
      newColors = currentColors.replace(color, '');
    } else {
      newColors = currentColors + color;
    }
    
    updateFilter('colors', newColors || undefined);
  };

  const clearFilters = () => {
    onFiltersChange({});
  };

  const hasActiveFilters = Object.values(filters).some(v => v !== undefined && v !== null && v !== '');

  return (
    <div className="space-y-4 bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Filters</h3>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-auto p-1 text-xs">
            <X className="w-3 h-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Colors */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Colors</label>
        <div className="flex flex-wrap gap-1">
          {COLORS.map((color) => {
            const isSelected = filters.colors?.includes(color.id);
            return (
              <Button
                key={color.id}
                variant={isSelected ? "default" : "outline"}
                size="sm"
                onClick={() => toggleColor(color.id)}
                className="text-xs h-8 px-2"
              >
                <div 
                  className="w-3 h-3 rounded-full mr-1 border border-gray-400" 
                  style={{ backgroundColor: color.color }}
                />
                {color.id}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Rarity */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Rarity</label>
        <Select value={filters.rarity || 'all'} onValueChange={(value) => updateFilter('rarity', value)}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Any rarity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any rarity</SelectItem>
            {RARITIES.map((rarity) => (
              <SelectItem key={rarity} value={rarity}>
                {rarity.charAt(0).toUpperCase() + rarity.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Type */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Type</label>
        <Select value={filters.type || 'all'} onValueChange={(value) => updateFilter('type', value)}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Any type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any type</SelectItem>
            <SelectItem value="creature">Creature</SelectItem>
            <SelectItem value="instant">Instant</SelectItem>
            <SelectItem value="sorcery">Sorcery</SelectItem>
            <SelectItem value="artifact">Artifact</SelectItem>
            <SelectItem value="enchantment">Enchantment</SelectItem>
            <SelectItem value="planeswalker">Planeswalker</SelectItem>
            <SelectItem value="land">Land</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Set */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Set Code</label>
        <Input
          placeholder="e.g. NEO, MID"
          value={filters.set || ''}
          onChange={(e) => updateFilter('set', e.target.value)}
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}