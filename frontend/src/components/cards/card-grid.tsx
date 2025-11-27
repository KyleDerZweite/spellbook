'use client';

import { CardTile } from './card-tile';
import type { Card, UserCard } from '../../lib/types';
import { motion } from 'framer-motion';

interface CardGridProps {
  cards: Card[];
  userCards?: UserCard[];
  showAddButton?: boolean;
  showQuantity?: boolean;
  showVersionCount?: boolean;
  onAdd?: (card: Card) => void;
  onView?: (card: Card) => void;
  onVersionsClick?: (oracleId: string) => void;
  isLoading?: boolean;
  className?: string;
}

export function CardGrid({ 
  cards, 
  userCards = [],
  showAddButton = false,
  showQuantity = false,
  showVersionCount = false,
  onAdd, 
  onView,
  onVersionsClick,
  isLoading = false,
  className = ''
}: CardGridProps) {
  const userCardMap = userCards.reduce((acc, userCard) => {
    acc[userCard.card_id] = userCard;
    return acc;
  }, {} as Record<string, UserCard>);

  if (isLoading) {
    return (
      <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 ${className}`}>
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index} className="aspect-[5/7] rounded-xl skeleton" />
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="bg-card border border-border rounded-xl p-8 max-w-md mx-auto">
          <p className="text-lg font-medium text-foreground mb-2">No cards found</p>
          <p className="text-foreground-muted">
            Try adjusting your search terms or filters
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 ${className}`}>
      {cards.map((card, index) => (
        <motion.div
          key={card.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ 
            duration: 0.4, 
            delay: index * 0.03,
            type: "spring",
            stiffness: 200
          }}
        >
          <CardTile
            card={card}
            userCard={userCardMap[card.id]}
            showAddButton={showAddButton}
            showQuantity={showQuantity}
            showVersionCount={showVersionCount}
            onAdd={onAdd}
            onView={onView}
            onVersionsClick={onVersionsClick}
          />
        </motion.div>
      ))}
    </div>
  );
}
