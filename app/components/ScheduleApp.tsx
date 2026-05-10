"use client";

export default function ScheduleApp() {
  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      <header className="border-b border-neutral-300 bg-white px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Roseland Production Schedule
            </h1>
            <p className="text-sm text-neutral-500">
              Next migration shell — header and toolbar test.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-neutral-50">
              Library
            </button>
            <button className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-neutral-50">
              New
            </button>
            <button className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-neutral-50">
              Save
            </button>
            <button className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-neutral-50">
              Save As…
            </button>
            <button className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-neutral-50">
              Snapshot
            </button>
          </div>
        </div>
      </header>

      <main className="p-5">
        <section className="rounded-xl border border-neutral-300 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Schedule Workspace</h2>
              <p className="text-sm text-neutral-600">
                We will migrate the old HTML app into this component piece by piece.
              </p>
            </div>

            <div className="rounded-full border border-green-300 bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
              Synced
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
            <p>Next target: migrate schedule title, date, call time, weather, and grid layout.</p>
          </div>
        </section>
      </main>
    </div>
  );
}