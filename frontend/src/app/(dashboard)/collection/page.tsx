'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { CardGrid } from '../../../components/cards/card-grid';
import { CardDetails } from '../../../components/cards/card-details';
import { useState } from 'react';
import type { Card, UserCard } from '../../../lib/types';
import { formatPrice } from '../../../lib/utils';
import { Library, TrendingUp, Star } from 'lucide-react';

export default function CollectionPage() {
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [selectedUserCard, setSelectedUserCard] = useState<UserCard | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const collectionQuery = useQuery({
    queryKey: ['collections', 'mine'],
    queryFn: api.collections.mine,
  });

  const statsQuery = useQuery({
    queryKey: ['collections', 'mine', 'stats'],
    queryFn: api.collections.stats,
  });

  const handleCardView = (card: Card) => {
    setSelectedCard(card);
    // Find the corresponding user card
    const userCard = collectionQuery.data?.items.find(uc => uc.card_id === card.id);
    setSelectedUserCard(userCard || null);
    setIsModalOpen(true);
  };

  if (collectionQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-3 text-text-secondary">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
            Loading your collection...
          </div>
        </div>
      </div>
    );
  }

  if (collectionQuery.error) {
    return (
      <div className="space-y-6">
        <div className="glass rounded-xl p-6 border-red-500/20 bg-red-500/5">
          <p className="text-red-400 text-center">
            Failed to load your collection. Please try again.
          </p>
        </div>
      </div>
    );
  }

  const collection = collectionQuery.data;
  const stats = statsQuery.data;
  const cards = collection?.items.map(userCard => userCard.card).filter(Boolean) as Card[] || [];
  const userCards = collection?.items || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass rounded-xl p-6">
        <h1 className="text-2xl font-bold text-text-primary mb-4">
          My Collection
        </h1>
        <p className="text-text-secondary">
          Track and manage your card collection
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="glass rounded-xl p-6 text-center">
            <div className="flex items-center justify-center mb-3">
              <Library className="text-primary" size={32} />
            </div>
            <h3 className="text-sm text-text-secondary mb-2">Total Cards</h3>
            <p className="text-3xl font-bold text-text-primary">
              {stats.total_cards?.toLocaleString() || 0}
            </p>
            <p className="text-xs text-text-muted mt-1">
              {stats.unique_cards} unique
            </p>
          </div>

          <div className="glass rounded-xl p-6 text-center">
            <div className="flex items-center justify-center mb-3">
              <TrendingUp className="text-green-500" size={32} />
            </div>
            <h3 className="text-sm text-text-secondary mb-2">Collection Value</h3>
            <p className="text-3xl font-bold text-text-primary">
              {stats.total_value ? formatPrice(stats.total_value.toString()) : '—'}
            </p>
            <p className="text-xs text-text-muted mt-1">Current market</p>
          </div>

          <div className="glass rounded-xl p-6 text-center">
            <div className="flex items-center justify-center mb-3">
              <Star className="text-card-rare" size={32} />
            </div>
            <h3 className="text-sm text-text-secondary mb-2">Sets Collected</h3>
            <p className="text-3xl font-bold text-text-primary">
              {stats.sets_collected || 0}
            </p>
            <p className="text-xs text-text-muted mt-1">Different sets</p>
          </div>
        </div>
      )}

      {/* Collection Grid */}
      {cards.length > 0 ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-text-primary">
              Your Cards ({cards.length})
            </h2>
            {/* TODO: Add sorting and filtering options */}
          </div>

          <CardGrid
            cards={cards}
            userCards={userCards}
            showQuantity
            onView={handleCardView}
          />
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="glass rounded-xl p-8 max-w-md mx-auto">
            <Library className="mx-auto mb-4 text-text-muted" size={48} />
            <h3 className="text-xl font-semibold text-text-primary mb-2">
              No cards yet
            </h3>
            <p className="text-text-secondary mb-4">
              Start building your collection by searching for cards and adding them to your collection.
            </p>
            <a
              href="/search"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 rounded-lg transition-colors"
            >
              Search Cards
            </a>
          </div>
        </div>
      )}

      {/* Card Details Modal */}
      <CardDetails
        card={selectedCard}
        userCard={selectedUserCard || undefined}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
      />
    </div>
  );
}