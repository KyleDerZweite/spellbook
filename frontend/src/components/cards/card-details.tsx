'use client';

import * as Dialog from '@radix-ui/react-dialog';
import Image from 'next/image';
import { X, Plus, Star, ExternalLink } from 'lucide-react';
import { rarityColor, getCardImageUrl, formatPrice, formatDate } from '../../lib/utils';
import type { Card, UserCard } from '../../lib/types';
import { motion } from 'framer-motion';

interface CardDetailsProps {
  card: Card | null;
  userCard?: UserCard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToCollection?: (card: Card) => void;
  showAddButton?: boolean;
  layoutIdPrefix?: string;
}

export function CardDetails({ 
  card, 
  userCard,
  open, 
  onOpenChange, 
  onAddToCollection,
  showAddButton = false,
  layoutIdPrefix = 'card'
}: CardDetailsProps) {
  if (!card) return null;

  const quantity = userCard?.quantity || 0;
  const foilQuantity = userCard?.foil_quantity || 0;
  const totalQuantity = quantity + foilQuantity;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50" />
        <Dialog.Content 
          className="fixed inset-0 md:inset-auto md:top-[8%] md:left-1/2 md:-translate-x-1/2 md:w-[980px] max-w-[98vw] elevated p-0 overflow-hidden z-50"
        >
          <motion.div 
            layoutId={`${layoutIdPrefix}-${card.id}`}
            className="grid md:grid-cols-2 gap-0"
          >
            {/* Card Image Section */}
            <div className="relative aspect-[5/7]">
              <Image 
                src={getCardImageUrl(card, 'large')} 
                alt={card.name} 
                fill 
                className="object-cover"
              />
            </div>
            
            {/* Card Details Section */}
            <div className="p-6">
              {/* Header with close button */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                  <Dialog.Title className="text-2xl font-semibold">
                    {card.name}
                  </Dialog.Title>
                  {card.type_line && (
                    <p className={rarityColor(card.rarity)}>
                      {card.type_line}
                    </p>
                  )}
                </div>
                <Dialog.Close className="p-2 rounded-md hover:bg-surface-variant transition-colors ml-4">
                  <X size={20} className="text-text-muted" />
                </Dialog.Close>
              </div>
              
              {/* Card Details Content */}
              <div className="space-y-4 text-text-secondary">
                {card.mana_cost && (
                  <div className="text-sm">
                    <span className="font-medium">Mana Cost:</span> {card.mana_cost}
                  </div>
                )}
                
                {card.oracle_text && (
                  <div className="text-sm">
                    <div className="font-medium mb-2">Oracle Text:</div>
                    <div className="whitespace-pre-line bg-surface-variant rounded-md p-3 border border-border">
                      {card.oracle_text}
                    </div>
                  </div>
                )}
                
                {(card.power || card.toughness) && (
                  <div className="text-sm">
                    <span className="font-medium">Power/Toughness:</span> {card.power || '*'}/{card.toughness || '*'}
                  </div>
                )}
                
                {card.prices && Object.keys(card.prices).length > 0 && (
                  <div className="text-sm">
                    <div className="font-medium mb-1">Prices:</div>
                    {Object.entries(card.prices)
                      .filter(([, v]) => v)
                      .map(([k, v]) => `${k.toUpperCase()}: ${formatPrice(v)}`)
                      .join(' · ')}
                  </div>
                )}
                
                {card.artist && (
                  <div className="text-sm">
                    <span className="font-medium">Artist:</span> {card.artist}
                  </div>
                )}
                
                {card.set && (
                  <div className="text-sm">
                    <span className="font-medium">Set:</span> {card.set.name} ({card.set.code?.toUpperCase()})
                  </div>
                )}
                
                {/* Collection Info */}
                {totalQuantity > 0 && (
                  <div className="text-sm bg-primary/10 border border-primary/20 rounded-md p-3">
                    <span className="font-medium">In Collection:</span> {totalQuantity} 
                    {foilQuantity > 0 && (
                      <span className="ml-1 text-yellow-400">
                        ({foilQuantity} foil)
                      </span>
                    )}
                  </div>
                )}
              </div>
              
              {/* Action Buttons */}
              <div className="mt-6 flex gap-3">
                <Dialog.Close asChild>
                  <button className="px-4 py-2 rounded-md bg-surface-variant border border-border hover:border-border-accent transition-colors">
                    Close
                  </button>
                </Dialog.Close>
                
                {showAddButton && onAddToCollection && (
                  <button
                    onClick={() => onAddToCollection(card)}
                    className="px-4 py-2 rounded-md btn-primary flex items-center gap-2"
                  >
                    <Plus size={16} />
                    Add to Collection
                  </button>
                )}
                
                {card.scryfall_id && (
                  <a
                    href={`https://scryfall.com/card/${card.scryfall_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-md bg-surface-variant border border-border hover:border-border-accent transition-colors flex items-center gap-2"
                  >
                    <ExternalLink size={16} />
                    Scryfall
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}