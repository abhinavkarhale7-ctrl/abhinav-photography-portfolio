import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FlaskConical,
  ShieldCheck,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'

const RAZORPAY_DASHBOARD_URL = 'https://dashboard.razorpay.com/'

export interface PaymentsPanelProps {
  configured: boolean
  mode: 'live' | 'test' | 'unknown'
  maskedKeyId: string | null
  /** Percent, e.g. 1.5 for 1.5% */
  gatewayFeePercent: number
  storeEnabled: boolean
  /** Server key and browser key come from different Razorpay accounts. */
  keyMismatch: boolean
}

function InfoRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  )
}

export function PaymentsPanel({
  configured,
  mode,
  maskedKeyId,
  gatewayFeePercent,
  storeEnabled,
  keyMismatch,
}: PaymentsPanelProps) {
  const fee = Number(gatewayFeePercent.toFixed(2))

  return (
    <div className="space-y-6">
      {keyMismatch && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Key mismatch — checkout will fail</AlertTitle>
          <AlertDescription>
            <code>NEXT_PUBLIC_RAZORPAY_KEY_ID</code> and{' '}
            <code>RAZORPAY_KEY_ID</code> belong to different Razorpay accounts.
            Orders are created with the server key but the browser opens the
            other one, so the payment signature will never verify. Set both to
            the same key id.
          </AlertDescription>
        </Alert>
      )}

      {mode === 'test' && (
        <Alert variant="destructive" className="border-amber-500 bg-amber-50 text-amber-900">
          <FlaskConical className="h-4 w-4" />
          <AlertTitle>Test mode is active</AlertTitle>
          <AlertDescription className="text-amber-900">
            Razorpay is using test keys, so no real money can be collected.
            Replace <code>RAZORPAY_KEY_ID</code> and{' '}
            <code>RAZORPAY_KEY_SECRET</code> with live keys before sharing the
            store.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment gateway
            </CardTitle>
            <CardDescription>
              Razorpay collects the payment; this site never stores card or UPI
              details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              <InfoRow label="Connection">
                {configured ? (
                  <Badge className="gap-1 bg-green-600 text-white hover:bg-green-600">
                    <CheckCircle2 className="h-3 w-3" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Not configured
                  </Badge>
                )}
              </InfoRow>

              <InfoRow label="Mode">
                {mode === 'live' ? (
                  <Badge className="bg-green-600 text-white hover:bg-green-600">Live</Badge>
                ) : mode === 'test' ? (
                  <Badge className="bg-amber-500 text-white hover:bg-amber-500">Test</Badge>
                ) : (
                  <Badge variant="secondary">Unknown</Badge>
                )}
              </InfoRow>

              <InfoRow label="Key id">
                <span className="font-mono text-xs">
                  {maskedKeyId ?? 'Not set'}
                </span>
              </InfoRow>

              <InfoRow label="Currency">INR (₹)</InfoRow>

              <InfoRow label="Gateway fee">{fee}%</InfoRow>

              <InfoRow label="Storefront">
                {storeEnabled ? (
                  <Badge variant="secondary">Enabled</Badge>
                ) : (
                  <Badge variant="outline">Disabled</Badge>
                )}
              </InfoRow>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <a
                  href={RAZORPAY_DASHBOARD_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Razorpay dashboard
                </a>
              </Button>
              <Button asChild variant="ghost">
                <a href="/admin/store/costs">Edit gateway fee</a>
              </Button>
            </div>

            <p className="text-muted-foreground mt-3 text-xs">
              The fee above is a pricing input: set it to what Razorpay charges
              you and it is included in the prices shown in the store.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              How checkout works
            </CardTitle>
            <CardDescription>
              Payment methods are managed by Razorpay, not by this site.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="list-disc space-y-2 pl-4">
              <li>
                Customers pay in Razorpay&apos;s hosted checkout — UPI, cards and
                netbanking.
              </li>
              <li>
                The payment signature is verified on the server at{' '}
                <code className="text-xs">/api/razorpay/verify</code> before an
                order is marked <strong>processing</strong>.
              </li>
              <li>No webhook is required; verification happens on return.</li>
              <li>
                Which methods appear is controlled by your Razorpay account
                (Account &amp; Settings → Payment methods).
              </li>
            </ul>

            <p className="text-muted-foreground border-t pt-3 text-xs">
              This panel is read-only on purpose. Adding method toggles here
              would not enable anything in Razorpay — it would only hide methods
              at checkout — so the settings live where they actually apply.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
