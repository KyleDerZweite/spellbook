'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Plus, Eye, Star, Layers3 } from 'lucide-react';
import { getCardImageUrl, formatPrice } from '../../lib/utils';
import type { Card, UserCard } from '../../lib/types';

interface CardTileProps {
  card: Card & { version_count?: number };
  userCard?: UserCard;
  showAddButton?: boolean;
  showQuantity?: boolean;
  showVersionCount?: boolean;
  showSetInfo?: boolean;
  onAdd?: (card: Card) => void;
  onView?: (card: Card) => void;
  onVersionsClick?: (oracleId: string) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  layoutIdPrefix?: string;
}

export function CardTile({ 
  card, 
  userCard,
  showAddButton = false, 
  showQuantity = false,
  showVersionCount = false,
  showSetInfo = false,
  onAdd, 
  onView, 
  onVersionsClick,
  className = '',
  size = 'md',
  layoutIdPrefix = 'card'
}: CardTileProps) {
  const quantity = userCard?.quantity || 0;
  const foilQuantity = userCard?.foil_quantity || 0;
  const totalQuantity = quantity + foilQuantity;
  const rarityBorderClass = getRarityBorderClass(card.rarity);

  return (
    <motion.div
      className={`group relative overflow-hidden rounded-xl bg-card border border-border cursor-pointer will-change-transform transition-all ${rarityBorderClass} ${className}`}
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 250, damping: 18 }}
      onClick={() => onView?.(card)}
      layoutId={`${layoutIdPrefix}-${card.id}`}
    >
      <div className="aspect-[5/7]">
        <Image
          src={getCardImageUrl(card, 'normal')}
          alt={card.name}
          fill
          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
          className="object-cover group-hover:scale-105 transition-transform duration-300"
          priority={false}
        />
        
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        
        {/* Card info */}
        <div className="absolute bottom-0 left-0 right-0 p-3 space-y-1">
          <h3 className="text-white font-medium text-sm line-clamp-2 leading-tight">
            {card.name}
          </h3>
          
          {card.type_line && (
            <p className="text-xs text-white/70 line-clamp-1">
              {card.type_line}
            </p>
          )}
          
          {showSetInfo && card.set?.code && (
            <p className="text-white/60 text-xs uppercase font-semibold">
              {card.set.code}
            </p>
          )}
          
          {card.prices?.usd && (
            <p className="text-accent text-xs font-semibold">
              {formatPrice(card.prices.usd)}
            </p>
          )}
        </div>

        {/* Rarity indicator */}
        {card.rarity && (
          <div className="absolute top-2 left-2">
            <div className={`w-2.5 h-2.5 rounded-full ${getRarityColor(card.rarity)}`} />
          </div>
        )}

        {/* Version count badge */}
        {showVersionCount && card.version_count && card.version_count > 1 && (
          <button
            className="absolute top-2 right-2 bg-accent hover:bg-accent-hover rounded-full px-2 py-1 text-xs font-semibold text-white flex items-center gap-1 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              if (card.oracle_id && onVersionsClick) {
                onVersionsClick(card.oracle_id);
              }
            }}
            title={`View all ${card.version_count} versions`}
          >
            <Layers3 size={10} />
            {card.version_count}
          </button>
        )}
        
        {/* Quantity badge */}
        {showQuantity && totalQuantity > 0 && (
          <div className={`absolute top-2 bg-black/80 rounded-full px-2 py-1 text-xs font-semibold text-white flex items-center gap-1 ${showVersionCount && card.version_count && card.version_count > 1 ? "right-14" : "right-2"}`}>
            {foilQuantity > 0 && <Star size={10} className="text-yellow-400" />}
            {totalQuantity}
          </div>
        )}

        {/* Action buttons (on hover) */}
        <div className={`absolute top-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${showVersionCount && card.version_count && card.version_count > 1 ? "right-16" : "right-2"}`}>
          {showAddButton && onAdd && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAdd(card);
              }}
              className="p-2 rounded-full bg-accent hover:bg-accent-hover transition-colors"
              title="Add to collection"
              aria-label="Add to collection"
            >
              <Plus className="h-4 w-4 text-white" />
            </button>
          )}
          
          {onView && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onView(card);
              }}
              className="p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
              title="View details"
              aria-label="View details"
            >
              <Eye className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function getRarityColor(rarity: string): string {
  switch (rarity.toLowerCase()) {
    case 'mythic':
      return 'bg-rarity-mythic shadow-[0_0_8px_rgb(249_115_22/0.5)]';
    case 'rare':
      return 'bg-rarity-rare shadow-[0_0_8px_rgb(251_191_36/0.5)]';
    case 'uncommon':
      return 'bg-rarity-uncommon';
    case 'common':
    default:
      return 'bg-rarity-common';
  }
}

function getRarityBorderClass(rarity: string): string {
  switch (rarity.toLowerCase()) {
    case 'mythic':
      return 'hover:border-rarity-mythic/50 hover:shadow-[0_0_20px_rgb(249_115_22/0.2)]';
    case 'rare':
      return 'hover:border-rarity-rare/50 hover:shadow-[0_0_20px_rgb(251_191_36/0.2)]';
    default:
      return 'hover:border-accent/40';
  }
}
