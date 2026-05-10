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
              Next migration shell — schedule header fields.
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
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Schedule Workspace</h2>
              <p className="text-sm text-neutral-600">
                Basic schedule metadata is now moving into the Next app.
              </p>
            </div>

            <div className="rounded-full border border-green-300 bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
              Synced
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Schedule Name
              </span>
              <input
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-700"
                defaultValue="Untitled Schedule"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Shoot Date
              </span>
              <input
                type="date"
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-700"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Crew Call
              </span>
              <input
                type="time"
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-700"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Main Location
              </span>
              <input
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-700"
                placeholder="Enter location"
              />
            </label>
          </div>

          <div className="mt-5 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
            Weather / sunrise / sunset area will go here next.
          </div>
        </section>
      </main>
    </div>
  );
}