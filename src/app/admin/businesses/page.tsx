import {
  listAllBusinesses,
} from '@/lib/db/repositories/accounts';
import { platformBusinessUsage, subscriptionStats } from '@/lib/db/repositories/platform';
import { businessTypeLabel } from '@/lib/domain';
import { formatDate, formatNumber } from '@/lib/utils';
import { Badge, Card, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AdminBusinessesPage() {
  const businesses = listAllBusinesses(200);
  const usage = platformBusinessUsage(200);
  const subscriptions = subscriptionStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Businesses</h1>
        <p className="muted mt-1 text-sm">
          Every workspace on the platform with its plan, seat count and metered usage. Only aggregate figures are shown
          here.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="muted text-xs uppercase tracking-wide">Workspaces</p>
          <p className="mt-1 text-xl font-semibold">{formatNumber(businesses.length)}</p>
        </Card>
        <Card>
          <p className="muted text-xs uppercase tracking-wide">Active plans</p>
          <p className="mt-1 text-xl font-semibold">
            {subscriptions.filter((row) => ['ACTIVE', 'TRIALING'].includes(row.status)).reduce((sum, row) => sum + row.c, 0)}
          </p>
        </Card>
        <Card>
          <p className="muted text-xs uppercase tracking-wide">Paid workspaces</p>
          <p className="mt-1 text-xl font-semibold">
            {subscriptions
              .filter((row) => row.plan_code !== 'FREE' && ['ACTIVE', 'TRIALING'].includes(row.status))
              .reduce((sum, row) => sum + row.c, 0)}
          </p>
        </Card>
      </div>

      <Card className="p-0">
        <div className="border-b px-5 py-4">
          <h2 className="text-sm font-semibold">All workspaces</h2>
          <p className="muted text-xs">Sorted by signup date.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b">
                {[
                  'Business',
                  'Industry',
                  'Owner',
                  'Plan',
                  'Subscription',
                  'Members',
                  'Customers',
                  'AI runs',
                  'Storage',
                  'Joined',
                ].map((column) => (
                  <th key={column} className="table-head px-4 py-2">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {businesses.map((business) => {
                const row = usage.find((entry) => entry.id === business.id);
                return (
                  <tr key={business.id} className="table-row border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{business.name}</p>
                      <p className="muted text-xs">/{business.slug}</p>
                    </td>
                    <td className="px-4 py-3">{businessTypeLabel(business.type)}</td>
                    <td className="px-4 py-3">
                      <p>{business.owner_name}</p>
                      <p className="muted text-xs">{business.owner_email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="brand">{business.plan_code ?? 'FREE'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={business.subscription_status ?? 'TRIALING'} />
                    </td>
                    <td className="px-4 py-3">{business.member_count}</td>
                    <td className="px-4 py-3">{business.customer_count}</td>
                    <td className="px-4 py-3">{row?.ai_runs ?? 0}</td>
                    <td className="px-4 py-3">{((row?.storage_bytes ?? 0) / 1024 / 1024).toFixed(2)} MB</td>
                    <td className="muted px-4 py-3 text-xs">{formatDate(business.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
