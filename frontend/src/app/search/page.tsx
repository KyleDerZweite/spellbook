"use client";

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from 'use-debounce';
import { Card, SearchFilters } from '@/types/card';
import { searchCards } from '@/lib/api/cards';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Search as SearchIcon } from 'lucide-react';
import { AddToCollectionButton } from '@/components/cards/AddToCollectionButton';
import { SearchFilters as SearchFiltersComponent } from '@/components/cards/SearchFilters';
import { useAuthStore } from '@/lib/store/auth';

export default function SearchPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({});
  const [debouncedSearchTerm] = useDebounce(searchTerm, 500);
  const { isAuthenticated } = useAuthStore();

  const { data: results, isLoading, isError } = useQuery({
    queryKey: ['search', debouncedSearchTerm, filters],
    queryFn: () => searchCards(debouncedSearchTerm, filters),
    enabled: !!debouncedSearchTerm
  });

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight">Card Search</h1>
        <p className="text-muted-foreground mt-2">Find any card in the multiverse.</p>
      </div>
      
      <div className="relative mb-8">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input 
          placeholder="Search by name, type, or text..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full max-w-2xl pl-10 py-6 text-lg"
        />
      </div>

      <div className="flex gap-6">
        {/* Filters Sidebar */}
        <div className="hidden lg:block flex-shrink-0">
          <SearchFiltersComponent filters={filters} onFiltersChange={setFilters} />
        </div>

        {/* Results */}
        <div className="flex-1">
          {isError && <p className='text-center text-red-500 mb-4'>Failed to search cards. Please try again.</p>}
          
          {!debouncedSearchTerm && (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-lg">
                Enter a search term to find cards
              </p>
            </div>
          )}

          {debouncedSearchTerm && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {isLoading && Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="w-full h-[340px] rounded-xl" />)}
              {results?.map((card) => (
          <Dialog key={card.id}>
            <DialogTrigger asChild>
              <div className="cursor-pointer group relative">
                <img 
                  src={card.image_uris?.normal || card.image_uris?.small || '/placeholder-card.png'} 
                  alt={card.name} 
                  className="rounded-xl w-full h-auto object-cover transition-all duration-300 group-hover:scale-105 group-hover:shadow-2xl group-hover:shadow-primary/20"
                />
                {isAuthenticated && (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-xl flex items-center justify-center">
                    <div onClick={(e) => e.stopPropagation()}>
                      <AddToCollectionButton 
                        card={card} 
                        className="pointer-events-auto" 
                      />
                    </div>
                  </div>
                )}
              </div>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="text-2xl">{card.name}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="flex justify-center mb-4">
                  <img 
                    src={card.image_uris?.normal || card.image_uris?.small || '/placeholder-card.png'} 
                    alt={card.name}
                    className="max-w-[200px] rounded-lg"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="font-semibold">Type:</span>
                    <span>{card.type_line}</span>
                  </div>
                  {card.mana_cost && (
                    <div className="flex justify-between">
                      <span className="font-semibold">Mana Cost:</span>
                      <span>{card.mana_cost}</span>
                    </div>
                  )}
                  {card.rarity && (
                    <div className="flex justify-between">
                      <span className="font-semibold">Rarity:</span>
                      <span className="capitalize">{card.rarity}</span>
                    </div>
                  )}
                  {card.set?.name && (
                    <div className="flex justify-between">
                      <span className="font-semibold">Set:</span>
                      <span>{card.set.name}</span>
                    </div>
                  )}
                </div>
                {card.oracle_text && (
                  <>
                    <div className="border-t border-border my-2"></div>
                    <p className="text-sm text-muted-foreground italic">{card.oracle_text}</p>
                  </>
                )}
                {isAuthenticated && (
                  <div className="border-t border-border pt-4">
                    <AddToCollectionButton card={card} className="w-full" />
                  </div>
                )}
              </div>
            </DialogContent>
              </Dialog>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
