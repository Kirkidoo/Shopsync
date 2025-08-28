'use client';

import { useState, useEffect } from 'react';

export default function Footer() {
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  return (
    <footer className="mt-8 text-center text-sm text-muted-foreground">
      {year ? `© ${year} ShopSync Auditor. All rights reserved.` : <div className="h-5" />}
    </footer>
  );
}
