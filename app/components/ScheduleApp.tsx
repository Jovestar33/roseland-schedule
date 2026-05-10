"use client";

import { useEffect, useState } from "react";

type ScheduleRow = {
  timeIn: string;
  timeOut: string;
  action: string;
  location: string;
  notes: string;
};

type ScheduleMeta = {
  scheduleName: string;
  shootDate: string;
  crewCall: string;
  mainLocation: string;
};

type SavedDraft = {
  meta: ScheduleMeta;
  rows: ScheduleRow[];
  updatedAt: string;
};

const blankRow: ScheduleRow = {
  timeIn: "",
  timeOut: "",
  action: "",
  location: "",
  notes: "",
};

const initialMeta: ScheduleMeta = {
  scheduleName: "Untitled Schedule",
  shootDate: "",
  crewCall: "",
  mainLocation: "",
};

const initialRows: ScheduleRow[] = [
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

const localDraftKey = "roseland-schedule-draft";

export default function ScheduleApp() {
  const [meta, setMeta] = useState<ScheduleMeta>(initialMeta);
  const [rows, setRows] = useState<ScheduleRow[]>(initialRows);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string>("");

  useEffect(() => {
    const savedDraftText = localStorage.getItem(localDraftKey);

    if (!savedDraftText) {
      return;
    }

    try {
      const savedDraft = JSON.parse(savedDraftText) as SavedDraft;

      if (savedDraft.meta) {
        setMeta(savedDraft.meta);
      }

      if (Array.isArray(savedDraft.rows) && savedDraft.rows.length > 0) {
        setRows(savedDraft.rows);
      }

      if (savedDraft.updatedAt) {
        setLastSavedAt(savedDraft.updatedAt);
      }

      setHasUnsavedChanges(false);
    } catch {
      console.warn("Could not load saved local draft.");
    }
  }, []);

  function markUnsaved() {
    setHasUnsavedChanges(true);
  }

  function updateMeta(field: keyof ScheduleMeta, value: string) {
    setMeta((currentMeta) => ({
      ...currentMeta,
      [field]: value,
    }));

    markUnsaved();
  }

  function updateRow(index: number, field: keyof ScheduleRow, value: string) {
    setRows((currentRows) =>
      currentRows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      )
    );

    markUnsaved();
  }

  function addRow() {
    setRows((currentRows) => [...currentRows, { ...blankRow }]);
    markUnsaved();
  }

  function deleteRow(index: number) {
    setRows((currentRows) => {
      if (currentRows.length === 1) {
        return [{ ...blankRow }];
      }

      return currentRows.filter((_, rowIndex) => rowIndex !== index);
    });

    markUnsaved();
  }

  function newSchedule() {
    const confirmed = window.confirm(
      "Start a new blank schedule? Unsaved changes will be lost."
    );

    if (!confirmed) {
      return;
    }

    setMeta(initialMeta);
    setRows([{ ...blankRow }]);
    setHasUnsavedChanges(true);
  }

  function saveLocalDraft() {
    const updatedAt = new Date().toISOString();

    const draft: SavedDraft = {
      meta,
      rows,
      updatedAt,
    };

    localStorage.setItem(localDraftKey, JSON.stringify(draft));
    setLastSavedAt(updatedAt);
    setHasUnsavedChanges(false);
  }

  const statusText = hasUnsavedChanges ? "Unsaved changes" : "Saved locally";

  const savedTimeText = lastSavedAt
    ? `Last saved: ${new Date(lastSavedAt).toLocaleString()}`
    : "No local save yet";

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      <header className="border-b border-neutral-300 bg-white px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Roseland Production Schedule
            </h1>
            <p className="text-sm text-neutral-500">
              Next migration shell — local draft load test.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-neutral-50">
              Library
            </button>

            <button
              onClick={newSchedule}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-neutral-50"
            >
              New
            </button>

            <button
              onClick={saveLocalDraft}
              className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-neutral-700"
            >
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
                Local draft saving and loading are now active.
              </p>
              <p className="mt-1 text-xs text-neutral-500">{savedTimeText}</p>
            </div>

            <div
              className={
                hasUnsavedChanges
                  ? "rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700"
                  : "rounded-full border border-green-300 bg-green-50 px-3 py-1 text-sm font-medium text-green-700"
              }
            >
              {statusText}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Schedule Name
              </span>
              <input
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-700"
                value={meta.scheduleName}
                onChange={(event) =>
                  updateMeta("scheduleName", event.target.value)
                }
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Shoot Date
              </span>
              <input
                type="date"
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-700"
                value={meta.shootDate}
                onChange={(event) => updateMeta("shootDate", event.target.value)}
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Crew Call
              </span>
              <input
                type="time"
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-700"
                value={meta.crewCall}
                onChange={(event) => updateMeta("crewCall", event.target.value)}
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Main Location
              </span>
              <input
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-700"
                placeholder="Enter location"
                value={meta.mainLocation}
                onChange={(event) =>
                  updateMeta("mainLocation", event.target.value)
                }
              />
            </label>
          </div>

          <div className="mt-5 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
            Weather / sunrise / sunset area will go here next.
          </div>

          <div className="mt-5">
            <h3 className="text-base font-semibold">Schedule Grid</h3>
          </div>

          <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-300">
            <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
              <thead className="bg-neutral-900 text-white">
                <tr>
                  <th className="px-3 py-3 font-semibold">Time In</th>
                  <th className="px-3 py-3 font-semibold">Time Out</th>
                  <th className="px-3 py-3 font-semibold">Action</th>
                  <th className="px-3 py-3 font-semibold">Location</th>
                  <th className="px-3 py-3 font-semibold">Notes</th>
                  <th className="px-3 py-3 font-semibold">Row</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={index}
                    className="border-t border-neutral-200 odd:bg-white even:bg-neutral-50"
                  >
                    <td className="px-2 py-2">
                      <input
                        className="w-full rounded-md border border-neutral-200 bg-white px-2 py-2 font-medium outline-none focus:border-neutral-700"
                        value={row.timeIn}
                        onChange={(event) =>
                          updateRow(index, "timeIn", event.target.value)
                        }
                      />
                    </td>

                    <td className="px-2 py-2">
                      <input
                        className="w-full rounded-md border border-neutral-200 bg-white px-2 py-2 font-medium outline-none focus:border-neutral-700"
                        value={row.timeOut}
                        onChange={(event) =>
                          updateRow(index, "timeOut", event.target.value)
                        }
                      />
                    </td>

                    <td className="px-2 py-2">
                      <input
                        className="w-full rounded-md border border-neutral-200 bg-white px-2 py-2 outline-none focus:border-neutral-700"
                        value={row.action}
                        onChange={(event) =>
                          updateRow(index, "action", event.target.value)
                        }
                      />
                    </td>

                    <td className="px-2 py-2">
                      <input
                        className="w-full rounded-md border border-neutral-200 bg-white px-2 py-2 outline-none focus:border-neutral-700"
                        value={row.location}
                        onChange={(event) =>
                          updateRow(index, "location", event.target.value)
                        }
                      />
                    </td>

                    <td className="px-2 py-2">
                      <input
                        className="w-full rounded-md border border-neutral-200 bg-white px-2 py-2 text-neutral-700 outline-none focus:border-neutral-700"
                        value={row.notes}
                        onChange={(event) =>
                          updateRow(index, "notes", event.target.value)
                        }
                      />
                    </td>

                    <td className="px-2 py-2">
                      <button
                        onClick={() => deleteRow(index)}
                        className="rounded-md border border-red-200 bg-red-50 px-2 py-2 text-xs font-medium text-red-700 shadow-sm hover:bg-red-100"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex justify-start">
            <button
              onClick={addRow}
              className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-neutral-700"
            >
              Add Row
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}