"use client";

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDeck, addCardToDeck, removeCardFromDeck, updateDeckCard, DeckDetails } from '@/lib/api/decks';
import { searchCards } from '@/lib/api/cards';
import withAuth from '@/components/auth/withAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from 'use-debounce';
import { Search, Plus, Minus, ArrowLeft, BarChart3, Download } from 'lucide-react';
import Link from 'next/link';

function DeckDetailPage() {
  const params = useParams();
  const router = useRouter();
  const deckId = params.id as string;
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm] = useDebounce(searchTerm, 500);
  const [activeTab, setActiveTab] = useState<'mainboard' | 'sideboard'>('mainboard');
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: deck, isLoading: deckLoading, isError: deckError } = useQuery({
    queryKey: ['deck', deckId],
    queryFn: () => getDeck(deckId),
    enabled: !!deckId
  });

  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['deck-search', debouncedSearchTerm],
    queryFn: () => searchCards(debouncedSearchTerm),
    enabled: !!debouncedSearchTerm
  });

  const addCardMutation = useMutation({
    mutationFn: ({ cardId, isSideboard }: { cardId: string; isSideboard: boolean }) =>
      addCardToDeck(deckId, {
        card_id: cardId,
        quantity: 1,
        is_sideboard: isSideboard
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deck', deckId] });
      toast({
        title: "Card Added",
        description: "Card has been added to your deck.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Card",
        description: error.response?.data?.detail || "Could not add card to deck",
        variant: "destructive",
      });
    }
  });

  const updateCardMutation = useMutation({
    mutationFn: ({ cardId, quantity }: { cardId: string; quantity: number }) =>
      updateDeckCard(deckId, cardId, { quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deck', deckId] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Update Card",
        description: error.response?.data?.detail || "Could not update card quantity",
        variant: "destructive",
      });
    }
  });

  const removeCardMutation = useMutation({
    mutationFn: (cardId: string) => removeCardFromDeck(deckId, cardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deck', deckId] });
      toast({
        title: "Card Removed",
        description: "Card has been removed from your deck.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Remove Card",
        description: error.response?.data?.detail || "Could not remove card from deck",
        variant: "destructive",
      });
    }
  });

  const handleAddCard = (cardId: string) => {
    addCardMutation.mutate({ cardId, isSideboard: activeTab === 'sideboard' });
  };

  const handleUpdateQuantity = (cardId: string, quantity: number) => {
    if (quantity <= 0) {
      removeCardMutation.mutate(cardId);
    } else {
      updateCardMutation.mutate({ cardId, quantity });
    }
  };

  if (deckLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (deckError || !deck) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive mb-4">Failed to load deck. Please try again.</p>
        <Button onClick={() => router.push('/decks')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Decks
        </Button>
      </div>
    );
  }

  const currentCards = activeTab === 'mainboard' ? deck.cards.mainboard : deck.cards.sideboard;
  const totalCards = activeTab === 'mainboard' ? deck.card_count : deck.sideboard_count;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Link href="/decks">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{deck.name}</h1>
            <p className="text-muted-foreground capitalize">
              {deck.format} • {totalCards} cards
            </p>
          </div>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" size="sm">
            <BarChart3 className="h-4 w-4 mr-2" />
            Stats
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search cards to add..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Search Results */}
          {debouncedSearchTerm && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Search Results</CardTitle>
              </CardHeader>
              <CardContent>
                {searchLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                    {searchResults?.map((card) => (
                      <div key={card.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                        <img
                          src={card.image_uris?.small || '/placeholder-card.png'}
                          alt={card.name}
                          className="w-12 h-16 object-cover rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{card.name}</p>
                          <p className="text-xs text-muted-foreground">{card.mana_cost}</p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleAddCard(card.id)}
                          disabled={addCardMutation.isPending}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Deck Contents */}
          <Card>
            <CardHeader>
              <div className="flex space-x-1">
                <Button
                  variant={activeTab === 'mainboard' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab('mainboard')}
                >
                  Mainboard ({deck.card_count})
                </Button>
                <Button
                  variant={activeTab === 'sideboard' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab('sideboard')}
                >
                  Sideboard ({deck.sideboard_count})
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {currentCards.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No cards in {activeTab}. Search and add some cards!
                </div>
              ) : (
                <div className="space-y-2">
                  {currentCards.map((deckCard) => (
                    <div key={deckCard.card_id} className="flex items-center space-x-3 p-3 border rounded-lg">
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleUpdateQuantity(deckCard.card_id, deckCard.quantity - 1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-sm font-medium">
                          {deckCard.quantity}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleUpdateQuantity(deckCard.card_id, deckCard.quantity + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{deckCard.name}</p>
                        {deckCard.category && (
                          <p className="text-xs text-muted-foreground">{deckCard.category}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Deck Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Total Cards:</span>
                <span>{deck.stats.total_cards}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Average CMC:</span>
                <span>{deck.stats.average_cmc.toFixed(1)}</span>
              </div>
              {deck.stats.total_value > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Total Value:</span>
                  <span>${deck.stats.total_value.toFixed(2)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mana Curve */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Mana Curve</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(deck.stats.mana_curve).map(([cmc, count]) => (
                  <div key={cmc} className="flex items-center space-x-2">
                    <span className="w-4 text-xs">{cmc}</span>
                    <div className="flex-1 bg-secondary rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{
                          width: `${Math.max((count / Math.max(...Object.values(deck.stats.mana_curve))) * 100, 5)}%`
                        }}
                      />
                    </div>
                    <span className="w-6 text-xs text-right">{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Color Distribution */}
          {Object.keys(deck.stats.color_distribution).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Colors</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(deck.stats.color_distribution).map(([color, count]) => (
                    <div key={color} className="flex justify-between text-sm">
                      <span className="capitalize">{color}</span>
                      <span>{count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default withAuth(DeckDetailPage);