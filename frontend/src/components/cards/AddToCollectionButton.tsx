"use client";

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Plus, Check } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { Card } from '@/types/card';

interface AddToCollectionButtonProps {
  card: Card;
  className?: string;
}

export function AddToCollectionButton({ card, className }: AddToCollectionButtonProps) {
  const [isAdded, setIsAdded] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const addToCollectionMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/collections/mine/cards', {
        card_id: card.id,
        quantity: 1
      });
    },
    onSuccess: () => {
      setIsAdded(true);
      toast({
        title: "Added to Collection",
        description: `${card.name} has been added to your collection`,
      });
      // Invalidate collection query to refresh the data
      queryClient.invalidateQueries({ queryKey: ['user-collection'] });
      
      // Reset the button after 2 seconds
      setTimeout(() => setIsAdded(false), 2000);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Card",
        description: error.response?.data?.detail || "Could not add card to collection",
        variant: "destructive",
      });
    }
  });

  return (
    <Button
      onClick={() => addToCollectionMutation.mutate()}
      disabled={addToCollectionMutation.isPending || isAdded}
      size="sm"
      className={className}
    >
      {addToCollectionMutation.isPending ? (
        <>
          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2" />
          Adding...
        </>
      ) : isAdded ? (
        <>
          <Check className="h-3 w-3 mr-2" />
          Added!
        </>
      ) : (
        <>
          <Plus className="h-3 w-3 mr-2" />
          Add to Collection
        </>
      )}
    </Button>
  );
}