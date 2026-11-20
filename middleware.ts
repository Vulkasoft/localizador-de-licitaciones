import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: { signIn: '/login' },
});

export const config = {
  matcher: ['/dashboard/:path*', '/tenders/:path*', '/buyers/:path*', '/settings/:path*', '/favorites/:path*', '/profile/:path*', '/competidores/:path*', '/busquedas-guardadas/:path*', '/documentos/:path*', '/papelera/:path*', '/budgets/:path*', '/alarms/:path*', '/notes/:path*', '/calendario/:path*', '/contasimple/:path*'],
};
