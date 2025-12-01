import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Card as CardType, CardSearchParams } from '@/lib/types'
import { CardGrid } from '@/components/cards/CardGrid'
import { CardDetails } from '@/components/cards/CardDetails'
import { SearchFilters } from '@/components/forms/SearchFilters'
import { VersionSelector } from '@/components/cards/VersionSelector'
import { debounce } from '@/lib/utils'
import { Search, Loader2, Layers } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

import { useToast } from '@/components/ui/use-toast'

export function SearchPage() {
  const [params, setParams] = useState<CardSearchParams>({
    q: '',
    per_page: 60,
    page: 1,
    rarity: [],
    colors: [],
    types: []
  })
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [versionSelectorOpen, setVersionSelectorOpen] = useState(false)
  const [selectedOracleId, setSelectedOracleId] = useState<string | null>(null)
  const [useUniqueSearch, setUseUniqueSearch] = useState(true)
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Debounced search to avoid too many API calls
  const debouncedSetParams = useMemo(
    () => debounce((newParams: CardSearchParams) => {
      setParams(newParams)
    }, 300),
    []
  )

  // Check if search should be enabled
  const searchEnabled = useMemo(() => {
    return Boolean(
      (params.q?.trim() && params.q.length >= 2) ||
      (params.rarity && params.rarity.length > 0) ||
      (params.colors && params.colors.length > 0) ||
      (params.types && params.types.length > 0)
    )
  }, [params])

  const cardsQuery = useQuery<{ data: CardType[]; meta?: { total: number; page: number; per_page: number; total_pages: number; has_next: boolean; has_prev: boolean } }>({
    queryKey: ['cards', useUniqueSearch ? 'search-unique' : 'search', params],
    queryFn: async () => {
      if (useUniqueSearch) {
        const response = await api.cards.searchUnique(params)
        return { data: response.data || [], meta: response.meta }
      }
      const data = await api.cards.search(params)
      return { data, meta: undefined }
    },
    enabled: searchEnabled,
    placeholderData: (previousData) => previousData,
  })

  const addToCollectionMutation = useMutation({
    mutationFn: (card: CardType) => api.collections.addCard({
      card_scryfall_id: card.scryfall_id,
      quantity: 1
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections', 'mine'] })
      toast({
        title: 'Card added',
        description: 'The card has been added to your collection.',
      })
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to add card to collection.',
        variant: 'destructive',
      })
    },
  })

  const handleSearch = (query: string) => {
    const newParams = {
      ...params,
      q: query,
      page: 1
    }
    if (query !== params.q) {
      debouncedSetParams(newParams)
    } else {
      setParams(newParams)
    }
  }

  const handleFiltersChange = (newParams: CardSearchParams) => {
    setParams(newParams)
  }

  const handleCardView = (card: CardType) => {
    setSelectedCard(card)
    setIsModalOpen(true)
  }

  const handleVersionsClick = (oracleId: string) => {
    setSelectedOracleId(oracleId)
    setVersionSelectorOpen(true)
  }

  const handleVersionSelect = (card: CardType) => {
    setSelectedCard(card)
    setIsModalOpen(true)
  }

  const handleAddToCollection = (card: CardType) => {
    addToCollectionMutation.mutate(card)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Card Search</h1>
        <p className="text-muted-foreground mt-1">
          Search the entire Magic: The Gathering database
        </p>
      </div>

      {/* Search Input */}
      <Card className="p-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by name, type, rules text..."
              className="pl-10"
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          <Button
            onClick={() => setUseUniqueSearch(!useUniqueSearch)}
            variant={useUniqueSearch ? 'default' : 'outline'}
            title={useUniqueSearch ? 'Show all versions' : 'Show unique cards only'}
          >
            <Layers className="w-4 h-4 mr-2" />
            {useUniqueSearch ? 'Unique' : 'All'}
          </Button>
        </div>
      </Card>

      {/* Advanced Filters */}
      <SearchFilters value={params} onChange={handleFiltersChange} />

      {/* Loading State */}
      {cardsQuery.isLoading && (
        <div className="text-center py-12">
          <div className="inline-flex items-center gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
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
      {cardsQuery.data && cardsQuery.data.data.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-muted-foreground">
              {cardsQuery.data.meta ? (
                <>
                  Showing <span className="text-foreground font-medium">{cardsQuery.data.data.length}</span> of{' '}
                  <span className="text-foreground font-medium">{cardsQuery.data.meta.total}</span> results
                </>
              ) : (
                <>Found <span className="text-foreground font-medium">{cardsQuery.data.data.length}</span> results</>
              )}
              {params.q?.trim() && <span> for "<span className="text-primary">{params.q}</span>"</span>}
            </p>
            {addToCollectionMutation.isPending && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Adding to collection...
              </div>
            )}
          </div>

          <CardGrid
            cards={cardsQuery.data.data}
            showAddButton
            showVersionCount={useUniqueSearch}
            onAdd={handleAddToCollection}
            onView={handleCardView}
            onVersionsClick={handleVersionsClick}
          />

          {/* Pagination Controls */}
          {cardsQuery.data.meta && cardsQuery.data.meta.total_pages > 1 && (
            <div className="flex justify-center items-center gap-2 pt-6">
              <Button
                variant="outline"
                onClick={() => setParams(p => ({ ...p, page: (p.page || 1) - 1 }))}
                disabled={!cardsQuery.data.meta.has_prev || cardsQuery.isFetching}
              >
                Previous
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(cardsQuery.data.meta.total_pages, 7) }, (_, i) => {
                  const totalPages = cardsQuery.data?.meta?.total_pages || 1
                  const currentPage = params.page || 1
                  let pageNum: number

                  if (totalPages <= 7) {
                    pageNum = i + 1
                  } else if (currentPage <= 4) {
                    pageNum = i + 1
                  } else if (currentPage >= totalPages - 3) {
                    pageNum = totalPages - 6 + i
                  } else {
                    pageNum = currentPage - 3 + i
                  }

                  return (
                    <Button
                      key={pageNum}
                      onClick={() => setParams(p => ({ ...p, page: pageNum }))}
                      disabled={cardsQuery.isFetching}
                      variant={pageNum === currentPage ? 'default' : 'outline'}
                      size="sm"
                      className="w-10 h-10"
                    >
                      {pageNum}
                    </Button>
                  )
                })}
              </div>
              <Button
                variant="outline"
                onClick={() => setParams(p => ({ ...p, page: (p.page || 1) + 1 }))}
                disabled={!cardsQuery.data.meta.has_next || cardsQuery.isFetching}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!searchEnabled && (
        <Card className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4 shadow-glow">
            <Search className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold text-foreground mb-2">
            Discover Cards
          </h3>
          <p className="text-muted-foreground mb-4">
            Search by name or use the filters above to find cards for your collection.
          </p>
        </Card>
      )}

      {/* Card Details Modal */}
      <CardDetails
        card={selectedCard}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onAddToCollection={handleAddToCollection}
        showAddButton
      />

      {/* Version Selector Modal */}
      <VersionSelector
        oracleId={selectedOracleId || ''}
        isOpen={versionSelectorOpen}
        onClose={() => setVersionSelectorOpen(false)}
        onVersionSelect={handleVersionSelect}
      />
    </div>
  )
}
