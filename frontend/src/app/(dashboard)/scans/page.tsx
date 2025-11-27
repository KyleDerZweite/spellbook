'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Camera, 
  Check, 
  X, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp,
  Clock,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';

interface ScanBatch {
  id: string;
  status: string;
  total_scans: number;
  completed_scans: number;
  failed_scans: number;
  created_at: string;
  completed_at?: string;
}

interface ScanResult {
  id: string;
  batch_id: string;
  status: string;
  image_url?: string;
  thumbnail_url?: string;
  ocr_text?: string;
  ocr_confidence?: number;
  extracted_data?: {
    card_name?: string;
    type_line?: string;
    set_code?: string;
  };
  matched_card_id?: string;
  match_candidates?: MatchCandidate[];
  match_confidence?: number;
  user_confirmed?: boolean;
  created_at: string;
}

interface MatchCandidate {
  scryfall_id: string;
  name: string;
  set_name: string;
  set_code: string;
  collector_number?: string;
  image_url?: string;
  confidence: number;
  prices?: { usd?: string };
}

export default function ScansPage() {
  const queryClient = useQueryClient();
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);

  // Fetch scan batches
  const { data: batches, isLoading: batchesLoading, refetch: refetchBatches } = useQuery({
    queryKey: ['scan-batches'],
    queryFn: async () => {
      const response = await api.scan.getBatches();
      return response.batches as ScanBatch[];
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Fetch pending scans
  const { data: pendingScans, isLoading: scansLoading } = useQuery({
    queryKey: ['pending-scans'],
    queryFn: async () => {
      const response = await api.scan.getPendingScans();
      return response.scans as ScanResult[];
    },
    refetchInterval: 5000,
  });

  // Confirm scan mutation
  const confirmMutation = useMutation({
    mutationFn: async ({ scanId, cardId, quantity = 1 }: { scanId: string; cardId: string; quantity?: number }) => {
      await api.scan.confirmScan(scanId, {
        confirmed_card_id: cardId,
        quantity,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-scans'] });
      queryClient.invalidateQueries({ queryKey: ['scan-batches'] });
    },
  });

  // Reject scan mutation
  const rejectMutation = useMutation({
    mutationFn: async (scanId: string) => {
      await api.scan.rejectScan(scanId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-scans'] });
      queryClient.invalidateQueries({ queryKey: ['scan-batches'] });
    },
  });

  // Confirm all scans in batch
  const confirmBatchMutation = useMutation({
    mutationFn: async (batchId: string) => {
      await api.scan.confirmBatch(batchId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-scans'] });
      queryClient.invalidateQueries({ queryKey: ['scan-batches'] });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-500">Completed</Badge>;
      case 'processing':
        return <Badge variant="secondary">Processing</Badge>;
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      case 'pending_review':
        return <Badge variant="destructive">Needs Review</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-600';
    if (confidence >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (batchesLoading || scansLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const pendingReviewScans = pendingScans?.filter(s => s.status === 'pending_review') || [];
  const processingScans = pendingScans?.filter(s => s.status === 'processing') || [];

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Card Scans</h1>
          <p className="text-muted-foreground">
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
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Camera className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{pendingScans?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Pending Scans</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <AlertCircle className="w-8 h-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{pendingReviewScans.length}</p>
                <p className="text-sm text-muted-foreground">Needs Review</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Clock className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{processingScans.length}</p>
                <p className="text-sm text-muted-foreground">Processing</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{batches?.filter(b => b.status === 'completed').length || 0}</p>
                <p className="text-sm text-muted-foreground">Completed Batches</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Review Section */}
      {pendingReviewScans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
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
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50"
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
                            e.stopPropagation();
                            confirmBatchMutation.mutate(batch.id);
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

                  {/* Progress bar */}
                  <div className="px-4 pb-2">
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{
                          width: `${(batch.completed_scans / batch.total_scans) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  {expandedBatch === batch.id && (
                    <BatchScansDetail batchId={batch.id} />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No scan batches yet</h3>
              <p className="text-muted-foreground">
                Use the mobile app to scan cards and they will appear here for review
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScanReviewCard({
  scan,
  onConfirm,
  onReject,
  isConfirming,
  isRejecting,
}: {
  scan: ScanResult;
  onConfirm: (cardId: string) => void;
  onReject: () => void;
  isConfirming: boolean;
  isRejecting: boolean;
}) {
  const [selectedCandidate, setSelectedCandidate] = useState(0);
  const candidates = scan.match_candidates || [];
  const topCandidate = candidates[selectedCandidate];

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex gap-4">
          {/* Scanned image */}
          <div className="w-24 h-32 bg-muted rounded overflow-hidden flex-shrink-0">
            {scan.thumbnail_url ? (
              <img
                src={scan.thumbnail_url}
                alt="Scanned card"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Camera className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Card info */}
          <div className="flex-1 min-w-0">
            {topCandidate ? (
              <>
                <h4 className="font-medium truncate">{topCandidate.name}</h4>
                <p className="text-sm text-muted-foreground">
                  {topCandidate.set_name} ({topCandidate.set_code.toUpperCase()})
                </p>
                <p className={`text-sm font-medium ${
                  scan.match_confidence 
                    ? (scan.match_confidence >= 0.9 ? 'text-green-600' : 
                       scan.match_confidence >= 0.7 ? 'text-yellow-600' : 'text-red-600')
                    : 'text-muted-foreground'
                }`}>
                  {scan.match_confidence 
                    ? `${Math.round(scan.match_confidence * 100)}% match`
                    : 'Unknown confidence'
                  }
                </p>
                {topCandidate.prices?.usd && (
                  <p className="text-sm text-green-600">${topCandidate.prices.usd}</p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">No match found</p>
            )}

            {/* Alternative candidates */}
            {candidates.length > 1 && (
              <div className="mt-2 flex gap-1">
                {candidates.slice(0, 3).map((c, i) => (
                  <button
                    key={c.scryfall_id}
                    onClick={() => setSelectedCandidate(i)}
                    className={`text-xs px-2 py-1 rounded ${
                      i === selectedCandidate
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    {Math.round(c.confidence * 100)}%
                  </button>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={onReject}
                disabled={isRejecting}
              >
                <X className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                onClick={() => topCandidate && onConfirm(topCandidate.scryfall_id)}
                disabled={!topCandidate || isConfirming}
              >
                <Check className="w-4 h-4 mr-1" />
                Confirm
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BatchScansDetail({ batchId }: { batchId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['batch-scans', batchId],
    queryFn: async () => {
      const response = await api.scan.getBatchScans(batchId);
      return response;
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 border-t">
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const scans = data?.scans || [];

  return (
    <div className="p-4 border-t bg-muted/30">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {scans.map((scan: ScanResult) => (
          <div
            key={scan.id}
            className="aspect-[3/4] bg-muted rounded overflow-hidden relative group"
          >
            {scan.thumbnail_url ? (
              <img
                src={scan.thumbnail_url}
                alt="Card"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Camera className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-xs text-center px-1">
                {scan.extracted_data?.card_name || 'Unknown'}
              </span>
            </div>
            <div className="absolute top-1 right-1">
              {scan.status === 'completed' && (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              )}
              {scan.status === 'processing' && (
                <Clock className="w-4 h-4 text-blue-500" />
              )}
              {scan.status === 'failed' && (
                <AlertCircle className="w-4 h-4 text-red-500" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
