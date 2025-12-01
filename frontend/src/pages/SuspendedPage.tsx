import { useLocation, useNavigate } from 'react-router-dom'
import { Ban, Mail, ArrowLeft } from 'lucide-react'
import { Card, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { SuspensionInfo } from '@/lib/types'

export function SuspendedPage() {
  const location = useLocation()
  const navigate = useNavigate()
  
  // Get suspension info from navigation state
  const suspensionInfo = location.state as SuspensionInfo | undefined
  
  const formatDate = (dateString?: string | null) => {
    if (!dateString) return null
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return null
    }
  }

  const suspendedAt = formatDate(suspensionInfo?.suspended_at)
  const contactEmail = suspensionInfo?.contact_email || 'admin@spellbook.local'

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <div className="p-6 text-center">
          <div className="flex justify-center mb-6">
            <div className="p-4 rounded-full bg-error/20">
              <Ban className="h-12 w-12 text-error" />
            </div>
          </div>
          
          <CardTitle className="text-2xl mb-2">Account Suspended</CardTitle>
          <CardDescription className="text-base">
            Your account has been suspended and you cannot access Spellbook at this time.
          </CardDescription>
        </div>

        <CardContent className="space-y-6 pb-6">
          {/* Suspension Details */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            {suspensionInfo?.suspension_reason && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Reason for Suspension</p>
                <p className="text-sm mt-1">{suspensionInfo.suspension_reason}</p>
              </div>
            )}
            
            {suspendedAt && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Suspended On</p>
                <p className="text-sm mt-1">{suspendedAt}</p>
              </div>
            )}

            {!suspensionInfo?.suspension_reason && !suspendedAt && (
              <p className="text-sm text-muted-foreground text-center">
                No additional details are available about your suspension.
              </p>
            )}
          </div>

          {/* Contact Info */}
          <div className="border border-border rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium">Need Help?</p>
                <p className="text-sm text-muted-foreground mt-1">
                  If you believe this suspension was made in error or would like to request 
                  a review, please contact the administrator.
                </p>
                <a 
                  href={`mailto:${contactEmail}?subject=Account Suspension Review Request`}
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline mt-3"
                >
                  <Mail className="h-4 w-4" />
                  {contactEmail}
                </a>
              </div>
            </div>
          </div>

          {/* Back to Login */}
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => navigate('/login')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Login
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
