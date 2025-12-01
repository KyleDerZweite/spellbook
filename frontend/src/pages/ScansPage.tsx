import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { ScanBatch, ScanResult } from '@/lib/types'
import {
  Camera,
  Check,
  X,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2
} from 'lucide-react'

export function ScansPage() {
  const queryClient = useQueryClient()
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null)

  const { data: batches, isLoading: batchesLoading, refetch: refetchBatches } = useQuery({
    queryKey: ['scan-batches'],
    queryFn: async () => {
      const response = await api.scan.getBatches()
      return response.batches as ScanBatch[]
    },
    refetchInterval: 10000,
  })

  const { data: pendingScans, isLoading: scansLoading } = useQuery({
    queryKey: ['pending-scans'],
    queryFn: async () => {
      const response = await api.scan.getPendingScans()
      return response.scans as ScanResult[]
    },
    refetchInterval: 5000,
  })

  const confirmMutation = useMutation({
    mutationFn: async ({ scanId, cardId, quantity = 1 }: { scanId: string; cardId: string; quantity?: number }) => {
      await api.scan.confirmScan(scanId, {
        confirmed_card_id: cardId,
        quantity,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-scans'] })
      queryClient.invalidateQueries({ queryKey: ['scan-batches'] })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: async (scanId: string) => {
      await api.scan.rejectScan(scanId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-scans'] })
      queryClient.invalidateQueries({ queryKey: ['scan-batches'] })
    },
  })

  const confirmBatchMutation = useMutation({
    mutationFn: async (batchId: string) => {
      await api.scan.confirmBatch(batchId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-scans'] })
      queryClient.invalidateQueries({ queryKey: ['scan-batches'] })
    },
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success">Completed</Badge>
      case 'processing':
        return <Badge variant="secondary">Processing</Badge>
      case 'pending':
        return <Badge variant="outline">Pending</Badge>
      case 'pending_review':
        return <Badge variant="destructive">Needs Review</Badge>
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  if (batchesLoading || scansLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    )
  }

  const pendingReviewScans = pendingScans?.filter(s => s.status === 'pending_review') || []
  const processingScans = pendingScans?.filter(s => s.status === 'processing') || []

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Card Scans</h1>
          <p className="text-muted-foreground mt-1">
            Review and confirm scanned cards from your mobile app
          </p>
        </div>
        <Button onClick={() => refetchBatches()} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-full bg-primary/20">
              <Camera className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pendingScans?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Pending Scans</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-full bg-warning/20">
              <AlertCircle className="w-6 h-6 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pendingReviewScans.length}</p>
              <p className="text-sm text-muted-foreground">Needs Review</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-full bg-primary/20">
              <Clock className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{processingScans.length}</p>
              <p className="text-sm text-muted-foreground">Processing</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-full bg-success/20">
              <CheckCircle2 className="w-6 h-6 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{batches?.filter(b => b.status === 'completed').length || 0}</p>
              <p className="text-sm text-muted-foreground">Completed Batches</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Pending Review Section */}
      {pendingReviewScans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-warning" />
              Cards Needing Review ({pendingReviewScans.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingReviewScans.map((scan) => (
                <ScanReviewCard
                  key={scan.id}
                  scan={scan}
                  onConfirm={(cardId) => confirmMutation.mutate({ scanId: scan.id, cardId })}
                  onReject={() => rejectMutation.mutate(scan.id)}
                  isConfirming={confirmMutation.isPending}
                  isRejecting={rejectMutation.isPending}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Batches */}
      <Card>
        <CardHeader>
          <CardTitle>Scan Batches</CardTitle>
        </CardHeader>
        <CardContent>
          {batches && batches.length > 0 ? (
            <div className="space-y-4">
              {batches.map((batch) => (
                <div key={batch.id} className="border rounded-lg">
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-secondary/50 transition-colors"
                    onClick={() => setExpandedBatch(expandedBatch === batch.id ? null : batch.id)}
                  >
                    <div className="flex items-center gap-4">
                      {getStatusBadge(batch.status)}
                      <div>
                        <p className="font-medium">
                          Batch from {formatDate(batch.created_at)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {batch.completed_scans}/{batch.total_scans} processed
                          {batch.failed_scans > 0 && ` • ${batch.failed_scans} failed`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {batch.status === 'pending_review' && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            confirmBatchMutation.mutate(batch.id)
                          }}
                          disabled={confirmBatchMutation.isPending}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Confirm All
                        </Button>
                      )}
                      {expandedBatch === batch.id ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No scan batches yet</h3>
              <p className="text-muted-foreground">
                Use the Spellbook mobile app to scan your cards
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface ScanReviewCardProps {
  scan: ScanResult
  onConfirm: (cardId: string) => void
  onReject: () => void
  isConfirming: boolean
  isRejecting: boolean
}

function ScanReviewCard({ scan, onConfirm, onReject, isConfirming, isRejecting }: ScanReviewCardProps) {
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(
    scan.match_candidates?.[0]?.scryfall_id || null
  )

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-success'
    if (confidence >= 0.7) return 'text-warning'
    return 'text-error'
  }

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-[4/3]">
        {scan.thumbnail_url ? (
          <img
            src={scan.thumbnail_url}
            alt="Scanned card"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center">
            <Camera className="w-8 h-8 text-muted-foreground" />
          </div>
        )}
      </div>
      <CardContent className="p-4 space-y-4">
        {scan.extracted_data?.card_name && (
          <div>
            <p className="font-medium">{scan.extracted_data.card_name}</p>
            {scan.extracted_data.set_code && (
              <p className="text-sm text-muted-foreground">
                {scan.extracted_data.set_code.toUpperCase()}
              </p>
            )}
          </div>
        )}

        {scan.match_candidates && scan.match_candidates.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Possible matches:</p>
            <div className="space-y-1">
              {scan.match_candidates.slice(0, 3).map((candidate) => (
                <button
                  key={candidate.scryfall_id}
                  onClick={() => setSelectedCandidate(candidate.scryfall_id)}
                  className={`w-full text-left p-2 rounded border transition-colors ${
                    selectedCandidate === candidate.scryfall_id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <p className="text-sm font-medium">{candidate.name}</p>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{candidate.set_name}</span>
                    <span className={getConfidenceColor(candidate.confidence)}>
                      {(candidate.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => selectedCandidate && onConfirm(selectedCandidate)}
            disabled={!selectedCandidate || isConfirming}
          >
            {isConfirming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4 mr-1" />
                Confirm
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={onReject}
            disabled={isRejecting}
          >
            {isRejecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <X className="w-4 h-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
