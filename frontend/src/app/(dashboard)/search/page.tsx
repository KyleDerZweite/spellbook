'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import type { Card, CardSearchParams } from '../../../lib/types';
import { CardGrid } from '../../../components/cards/card-grid';
import { CardDetails } from '../../../components/cards/card-details';
import { SearchFilters } from '../../../components/forms/search-filters';
import { VersionSelector } from '../../../components/cards/version-selector';
import { debounce } from '../../../lib/utils';

export default function SearchPage() {
  const [params, setParams] = useState<CardSearchParams>({ 
    q: '', 
    per_page: 24, 
    page: 1,
    rarity: [],
    colors: [],
    types: []
  });
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [versionSelectorOpen, setVersionSelectorOpen] = useState(false);
  const [selectedOracleId, setSelectedOracleId] = useState<string | null>(null);
  const [useUniqueSearch, setUseUniqueSearch] = useState(true);
  const queryClient = useQueryClient();

  // Debounced search to avoid too many API calls
  const debouncedSetParams = debounce((newParams: CardSearchParams) => {
    setParams(newParams);
  }, 300);

  // Check if search should be enabled
  const searchEnabled = useMemo(() => {
    return Boolean(
      (params.q?.trim() && params.q.length >= 2) ||
      (params.rarity && params.rarity.length > 0) ||
      (params.colors && params.colors.length > 0) ||
      (params.types && params.types.length > 0)
    );
  }, [params]);

  const cardsQuery = useQuery({
    queryKey: ['cards', useUniqueSearch ? 'search-unique' : 'search', params],
    queryFn: () => useUniqueSearch ? api.cards.searchUnique(params) : api.cards.search(params),
    enabled: searchEnabled,
    placeholderData: (previousData) => previousData,
    select: (data) => useUniqueSearch ? data.data : data,
  });

  const addToCollectionMutation = useMutation({
    mutationFn: (card: Card) => api.collections.addCard({ 
      card_id: card.id, 
      quantity: 1 
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections', 'mine'] });
    },
    onError: (error) => {
      console.error('Failed to add card to collection:', error);
    },
  });

  const handleSearch = (query: string) => {
    const newParams = { 
      ...params, 
      q: query, 
      page: 1 
    };
    // Only debounce text search, not filter changes
    if (query !== params.q) {
      debouncedSetParams(newParams);
    } else {
      setParams(newParams);
    }
  };

  const handleFiltersChange = (newParams: CardSearchParams) => {
    setParams(newParams);
  };

  const handleCardView = (card: Card) => {
    setSelectedCard(card);
    setIsModalOpen(true);
  };
  
  const handleVersionsClick = (oracleId: string) => {
    setSelectedOracleId(oracleId);
    setVersionSelectorOpen(true);
  };
  
  const handleVersionSelect = (card: Card) => {
    setSelectedCard(card);
    setIsModalOpen(true);
  };

  const handleAddToCollection = (card: Card) => {
    addToCollectionMutation.mutate(card);
  };

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="elevated p-4 hover:accent-border transition-all duration-300">
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search by name, type, rules text..."
            className="flex-1 bg-surface-variant border border-border rounded-md px-3 py-2 focus:border-primary focus:outline-none transition-colors"
            onChange={(e) => handleSearch(e.target.value)}
          />
          <button
            onClick={() => setUseUniqueSearch(!useUniqueSearch)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${useUniqueSearch
              ? 'bg-primary text-white'
              : 'bg-surface-variant text-text-secondary hover:bg-surface-variant-hover'
            }`}
            title={useUniqueSearch ? 'Show all versions' : 'Show unique cards only'}
          >
            {useUniqueSearch ? 'Unique' : 'All'}
          </button>
        </div>
      </div>

      {/* Advanced Filters */}
      <SearchFilters value={params} onChange={handleFiltersChange} />

      {/* Loading State */}
      {cardsQuery.isLoading && (
        <div className="text-center py-8">
          <div className="inline-flex items-center gap-2 text-text-secondary">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
            Searching cards...
          </div>
        </div>
      )}

      {/* Error State */}
      {cardsQuery.error && (
        <div className="elevated p-6 border-red-500/20 bg-red-500/5">
          <p className="text-red-400 text-center">
            Failed to search cards. Please try again.
          </p>
        </div>
      )}

      {/* Search Results */}
      {cardsQuery.data && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-text-secondary">
              Found {cardsQuery.data.length} results
              {params.q?.trim() && ` for "${params.q}"`}
            </p>
            {addToCollectionMutation.isPending && (
              <div className="text-sm text-text-muted flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                Adding to collection...
              </div>
            )}
          </div>

          <CardGrid
            cards={cardsQuery.data}
            showAddButton
            showVersionCount={useUniqueSearch}
            onAdd={handleAddToCollection}
            onView={handleCardView}
            onVersionsClick={handleVersionsClick}
          />
        </div>
      )}

      {/* Empty state */}
      {!searchEnabled && (
        <div className="text-center py-12">
          <div className="elevated p-8 max-w-md mx-auto">
            <h3 className="text-xl font-semibold text-text-primary mb-2">
              Discover Cards
            </h3>
            <p className="text-text-secondary">
              Search by name or use the filters above to find cards for your collection.
            </p>
          </div>
        </div>
      )}

      {/* Card Details Modal */}
      <CardDetails
        card={selectedCard}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onAddToCollection={handleAddToCollection}
        showAddButton
        layoutIdPrefix="search-card"
      />
      
      {/* Version Selector Modal */}
      <VersionSelector
        oracleId={selectedOracleId || ''}
        isOpen={versionSelectorOpen}
        onClose={() => setVersionSelectorOpen(false)}
        onVersionSelect={handleVersionSelect}
      />
    </div>
  );
}