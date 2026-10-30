// Runs once when the Next.js server starts. Starts the geo-grid automation scheduler, which only
// actually runs when the GRID_SCHEDULER=on environment variable is set (see grid-scheduler.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startGridScheduler } = await import('./app/dashboard/local-finder/grid-scheduler');
    startGridScheduler();
  }
}
