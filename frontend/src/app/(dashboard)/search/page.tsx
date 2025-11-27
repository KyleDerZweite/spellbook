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
import { Search, Loader2, Filter, Layers } from 'lucide-react';

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
  const debouncedSetParams = useMemo(
    () => debounce((newParams: CardSearchParams) => {
      setParams(newParams);
    }, 300),
    []
  );

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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Card Search</h1>
        <p className="text-foreground-muted mt-1">
          Search the entire Magic: The Gathering database
        </p>
      </div>

      {/* Search Input */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-foreground-muted" />
            <input
              type="text"
              placeholder="Search by name, type, rules text..."
              className="w-full bg-background border border-border rounded-lg pl-10 pr-4 py-3 text-foreground placeholder:text-foreground-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setUseUniqueSearch(!useUniqueSearch)}
            className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              useUniqueSearch
                ? 'bg-accent text-white'
                : 'bg-background-tertiary text-foreground-muted hover:bg-card-hover border border-border'
            }`}
            title={useUniqueSearch ? 'Show all versions' : 'Show unique cards only'}
          >
            <Layers className="w-4 h-4" />
            {useUniqueSearch ? 'Unique' : 'All'}
          </button>
        </div>
      </div>

      {/* Advanced Filters */}
      <SearchFilters value={params} onChange={handleFiltersChange} />

      {/* Loading State */}
      {cardsQuery.isLoading && (
        <div className="text-center py-12">
          <div className="inline-flex items-center gap-3 text-foreground-muted">
            <Loader2 className="w-5 h-5 spinner" />
            Searching cards...
          </div>
        </div>
      )}

      {/* Error State */}
      {cardsQuery.error && (
        <div className="bg-error/10 border border-error/20 rounded-xl p-6">
          <p className="text-error text-center">
            Failed to search cards. Please try again.
          </p>
        </div>
      )}

      {/* Search Results */}
      {cardsQuery.data && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-foreground-muted">
              Found <span className="text-foreground font-medium">{cardsQuery.data.length}</span> results
              {params.q?.trim() && <span> for "<span className="text-accent">{params.q}</span>"</span>}
            </p>
            {addToCollectionMutation.isPending && (
              <div className="text-sm text-foreground-muted flex items-center gap-2">
                <Loader2 className="w-4 h-4 spinner" />
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
        <div className="text-center py-16">
          <div className="bg-card border border-border rounded-xl p-8 max-w-md mx-auto">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-accent" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Discover Cards
            </h3>
            <p className="text-foreground-muted">
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
