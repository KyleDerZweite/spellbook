import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CardGrid } from './CardGrid'
import { Loader2 } from 'lucide-react'
import type { Card } from '@/lib/types'

interface VersionSelectorProps {
  oracleId: string
  isOpen: boolean
  onClose: () => void
  onVersionSelect: (card: Card) => void
}

export function VersionSelector({
  oracleId,
  isOpen,
  onClose,
  onVersionSelect,
}: VersionSelectorProps) {
  const versionsQuery = useQuery({
    queryKey: ['cards', 'versions', oracleId],
    queryFn: () => api.cards.getVersions(oracleId),
    enabled: isOpen && Boolean(oracleId),
  })

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select a Version</DialogTitle>
        </DialogHeader>

        {versionsQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : versionsQuery.error ? (
          <div className="text-center py-8 text-error">
            Failed to load versions. Please try again.
          </div>
        ) : (
          <CardGrid
            cards={versionsQuery.data || []}
            onView={(card) => {
              onVersionSelect(card)
              onClose()
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
