'use client';

import * as Dialog from '@radix-ui/react-dialog';
import Image from 'next/image';
import { X, Plus, ExternalLink } from 'lucide-react';
import { getCardImageUrl, formatPrice } from '../../lib/utils';
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
        <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50" />
        <Dialog.Content 
          className="fixed inset-4 md:inset-auto md:top-[8%] md:left-1/2 md:-translate-x-1/2 md:w-[900px] max-w-[98vw] max-h-[85vh] overflow-y-auto bg-card border border-border rounded-2xl z-50"
        >
          <motion.div 
            layoutId={`${layoutIdPrefix}-${card.id}`}
            className="grid md:grid-cols-2 gap-0"
          >
            {/* Card Image */}
            <div className="relative aspect-[5/7] bg-background">
              <Image 
                src={getCardImageUrl(card, 'large')} 
                alt={card.name} 
                fill 
                className="object-contain"
              />
            </div>
            
            {/* Card Details */}
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1 min-w-0">
                  <Dialog.Title className="text-xl font-bold text-foreground">
                    {card.name}
                  </Dialog.Title>
                  {card.type_line && (
                    <p className="text-foreground-muted mt-1">
                      {card.type_line}
                    </p>
                  )}
                </div>
                <Dialog.Close className="p-2 rounded-lg hover:bg-card-hover transition-colors ml-4">
                  <X size={20} className="text-foreground-muted" />
                </Dialog.Close>
              </div>
              
              {/* Details */}
              <div className="space-y-4">
                {card.mana_cost && (
                  <DetailRow label="Mana Cost" value={card.mana_cost} />
                )}
                
                {card.oracle_text && (
                  <div>
                    <p className="text-sm font-medium text-foreground-muted mb-2">Oracle Text</p>
                    <div className="whitespace-pre-line bg-background rounded-lg p-4 border border-border text-sm text-foreground">
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
                    <p className="text-sm font-medium text-foreground-muted mb-1">Prices</p>
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
                  <div className="bg-accent/10 border border-accent/20 rounded-lg p-4">
                    <p className="text-sm font-medium text-accent">
                      In Collection: {totalQuantity}
                      {foilQuantity > 0 && (
                        <span className="ml-2 text-yellow-400">
                          ({foilQuantity} foil)
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>
              
              {/* Actions */}
              <div className="mt-6 flex gap-3 flex-wrap">
                <Dialog.Close asChild>
                  <button className="px-4 py-2 rounded-lg bg-background-tertiary border border-border hover:bg-card-hover text-foreground transition-colors">
                    Close
                  </button>
                </Dialog.Close>
                
                {showAddButton && onAddToCollection && (
                  <button
                    onClick={() => onAddToCollection(card)}
                    className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white flex items-center gap-2 transition-colors"
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
                    className="px-4 py-2 rounded-lg bg-background-tertiary border border-border hover:bg-card-hover text-foreground flex items-center gap-2 transition-colors"
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground-muted">{label}</p>
      <p className="text-foreground">{value}</p>
    </div>
  );
}
