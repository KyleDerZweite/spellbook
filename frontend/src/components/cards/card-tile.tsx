'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Plus, Eye, Star, Layers3 } from 'lucide-react';
import { getCardImageUrl, formatPrice } from '../../lib/utils';
import type { Card, UserCard } from '../../lib/types';
import { useCallback } from 'react';

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
  className,
  size = 'md',
  layoutIdPrefix = 'card'
}: CardTileProps) {
  const sizeClasses = {
    sm: 'aspect-[5/7]',
    md: 'aspect-[5/7]',
    lg: 'aspect-[5/7]'
  };

  const quantity = userCard?.quantity || 0;
  const foilQuantity = userCard?.foil_quantity || 0;
  const totalQuantity = quantity + foilQuantity;

  return (
    <motion.div
      className={`group relative overflow-hidden rounded-lg bg-ui-bg cursor-pointer will-change-transform ${className}`}
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 250, damping: 18 }}
      onClick={() => onView?.(card)}
      layoutId={`${layoutIdPrefix}-${card.id}`}
    >
      <div className={sizeClasses[size]}>
        <Image
          src={getCardImageUrl(card, 'normal')}
          alt={card.name}
          fill
          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
          className="object-cover group-hover:scale-105 transition-transform duration-300"
          priority={false}
        />
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        
        <div className="absolute bottom-0 left-0 right-0 p-sm space-y-xs">
          <h3 className="text-text-primary font-medium text-sm line-clamp-2 leading-tight">
            {card.name}
          </h3>
          
          {card.type_line && (
            <p className="text-xs text-text-secondary">
              {card.type_line}
            </p>
          )}
          
          {showSetInfo && card.set?.code && (
            <p className="text-text-secondary/70 text-xs uppercase font-semibold">
              {card.set.code}
            </p>
          )}
          
          {card.mana_cost && (
            <p className="text-text-secondary/80 text-xs font-mono">
              {card.mana_cost}
            </p>
          )}
          
          {card.prices?.usd && (
            <p className="text-text-primary/90 text-xs font-semibold">
              {formatPrice(card.prices.usd)}
            </p>
          )}
        </div>

        {card.rarity && (
          <div className="absolute top-sm left-sm">
            <div className={`w-2 h-2 rounded-full bg-card-${card.rarity}`} />
          </div>
        )}

        {showVersionCount && card.version_count && card.version_count > 1 && (
          <div 
            className="absolute top-sm right-sm bg-accent-primary/90 hover:bg-accent-primary rounded-full px-sm py-xs text-xs font-semibold text-text-primary flex items-center gap-xs cursor-pointer transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              if (card.oracle_id && onVersionsClick) {
                onVersionsClick(card.oracle_id);
              }
            }}
            title={`View all ${card.version_count} versions`}
          >
            <Layers3 size={10} className="text-text-primary" />
            {card.version_count}
          </div>
        )}
        
        {showQuantity && totalQuantity > 0 && (
          <div className={`absolute top-sm bg-black/80 rounded-full px-sm py-xs text-xs font-semibold text-text-primary flex items-center gap-xs ${showVersionCount && card.version_count && card.version_count > 1 ? "right-16" : "right-sm"}`}>
            {foilQuantity > 0 && <Star size={10} className="text-yellow-400" />}
            {totalQuantity}
          </div>
        )}

        <div className={`absolute top-sm flex flex-col gap-xs opacity-0 group-hover:opacity-100 transition-opacity ${showVersionCount && card.version_count && card.version_count > 1 ? "right-20" : "right-sm"}`}>
          {showAddButton && onAdd && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAdd(card);
              }}
              className="p-sm rounded-full bg-accent-primary hover:bg-accent-hover"
              title="Add to collection"
              aria-label="Add to collection"
            >
              <Plus className="h-4 w-4 text-text-primary" />
            </button>
          )}
          
          {onView && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onView(card);
              }}
              className="p-sm rounded-full bg-ui-bg/80 hover:bg-ui-bg text-text-primary transition-colors shadow-lg"
              title="View details"
              aria-label="View details"
            >
              <Eye className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="absolute inset-0 bg-ui-bg animate-pulse opacity-0" />
      </div>
    </motion.div>
  );
}