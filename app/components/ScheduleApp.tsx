"use client";

const scheduleRows = [
  {
    timeIn: "7:00 AM",
    timeOut: "7:30 AM",
    action: "Crew Call",
    location: "Basecamp",
    notes: "Arrival, parking, breakfast, and prep.",
  },
  {
    timeIn: "7:30 AM",
    timeOut: "8:30 AM",
    action: "Move / Set Up",
    location: "Location 1",
    notes: "Load in, stage gear, confirm first setup.",
  },
  {
    timeIn: "8:30 AM",
    timeOut: "10:30 AM",
    action: "Shoot",
    location: "Location 1",
    notes: "Primary coverage.",
  },
];

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
              Next migration shell — first schedule grid.
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
                Basic schedule metadata and first grid are now inside the Next app.
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

          <div className="mt-5 overflow-x-auto rounded-xl border border-neutral-300">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-neutral-900 text-white">
                <tr>
                  <th className="px-3 py-3 font-semibold">Time In</th>
                  <th className="px-3 py-3 font-semibold">Time Out</th>
                  <th className="px-3 py-3 font-semibold">Action</th>
                  <th className="px-3 py-3 font-semibold">Location</th>
                  <th className="px-3 py-3 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody>
                {scheduleRows.map((row, index) => (
                  <tr
                    key={index}
                    className="border-t border-neutral-200 odd:bg-white even:bg-neutral-50"
                  >
                    <td className="px-3 py-3 font-medium">{row.timeIn}</td>
                    <td className="px-3 py-3 font-medium">{row.timeOut}</td>
                    <td className="px-3 py-3">{row.action}</td>
                    <td className="px-3 py-3">{row.location}</td>
                    <td className="px-3 py-3 text-neutral-600">{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}