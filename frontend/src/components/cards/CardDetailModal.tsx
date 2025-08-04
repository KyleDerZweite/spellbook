'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, Collection } from '@/types/card';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCollections, addCardToCollection } from '@/lib/api/collections';
import { useAuthStore } from '@/lib/store/auth';
import { useToast } from '@/hooks/use-toast';
import { Plus, Star, Eye } from 'lucide-react';

interface CardDetailModalProps {
  card: Card | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CardDetailModal({ card, isOpen, onClose }: CardDetailModalProps) {
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);
  const { isAuthenticated } = useAuthStore();
  const { toast } = useToast();

  const { data: collections = [] } = useQuery({
    queryKey: ['collections'],
    queryFn: getCollections,
    enabled: isAuthenticated
  });

  const handleAddToCollection = async () => {
    if (!card || !selectedCollection) return;

    setIsAdding(true);
    try {
      await addCardToCollection(selectedCollection, card.id);
      toast({
        title: 'Card added!',
        description: `${card.name} has been added to your collection.`,
      });
      onClose();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add card to collection.',
        variant: 'destructive',
      });
    } finally {
      setIsAdding(false);
    }
  };

  if (!card) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">{card.name}</DialogTitle>
        </DialogHeader>
        
        <div className="grid md:grid-cols-2 gap-6">
          {/* Card Image */}
          <div className="flex justify-center">
            <div className="relative max-w-sm">
              <img
                src={card.image_uris?.large || card.image_uris?.normal || '/placeholder-card.png'}
                alt={card.name}
                className="w-full h-auto rounded-lg shadow-lg"
              />
            </div>
          </div>

          {/* Card Details */}
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-3">Card Details</h3>
              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Mana Cost:</span>
                  <p className="font-mono text-sm">{card.mana_cost || 'None'}</p>
                </div>
                
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Type:</span>
                  <p>{card.type_line}</p>
                </div>
                
                {card.oracle_text && (
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Oracle Text:</span>
                    <p className="text-sm leading-relaxed">{card.oracle_text}</p>
                  </div>
                )}
                
                {(card.power || card.toughness) && (
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Power/Toughness:</span>
                    <p>{card.power}/{card.toughness}</p>
                  </div>
                )}
                
                <div className="flex gap-4">
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Rarity:</span>
                    <p className="capitalize">{card.rarity}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">CMC:</span>
                    <p>{card.cmc}</p>
                  </div>
                </div>
                
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Set:</span>
                  <p>{card.set?.name || card.set?.set_name} ({card.set?.code?.toUpperCase()})</p>
                </div>
                
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Artist:</span>
                  <p>{card.artist}</p>
                </div>
              </div>
            </div>

            {/* Add to Collection */}
            {isAuthenticated && collections.length > 0 && (
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-3">Add to Collection</h3>
                <div className="flex gap-3">
                  <Select value={selectedCollection} onValueChange={setSelectedCollection}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select collection" />
                    </SelectTrigger>
                    <SelectContent>
                      {collections.map((collection) => (
                        <SelectItem key={collection.id} value={collection.id}>
                          {collection.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleAddToCollection}
                    disabled={!selectedCollection || isAdding}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {isAdding ? 'Adding...' : 'Add'}
                  </Button>
                </div>
              </div>
            )}

            {!isAuthenticated && (
              <div className="border-t pt-6">
                <p className="text-muted-foreground">
                  <a href="/login" className="text-primary hover:underline">
                    Sign in
                  </a>{' '}
                  to add cards to your collection.
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}