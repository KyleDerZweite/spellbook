import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatPrice } from '@/lib/utils'
import { Library, TrendingUp, Star, Search, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function DashboardPage() {
  const { user } = useAuth()

  const statsQuery = useQuery({
    queryKey: ['collections', 'mine', 'stats'],
    queryFn: api.collections.stats,
  })

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">
          Welcome back, {user?.username}!
        </h1>
        <p className="text-muted-foreground mt-2">
          Here's an overview of your card collection
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          icon={Library}
          title="Total Cards"
          value={statsQuery.data?.total_cards?.toLocaleString() ?? '—'}
          subtitle={statsQuery.data?.unique_cards ? `${statsQuery.data.unique_cards} unique` : undefined}
          isLoading={statsQuery.isLoading}
        />
        <StatCard
          icon={TrendingUp}
          title="Collection Value"
          value={statsQuery.data?.total_value ? formatPrice(statsQuery.data.total_value.toString()) : '—'}
          subtitle="Current market value"
          isLoading={statsQuery.isLoading}
          accent
        />
        <StatCard
          icon={Star}
          title="Sets Collected"
          value={statsQuery.data?.sets_collected?.toString() ?? '—'}
          subtitle="Different sets"
          isLoading={statsQuery.isLoading}
        />
      </div>

      {/* Quick Actions */}
      <Card className="p-6">
        <CardHeader className="p-0 pb-4">
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex flex-wrap gap-4">
          <Button asChild>
            <Link to="/search" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Search Cards
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/collection">View Collection</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/scans">Scan Cards</Link>
          </Button>
        </CardContent>
      </Card>

      {/* Rarity Breakdown */}
      {statsQuery.data?.rarity_breakdown && Object.keys(statsQuery.data.rarity_breakdown).length > 0 && (
        <Card className="p-6">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-lg">Rarity Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(statsQuery.data.rarity_breakdown).map(([rarity, count]) => (
                <div key={rarity} className="text-center p-4 bg-secondary/50 rounded-lg">
                  <p className={`text-2xl font-bold ${getRarityColor(rarity)}`}>
                    {count}
                  </p>
                  <p className="text-sm text-muted-foreground capitalize">{rarity}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatCard({ 
  icon: Icon, 
  title, 
  value, 
  subtitle,
  isLoading,
  accent = false
}: {
  icon: React.ElementType
  title: string
  value: string
  subtitle?: string
  isLoading: boolean
  accent?: boolean
}) {
  return (
    <Card className={`p-6 ${accent ? 'bg-gradient-to-br from-primary/10 to-transparent' : ''}`}>
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-xl ${accent ? 'bg-primary/20' : 'bg-secondary'}`}>
          <Icon className={`h-6 w-6 ${accent ? 'text-primary' : 'text-muted-foreground'}`} />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <p className={`text-2xl font-bold ${accent ? 'text-primary' : 'text-foreground'}`}>
              {value}
            </p>
          )}
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
    </Card>
  )
}

function getRarityColor(rarity: string): string {
  switch (rarity.toLowerCase()) {
    case 'mythic': return 'text-rarity-mythic'
    case 'rare': return 'text-rarity-rare'
    case 'uncommon': return 'text-rarity-uncommon'
    default: return 'text-rarity-common'
  }
}
