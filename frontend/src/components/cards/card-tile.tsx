'use client';

import Image from 'next/image';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { Plus, Eye, Star, Layers3 } from 'lucide-react';
import { cn, rarityColor, getCardImageUrl, formatPrice } from '../../lib/utils';
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

  // Motion values for tilt effect
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useTransform(my, [0, 300], [6, -6]);
  const rotateY = useTransform(mx, [0, 200], [-6, 6]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mx.set(x);
    my.set(y);
    // Set CSS custom properties for spotlight effect
    e.currentTarget.style.setProperty('--mx', `${x}px`);
    e.currentTarget.style.setProperty('--my', `${y}px`);
  }, [mx, my]);

  return (
    <motion.div
      className={cn(
        'group relative overflow-hidden rounded-xl elevated hover-highlight spotlight cursor-pointer will-change-transform',
        'hover:shadow-glow',
        className
      )}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 250, damping: 18 }}
      onMouseMove={onMouseMove}
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
        
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        
        {/* Card info overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-3 space-y-1">
          <h3 className="text-white font-medium text-sm line-clamp-2 leading-tight">
            {card.name}
          </h3>
          
          {card.type_line && (
            <p className={cn('text-xs', rarityColor(card.rarity))}>
              {card.type_line}
            </p>
          )}
          
          {showSetInfo && card.set?.code && (
            <p className="text-white/70 text-xs uppercase font-semibold">
              {card.set.code}
            </p>
          )}
          
          {card.mana_cost && (
            <p className="text-white/80 text-xs font-mono">
              {card.mana_cost}
            </p>
          )}
          
          {card.prices?.usd && (
            <p className="text-white/90 text-xs font-semibold">
              {formatPrice(card.prices.usd)}
            </p>
          )}
        </div>

        {/* Rarity indicator */}
        {card.rarity && (
          <div className="absolute top-2 left-2">
            <div className={cn(
              'w-2 h-2 rounded-full',
              card.rarity === 'mythic' && 'bg-card-mythic',
              card.rarity === 'rare' && 'bg-card-rare',
              card.rarity === 'uncommon' && 'bg-card-uncommon',
              card.rarity === 'common' && 'bg-card-common'
            )} />
          </div>
        )}

        {/* Version count badge */}
        {showVersionCount && card.version_count && card.version_count > 1 && (
          <div 
            className="absolute top-2 right-2 bg-primary/90 hover:bg-primary rounded-full px-2 py-1 text-xs font-semibold text-white flex items-center gap-1 cursor-pointer transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              if (card.oracle_id && onVersionsClick) {
                onVersionsClick(card.oracle_id);
              }
            }}
            title={`View all ${card.version_count} versions`}
          >
            <Layers3 size={10} className="text-white" />
            {card.version_count}
          </div>
        )}
        
        {/* Quantity badge */}
        {showQuantity && totalQuantity > 0 && (
          <div className={cn(
            "absolute top-2 bg-black/80 rounded-full px-2 py-1 text-xs font-semibold text-white flex items-center gap-1",
            showVersionCount && card.version_count && card.version_count > 1 ? "right-16" : "right-2"
          )}>
            {foilQuantity > 0 && <Star size={10} className="text-yellow-400" />}
            {totalQuantity}
          </div>
        )}

        {/* Action buttons */}
        <div className={cn(
          "absolute top-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
          showVersionCount && card.version_count && card.version_count > 1 ? "right-20" : "right-2"
        )}>
          {showAddButton && onAdd && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAdd(card);
              }}
              className="p-2 rounded-full btn-primary accent-ring"
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
              className="p-2 rounded-full bg-black/80 hover:bg-black text-white transition-colors shadow-lg accent-ring"
              title="View details"
              aria-label="View details"
            >
              <Eye className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Loading skeleton overlay when image is loading */}
        <div className="absolute inset-0 bg-surface-variant animate-pulse opacity-0" />
      </div>
    </motion.div>
  );
}