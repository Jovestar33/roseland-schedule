"use client";

export default function ScheduleApp() {
  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      <header className="border-b bg-white px-6 py-4">
        <h1 className="text-xl font-semibold">Roseland Production Schedule</h1>
        <p className="text-sm text-neutral-500">
          Next migration shell — ready for app transfer.
        </p>
      </header>

      <main className="p-6">
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold">Schedule Workspace</h2>
          <p className="text-sm text-neutral-600">
            We will migrate the old HTML app into this component piece by piece.
          </p>
        </section>
      </main>
    </div>
  );
}