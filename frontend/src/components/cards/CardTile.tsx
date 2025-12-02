import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn, getCardImageUrl, rarityColor } from '@/lib/utils'
import type { Card as CardType, UserCard } from '@/lib/types'
import { Plus, Layers, Check } from 'lucide-react'

interface CardTileProps {
  card: CardType
  userCard?: UserCard
  isInCollection?: boolean
  showAddButton?: boolean
  showQuantity?: boolean
  showVersionCount?: boolean
  onAdd?: (card: CardType) => void
  onView?: (card: CardType) => void
  onVersionsClick?: (oracleId: string) => void
}

export function CardTile({
  card,
  userCard,
  isInCollection = false,
  showAddButton = false,
  showQuantity = false,
  showVersionCount = false,
  onAdd,
  onView,
  onVersionsClick,
}: CardTileProps) {
  const quantity = userCard?.quantity || 0
  const cardOwned = isInCollection || quantity > 0

  return (
    <Card
      className="group relative overflow-hidden cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-glow"
      onClick={() => onView?.(card)}
    >
      {/* Card Image */}
      <div className="aspect-[5/7] relative overflow-hidden rounded-lg">
        <img
          src={getCardImageUrl(card, 'normal')}
          alt={card.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <p className="text-white text-sm font-semibold truncate">{card.name}</p>
            <p className={cn("text-xs capitalize", rarityColor(card.rarity))}>
              {card.rarity}
            </p>
          </div>
        </div>

        {/* Add Button */}
        {showAddButton && onAdd && (
          <Button
            size="icon"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 h-8 w-8"
            onClick={(e) => {
              e.stopPropagation()
              onAdd(card)
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}

        {/* In Collection Badge */}
        {cardOwned && !showQuantity && (
          <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs font-bold p-1.5 rounded-full">
            <Check className="h-3 w-3" />
          </div>
        )}

        {/* Quantity Badge */}
        {showQuantity && quantity > 0 && (
          <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded-full">
            x{quantity}
          </div>
        )}

        {/* Version Count */}
        {showVersionCount && card.version_count && card.version_count > 1 && card.oracle_id && (
          <Button
            variant="secondary"
            size="sm"
            className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation()
              onVersionsClick?.(card.oracle_id!)
            }}
          >
            <Layers className="h-3 w-3 mr-1" />
            {card.version_count}
          </Button>
        )}
      </div>
    </Card>
  )
}
