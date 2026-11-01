'use client';

/** Opens the browser's print window, where "Save as PDF" is one of the destinations. */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="px-4 py-2 bg-slate-900 dark:bg-white dark:text-slate-900 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-blue-600 transition-colors whitespace-nowrap"
    >
      Save as PDF
    </button>
  );
}
