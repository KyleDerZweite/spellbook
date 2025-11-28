'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { CardGrid } from '../../../components/cards/card-grid';
import { CardDetails } from '../../../components/cards/card-details';
import { useState } from 'react';
import type { Card, UserCard } from '../../../lib/types';
import { formatPrice } from '../../../lib/utils';
import { Library, TrendingUp, Star, Loader2, Search, Package } from 'lucide-react';
import Link from 'next/link';

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
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex items-center gap-3 text-foreground-muted">
          <Loader2 className="w-5 h-5 spinner" />
          Loading your collection...
        </div>
      </div>
    );
  }

  // Handle error - but also check if it's a "no collection" scenario (404)
  // In that case, show empty state instead of error
  const isNoCollectionError = collectionQuery.error && 
    (collectionQuery.error as any)?.response?.status === 404;

  if (collectionQuery.error && !isNoCollectionError) {
    return (
      <div className="space-y-6">
        <div className="bg-error/10 border border-error/20 rounded-xl p-6">
          <p className="text-error text-center">
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
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Collection</h1>
        <p className="text-foreground-muted mt-1">
          Track and manage your card collection
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={Package}
          label="Total Cards"
          value={stats?.total_cards?.toLocaleString() ?? '—'}
          subtext={stats?.unique_cards ? `${stats.unique_cards} unique` : undefined}
          loading={statsQuery.isLoading}
        />
        <StatCard
          icon={TrendingUp}
          label="Collection Value"
          value={stats?.total_value ? formatPrice(stats.total_value.toString()) : '—'}
          subtext="Current market"
          loading={statsQuery.isLoading}
          accent
        />
        <StatCard
          icon={Star}
          label="Sets Collected"
          value={stats?.sets_collected?.toString() ?? '—'}
          subtext="Different sets"
          loading={statsQuery.isLoading}
        />
      </div>

      {/* Collection Grid */}
      {cards.length > 0 ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-foreground">
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
        <EmptyState />
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

// Stat Card Component
function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  subtext,
  loading,
  accent 
}: { 
  icon: React.ElementType;
  label: string;
  value: string;
  subtext?: string;
  loading: boolean;
  accent?: boolean;
}) {
  return (
    <div className={`relative bg-card border border-border rounded-xl p-5 overflow-hidden transition-all hover:border-accent/30 card-hover-glow ${accent ? 'bg-gradient-to-br from-accent/5 to-transparent' : ''}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent ? 'bg-accent/15 border border-accent/20' : 'bg-background-tertiary border border-border'}`}>
          <Icon className={`w-5 h-5 ${accent ? 'text-accent' : 'text-foreground-muted'}`} />
        </div>
        <p className="text-sm text-foreground-muted">{label}</p>
      </div>
      {loading ? (
        <div className="h-8 w-24 skeleton rounded" />
      ) : (
        <p className={`text-2xl font-bold ${accent ? 'text-gradient' : 'text-foreground'}`}>
          {value}
        </p>
      )}
      {subtext && (
        <p className="text-xs text-foreground-muted mt-1">{subtext}</p>
      )}
    </div>
  );
}

// Empty State Component
function EmptyState() {
  return (
    <div className="text-center py-16">
      <div className="bg-card border border-border rounded-2xl p-8 max-w-md mx-auto card-hover-glow">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-4 shadow-glow">
          <Library className="w-8 h-8 text-accent" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">
          No cards yet
        </h3>
        <p className="text-foreground-muted mb-6">
          Start building your collection by searching for cards and adding them.
        </p>
        <Link
          href="/search"
          className="inline-flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl transition-all shadow-glow hover:shadow-glow-lg"
        >
          <Search className="w-4 h-4" />
          Search Cards
        </Link>
      </div>
    </div>
  );
}
