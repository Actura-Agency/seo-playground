'use client';

import { deleteScheduleAction } from './actions';

export default function DeleteScheduleButton({ scheduleId, name }: { scheduleId: number; name: string }) {
  return (
    <form
      action={deleteScheduleAction}
      onSubmit={(e) => {
        if (!confirm(`Delete the schedule "${name}"? Scans it already ran stay in history.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="schedule_id" value={scheduleId} />
      <button
        type="submit"
        className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 transition-colors"
      >
        Delete
      </button>
    </form>
  );
}
