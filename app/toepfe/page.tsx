'use client';

/**
 * Die Töpfe stehen jetzt auf der Startseite (`app/page.tsx`). Diese Adresse
 * bleibt nur, damit alte Lesezeichen und installierte Verknüpfungen nicht ins
 * Leere laufen — `/toepfe/detail` liegt weiter darunter.
 */

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function PotsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);
  return null;
}
