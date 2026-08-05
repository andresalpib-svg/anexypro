import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      companyId: string;
      role: 'master' | 'admin_owner' | 'admin_staff' | 'seguridad' | 'condomino' | 'contador';
      staffPermissions: Record<string, boolean> | null;
      personId: string | null;
      isBoardMember: boolean;
      boardAreas: string[];
    } & DefaultSession['user'];
  }
}
