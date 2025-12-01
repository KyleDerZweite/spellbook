import { useState } from 'react'
import { ChevronDown, X, Filter } from 'lucide-react'
import type { CardSearchParams } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const COLORS = ['W', 'U', 'B', 'R', 'G', 'C']
const COLOR_LABELS: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
  C: 'Colorless'
}
const COLOR_STYLES: Record<string, { bg: string; border: string; text: string; activeBg: string }> = {
  W: { bg: 'bg-mana-white/10', border: 'border-mana-white/30', text: 'text-mana-white', activeBg: 'bg-mana-white/20' },
  U: { bg: 'bg-mana-blue/10', border: 'border-mana-blue/30', text: 'text-mana-blue', activeBg: 'bg-mana-blue/20' },
  B: { bg: 'bg-secondary', border: 'border-muted-foreground/30', text: 'text-muted-foreground', activeBg: 'bg-secondary' },
  R: { bg: 'bg-mana-red/10', border: 'border-mana-red/30', text: 'text-mana-red', activeBg: 'bg-mana-red/20' },
  G: { bg: 'bg-mana-green/10', border: 'border-mana-green/30', text: 'text-mana-green', activeBg: 'bg-mana-green/20' },
  C: { bg: 'bg-secondary', border: 'border-muted-foreground/30', text: 'text-muted-foreground', activeBg: 'bg-secondary' },
}

const RARITIES = ['common', 'uncommon', 'rare', 'mythic']
const RARITY_STYLES: Record<string, { color: string }> = {
  common: { color: 'text-rarity-common' },
  uncommon: { color: 'text-rarity-uncommon' },
  rare: { color: 'text-rarity-rare' },
  mythic: { color: 'text-rarity-mythic' },
}

const TYPES = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land']

interface SearchFiltersProps {
  value: CardSearchParams
  onChange: (value: CardSearchParams) => void
}

export function SearchFilters({ value, onChange }: SearchFiltersProps) {
  const [open, setOpen] = useState(true)

  const toggleArray = (key: keyof CardSearchParams, item: string) => {
    const currentArray = (value[key] as string[]) || []
    const arr = new Set(currentArray)

    if (arr.has(item)) {
      arr.delete(item)
    } else {
      arr.add(item)
    }

    onChange({
      ...value,
      [key]: Array.from(arr),
      page: 1
    })
  }

  const clearAll = () => {
    onChange({
      q: value.q || '',
      page: 1,
      per_page: value.per_page || 24
    })
  }

  const activeCount =
    (value.colors?.length || 0) +
    (value.rarity?.length || 0) +
    (value.types?.length || 0)

  return (
    <Card className="overflow-hidden">
      <Button
        variant="ghost"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-card transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Filter className="h-4 w-4 text-primary" />
          </div>
          <span className="font-medium text-foreground">
            Advanced Filters
          </span>
          {activeCount > 0 && (
            <span className="text-xs bg-primary/15 text-primary px-2.5 py-1 rounded-full border border-primary/20">
              {activeCount} active
            </span>
          )}
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && 'rotate-180')} />
      </Button>

      {open && (
        <div className="p-4 pt-0 space-y-6 border-t border-border">
          {/* Colors */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3">Colors</p>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => {
                const isActive = value.colors?.includes(color)
                const styles = COLOR_STYLES[color]
                return (
                  <Button
                    key={color}
                    variant="outline"
                    size="sm"
                    onClick={() => toggleArray('colors', color)}
                    className={cn(
                      'h-9 px-3',
                      isActive
                        ? `${styles.activeBg} ${styles.border} ${styles.text}`
                        : `${styles.bg} ${styles.border} ${styles.text} opacity-60 hover:opacity-100`
                    )}
                  >
                    {COLOR_LABELS[color]}
                  </Button>
                )
              })}
            </div>
          </div>

          {/* Rarity */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3">Rarity</p>
            <div className="flex flex-wrap gap-2">
              {RARITIES.map((rarity) => {
                const isActive = value.rarity?.includes(rarity)
                const styles = RARITY_STYLES[rarity]
                return (
                  <Button
                    key={rarity}
                    variant="outline"
                    size="sm"
                    onClick={() => toggleArray('rarity', rarity)}
                    className={cn(
                      'h-9 px-3 capitalize',
                      isActive
                        ? `bg-secondary ${styles.color} border-current`
                        : 'opacity-60 hover:opacity-100'
                    )}
                  >
                    {rarity}
                  </Button>
                )
              })}
            </div>
          </div>

          {/* Card Types */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3">Card Types</p>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((type) => {
                const isActive = value.types?.includes(type)
                return (
                  <Button
                    key={type}
                    variant="outline"
                    size="sm"
                    onClick={() => toggleArray('types', type)}
                    className={cn(
                      'h-9 px-3',
                      isActive
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'opacity-60 hover:opacity-100'
                    )}
                  >
                    {type}
                  </Button>
                )
              })}
            </div>
          </div>

          {/* Clear Button */}
          {activeCount > 0 && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4 mr-2" />
                Clear all filters
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
