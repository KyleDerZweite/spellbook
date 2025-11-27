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
      <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-md ${className}`}>
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index} className="aspect-[5/7] rounded-lg bg-ui-bg animate-pulse" />
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="text-center py-xl">
        <div className="glass-panel p-lg max-w-md mx-auto">
          <p className="text-h3 text-text-primary mb-sm">No cards found</p>
          <p className="text-body text-text-secondary">
            Try adjusting your search terms or filters
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-md ${className}`}>
      {cards.map((card, index) => (
        <motion.div
          key={card.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ 
            duration: 0.4, 
            delay: index * 0.05,
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