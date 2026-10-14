'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui';

export default function LogoutPage() {
  useEffect(() => {
    (async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    })();
  }, []);

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <Card className="w-full max-w-sm text-center">
        <p className="text-sm font-semibold">Signing you out…</p>
        <p className="muted mt-2 text-sm">
          Your session is being ended securely. If nothing happens,{' '}
          <Link href="/login" className="font-semibold text-brand-600 hover:underline">
            go to sign in
          </Link>
          .
        </p>
      </Card>
    </main>
  );
}
