import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Layers, Plus } from 'lucide-react'

export function DecksPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Decks</h1>
          <p className="text-muted-foreground mt-1">
            Build and manage your deck collection
          </p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Deck
        </Button>
      </div>

      {/* Empty State */}
      <Card className="text-center py-16">
        <CardContent>
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4 shadow-glow">
            <Layers className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold text-foreground mb-2">
            No decks yet
          </h3>
          <p className="text-muted-foreground mb-6">
            Create your first deck to start building!
          </p>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Create Deck
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
