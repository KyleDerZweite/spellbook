import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getCardImageUrl, formatPrice } from '@/lib/utils'
import type { Card, UserCard } from '@/lib/types'
import { Plus, ExternalLink, Minus } from 'lucide-react'

interface CardDetailsProps {
  card: Card | null
  userCard?: UserCard
  open: boolean
  onOpenChange: (open: boolean) => void
  onQuantityChange?: (card: Card, quantity: number) => void
  showCollectionControls?: boolean
  currentQuantity?: number
}

export function CardDetails({
  card,
  userCard,
  open,
  onOpenChange,
  onQuantityChange,
  showCollectionControls = false,
  currentQuantity = 0,
}: CardDetailsProps) {
  // Local state for the quantity input
  const [localQuantity, setLocalQuantity] = useState(currentQuantity)
  const [inputValue, setInputValue] = useState(currentQuantity.toString())
  const pendingQuantityRef = useRef<number | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Function to commit the pending quantity change
  const commitQuantityChange = useCallback(() => {
    if (pendingQuantityRef.current !== null && card && onQuantityChange) {
      onQuantityChange(card, pendingQuantityRef.current)
      pendingQuantityRef.current = null
    }
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
  }, [card, onQuantityChange])
  
  // Sync local state with prop changes
  useEffect(() => {
    setLocalQuantity(currentQuantity)
    setInputValue(currentQuantity.toString())
    pendingQuantityRef.current = null
  }, [currentQuantity, card?.scryfall_id])
  
  // Commit pending changes when modal closes
  useEffect(() => {
    if (!open) {
      commitQuantityChange()
    }
  }, [open, commitQuantityChange])
  
  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  if (!card) return null

  const foilQuantity = userCard?.foil_quantity || 0
  const cardInCollection = localQuantity > 0

  const scheduleQuantityUpdate = (newQuantity: number) => {
    pendingQuantityRef.current = newQuantity
    
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    
    // Set new timer for 1 second
    debounceTimerRef.current = setTimeout(() => {
      commitQuantityChange()
    }, 1000)
  }

  const handleQuantityChange = (newQuantity: number) => {
    // Clamp between 0 and 9999
    const clampedQuantity = Math.max(0, Math.min(9999, newQuantity))
    setLocalQuantity(clampedQuantity)
    setInputValue(clampedQuantity.toString())
    scheduleQuantityUpdate(clampedQuantity)
  }

  const handleInputChange = (value: string) => {
    setInputValue(value)
    // Allow empty input while typing
    if (value === '') {
      setLocalQuantity(0)
      return
    }
    const parsed = parseInt(value, 10)
    if (!isNaN(parsed)) {
      const clampedQuantity = Math.max(0, Math.min(9999, parsed))
      setLocalQuantity(clampedQuantity)
      scheduleQuantityUpdate(clampedQuantity)
    }
  }

  const handleInputBlur = () => {
    // On blur, ensure the input shows the actual quantity
    setInputValue(localQuantity.toString())
    // Also commit any pending changes immediately on blur
    commitQuantityChange()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        <div className="grid md:grid-cols-2 gap-0">
          {/* Card Image */}
          <div className="relative aspect-[5/7] bg-background">
            <img
              src={getCardImageUrl(card, 'large')}
              alt={card.name}
              className="w-full h-full object-contain"
            />
          </div>

          {/* Card Details */}
          <div className="p-6">
            {/* Header */}
            <DialogHeader className="mb-6">
              <DialogTitle className="text-xl font-bold">
                {card.name}
              </DialogTitle>
              {card.type_line && (
                <p className="text-muted-foreground mt-1">
                  {card.type_line}
                </p>
              )}
            </DialogHeader>

            {/* Details */}
            <div className="space-y-4">
              {card.mana_cost && (
                <DetailRow label="Mana Cost" value={card.mana_cost} />
              )}

              {card.oracle_text && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Oracle Text</p>
                  <div className="whitespace-pre-line bg-background rounded-lg p-4 border border-border text-sm">
                    {card.oracle_text}
                  </div>
                </div>
              )}

              {(card.power || card.toughness) && (
                <DetailRow
                  label="Power/Toughness"
                  value={`${card.power || '*'}/${card.toughness || '*'}`}
                />
              )}

              {card.prices && Object.keys(card.prices).length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Prices</p>
                  <p className="text-foreground">
                    {Object.entries(card.prices)
                      .filter(([, v]) => v)
                      .map(([k, v]) => `${k.toUpperCase()}: ${formatPrice(v)}`)
                      .join(' · ')}
                  </p>
                </div>
              )}

              {card.artist && (
                <DetailRow label="Artist" value={card.artist} />
              )}

              {card.set && (
                <DetailRow
                  label="Set"
                  value={`${card.set.name} (${card.set.code?.toUpperCase()})`}
                />
              )}

              {foilQuantity > 0 && (
                <div className="text-sm text-mana-gold">
                  {foilQuantity} foil {foilQuantity === 1 ? 'copy' : 'copies'}
                </div>
              )}
            </div>

            {/* Collection Controls */}
            {showCollectionControls && onQuantityChange && (
              <div className="mt-6">
                <p className="text-sm font-medium text-muted-foreground mb-2">In Your Collection</p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleQuantityChange(localQuantity - 1)}
                    disabled={localQuantity <= 0}
                    className="h-10 w-10"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    min="0"
                    max="9999"
                    value={inputValue}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onBlur={handleInputBlur}
                    className="w-20 text-center text-lg font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleQuantityChange(localQuantity + 1)}
                    disabled={localQuantity >= 9999}
                    className="h-10 w-10"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground ml-2">
                    {cardInCollection ? 'copies' : 'not in collection'}
                  </span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex gap-3 flex-wrap">
              {card.scryfall_id && (
                <Button variant="outline" asChild>
                  <a
                    href={`https://scryfall.com/card/${card.scryfall_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    <ExternalLink size={16} />
                    View on Scryfall
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-foreground">{value}</p>
    </div>
  )
}
