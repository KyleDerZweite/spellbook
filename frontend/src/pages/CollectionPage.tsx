import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { CardGrid } from '@/components/cards/CardGrid'
import { CardDetails } from '@/components/cards/CardDetails'
import { useState } from 'react'
import type { Card as CardType, UserCard } from '@/lib/types'
import { formatPrice } from '@/lib/utils'
import { Library, TrendingUp, Star, Loader2, Search, Package } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function CollectionPage() {
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null)
  const [selectedUserCard, setSelectedUserCard] = useState<UserCard | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const collectionQuery = useQuery({
    queryKey: ['collections', 'mine'],
    queryFn: api.collections.mine,
  })

  const statsQuery = useQuery({
    queryKey: ['collections', 'mine', 'stats'],
    queryFn: api.collections.stats,
  })

  const handleCardView = (card: CardType) => {
    setSelectedCard(card)
    const userCard = collectionQuery.data?.items.find(uc => uc.card_id === card.id)
    setSelectedUserCard(userCard || null)
    setIsModalOpen(true)
  }

  if (collectionQuery.isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading your collection...
        </div>
      </div>
    )
  }

  const isNoCollectionError = collectionQuery.error &&
    (collectionQuery.error as { response?: { status: number } })?.response?.status === 404

  if (collectionQuery.error && !isNoCollectionError) {
    return (
      <div className="space-y-6">
        <div className="bg-error/10 border border-error/20 rounded-xl p-6">
          <p className="text-error text-center">
            Failed to load your collection. Please try again.
          </p>
        </div>
      </div>
    )
  }

  const collection = collectionQuery.data
  const stats = statsQuery.data
  const cards = collection?.items.map(userCard => userCard.card).filter(Boolean) as CardType[] || []
  const userCards = collection?.items || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Collection</h1>
        <p className="text-muted-foreground mt-1">
          Track and manage your card collection
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={Package}
          label="Total Cards"
          value={stats?.total_cards?.toLocaleString() ?? '—'}
          subtext={stats?.unique_cards ? `${stats.unique_cards} unique` : undefined}
          loading={statsQuery.isLoading}
        />
        <StatCard
          icon={TrendingUp}
          label="Collection Value"
          value={stats?.total_value ? formatPrice(stats.total_value.toString()) : '—'}
          subtext="Current market"
          loading={statsQuery.isLoading}
          accent
        />
        <StatCard
          icon={Star}
          label="Sets Collected"
          value={stats?.sets_collected?.toString() ?? '—'}
          subtext="Different sets"
          loading={statsQuery.isLoading}
        />
      </div>

      {/* Collection Grid */}
      {cards.length > 0 ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-foreground">
              Your Cards ({cards.length})
            </h2>
          </div>

          <CardGrid
            cards={cards}
            userCards={userCards}
            showQuantity
            onView={handleCardView}
          />
        </div>
      ) : (
        <EmptyState />
      )}

      {/* Card Details Modal */}
      <CardDetails
        card={selectedCard}
        userCard={selectedUserCard || undefined}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
      />
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  loading,
  accent
}: {
  icon: React.ElementType
  label: string
  value: string
  subtext?: string
  loading: boolean
  accent?: boolean
}) {
  return (
    <Card className={`p-5 ${accent ? 'bg-gradient-to-br from-primary/5 to-transparent' : ''}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent ? 'bg-primary/15 border border-primary/20' : 'bg-secondary border border-border'}`}>
          <Icon className={`w-5 h-5 ${accent ? 'text-primary' : 'text-muted-foreground'}`} />
        </div>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      {loading ? (
        <div className="h-8 w-24 skeleton rounded" />
      ) : (
        <p className={`text-2xl font-bold ${accent ? 'text-primary' : 'text-foreground'}`}>
          {value}
        </p>
      )}
      {subtext && (
        <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
      )}
    </Card>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-16">
      <Card className="rounded-2xl p-8 max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4 shadow-glow">
          <Library className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">
          No cards yet
        </h3>
        <p className="text-muted-foreground mb-6">
          Start building your collection by searching for cards and adding them.
        </p>
        <Button asChild>
          <Link to="/search" className="inline-flex items-center gap-2">
            <Search className="w-4 h-4" />
            Search Cards
          </Link>
        </Button>
      </Card>
    </div>
  )
}
