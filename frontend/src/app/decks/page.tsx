"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDecks, createDeck, deleteDeck, Deck } from '@/lib/api/decks';
import withAuth from '@/components/auth/withAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Edit, FileText } from 'lucide-react';
import Link from 'next/link';

const FORMATS = [
  'standard',
  'modern',
  'legacy',
  'vintage',
  'commander',
  'pioneer',
  'historic',
  'pauper',
  'casual'
];

function DecksPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newDeck, setNewDeck] = useState({
    name: '',
    format: '',
    description: ''
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: decks, isLoading, isError } = useQuery({
    queryKey: ['decks'],
    queryFn: getDecks
  });

  const createDeckMutation = useMutation({
    mutationFn: createDeck,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      setIsCreateOpen(false);
      setNewDeck({ name: '', format: '', description: '' });
      toast({
        title: "Deck Created",
        description: "Your new deck has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Deck",
        description: error.response?.data?.detail || "Could not create deck",
        variant: "destructive",
      });
    }
  });

  const deleteDeckMutation = useMutation({
    mutationFn: deleteDeck,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      toast({
        title: "Deck Deleted",
        description: "Deck has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Delete Deck",
        description: error.response?.data?.detail || "Could not delete deck",
        variant: "destructive",
      });
    }
  });

  const handleCreateDeck = () => {
    if (!newDeck.name || !newDeck.format) {
      toast({
        title: "Missing Information",
        description: "Please enter a name and select a format",
        variant: "destructive",
      });
      return;
    }

    createDeckMutation.mutate(newDeck);
  };

  const handleDeleteDeck = (id: string) => {
    if (confirm('Are you sure you want to delete this deck?')) {
      deleteDeckMutation.mutate(id);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">My Decks</h1>
          <p className="text-muted-foreground mt-1">
            Build and manage your deck collection
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center space-x-2">
              <Plus className="h-4 w-4" />
              <span>New Deck</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Deck</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="deck-name">Deck Name</Label>
                <Input
                  id="deck-name"
                  value={newDeck.name}
                  onChange={(e) => setNewDeck({ ...newDeck, name: e.target.value })}
                  placeholder="Enter deck name"
                />
              </div>
              <div>
                <Label htmlFor="deck-format">Format</Label>
                <Select value={newDeck.format} onValueChange={(value) => setNewDeck({ ...newDeck, format: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMATS.map((format) => (
                      <SelectItem key={format} value={format}>
                        {format.charAt(0).toUpperCase() + format.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="deck-description">Description (Optional)</Label>
                <Input
                  id="deck-description"
                  value={newDeck.description}
                  onChange={(e) => setNewDeck({ ...newDeck, description: e.target.value })}
                  placeholder="Describe your deck"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateDeck} disabled={createDeckMutation.isPending}>
                  {createDeckMutation.isPending ? "Creating..." : "Create Deck"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Content */}
      {isError && (
        <div className="text-center py-8">
          <p className="text-destructive">Failed to load decks. Please try again.</p>
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && !isError && (
        <>
          {decks?.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-lg mb-4">
                You haven&apos;t created any decks yet
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                Start building your first deck to organize your favorite cards
              </p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Deck
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {decks?.map((deck) => (
                <Card key={deck.id} className="group hover:border-primary transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <CardTitle className="text-lg line-clamp-1">{deck.name}</CardTitle>
                        <CardDescription className="capitalize text-xs mt-1">
                          {deck.format}
                        </CardDescription>
                      </div>
                      <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleDeleteDeck(deck.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Cards:</span>
                        <span>{deck.card_count}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Sideboard:</span>
                        <span>{deck.sideboard_count}</span>
                      </div>
                      {deck.value > 0 && (
                        <div className="flex justify-between">
                          <span>Value:</span>
                          <span>${deck.value.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-4">
                      <Link href={`/decks/${deck.id}`}>
                        <Button className="w-full" size="sm">
                          <Edit className="h-3 w-3 mr-2" />
                          Edit Deck
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default withAuth(DecksPage);