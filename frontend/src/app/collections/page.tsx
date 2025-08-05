"use client";

import { useQuery } from '@tanstack/react-query';
import { CollectionCard } from '@/types/card';
import withAuth from '@/components/auth/withAuth';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/api/client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search as SearchIcon, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

async function getUserCollection(): Promise<CollectionCard[]> {
  const response = await apiClient.get('/collections/mine');
  return response.data.data || [];
}

function CollectionsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  
  const { data: collectionCards, isLoading, isError } = useQuery({
    queryKey: ['user-collection'],
    queryFn: getUserCollection
  });

  const filteredCards = collectionCards?.filter(item =>
    item.card.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const totalCards = collectionCards?.reduce((sum, item) => sum + item.quantity, 0) || 0;
  const uniqueCards = collectionCards?.length || 0;

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            My Collection
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            {totalCards} cards • {uniqueCards} unique
          </p>
        </div>
        <Button className="flex items-center space-x-2">
          <Plus className="h-4 w-4" />
          <span>Import Cards</span>
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search your collection..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Content */}
      {isError && (
        <div className="text-center py-8">
          <p className="text-destructive">Failed to load collection. Please try again.</p>
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && !isError && (
        <>
          {filteredCards.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-lg mb-4">
                {collectionCards?.length === 0 
                  ? "Your collection is empty" 
                  : "No cards match your search"}
              </p>
              {collectionCards?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Start by searching for cards and adding them to your collection
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filteredCards.map((item) => (
                <div key={item.id} className="relative group">
                  <img
                    src={item.card.image_uris?.normal || item.card.image_uris?.small || '/placeholder-card.png'}
                    alt={item.card.name}
                    className="w-full rounded-lg shadow-sm transition-transform duration-200 group-hover:scale-105"
                  />
                  <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
                    {item.quantity}x
                  </div>
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg flex items-center justify-center">
                    <div className="text-white text-center">
                      <p className="font-medium text-sm">{item.card.name}</p>
                      <p className="text-xs opacity-90">{item.quantity}x owned</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default withAuth(CollectionsPage);