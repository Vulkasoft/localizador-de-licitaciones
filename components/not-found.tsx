import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export function NotFound({ message = 'El elemento solicitado no fue encontrado' }: { message?: string }) {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white">404</h1>
        <p className="text-slate-400 mt-2">{message}</p>
        <div className="mt-6">
          <Link href="/budgets">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
