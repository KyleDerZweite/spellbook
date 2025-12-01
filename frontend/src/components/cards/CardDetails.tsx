import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getCardImageUrl, formatPrice } from '@/lib/utils'
import type { Card, UserCard } from '@/lib/types'
import { Plus, ExternalLink } from 'lucide-react'

interface CardDetailsProps {
  card: Card | null
  userCard?: UserCard
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddToCollection?: (card: Card) => void
  showAddButton?: boolean
}

export function CardDetails({
  card,
  userCard,
  open,
  onOpenChange,
  onAddToCollection,
  showAddButton = false,
}: CardDetailsProps) {
  if (!card) return null

  const quantity = userCard?.quantity || 0
  const foilQuantity = userCard?.foil_quantity || 0
  const totalQuantity = quantity + foilQuantity

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

              {totalQuantity > 0 && (
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                  <p className="text-sm font-medium text-primary">
                    In Collection: {totalQuantity}
                    {foilQuantity > 0 && (
                      <span className="ml-2 text-mana-gold">
                        ({foilQuantity} foil)
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-6 flex gap-3 flex-wrap">
              {showAddButton && onAddToCollection && (
                <Button
                  onClick={() => onAddToCollection(card)}
                  className="flex items-center gap-2"
                >
                  <Plus size={16} />
                  Add to Collection
                </Button>
              )}

              {card.scryfall_id && (
                <Button variant="outline" asChild>
                  <a
                    href={`https://scryfall.com/card/${card.scryfall_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    <ExternalLink size={16} />
                    Scryfall
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
