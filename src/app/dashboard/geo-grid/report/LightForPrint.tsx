'use client';

import { useEffect } from 'react';

/**
 * Reports always print light. The dark theme (a `dark` class on <html>) restyles white cards and
 * dark text, so it is removed for the print (Save as PDF button or Ctrl+P) and put back after.
 */
export default function LightForPrint() {
  useEffect(() => {
    const root = document.documentElement;
    let wasDark = false;
    const before = () => {
      wasDark = root.classList.contains('dark');
      root.classList.remove('dark');
    };
    const after = () => {
      if (wasDark) root.classList.add('dark');
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
  return null;
}
