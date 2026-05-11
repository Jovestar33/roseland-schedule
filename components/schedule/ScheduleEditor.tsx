'use client';
import { useState, useEffect } from 'react';
import { useScheduleStore } from '@/lib/store/scheduleStore';
import type { ScheduleRow } from '@/lib/types';
import ScheduleHeader from './ScheduleHeader';
import ScheduleGrid from './ScheduleGrid';
import EditorToolbar from '@/components/toolbar/EditorToolbar';
import ContactModal from '@/components/modals/ContactModal';
import StatusModal from '@/components/modals/StatusModal';
import NotesModal from '@/components/modals/NotesModal';

interface Props {
  name: string;
}

export default function ScheduleEditor({ name }: Props) {
  const scheduleName = useScheduleStore((s) => s.scheduleName);
  const rows         = useScheduleStore((s) => s.rows);
  const newSchedule  = useScheduleStore((s) => s.newSchedule);
  const addRowAfter  = useScheduleStore((s) => s.addRowAfter);
  const updateRow    = useScheduleStore((s) => s.updateRow);
  const pushUndo     = useScheduleStore((s) => s.pushUndo);

  const [contactRow, setContactRow] = useState<number | null>(null);
  const [statusRow,  setStatusRow]  = useState<number | null>(null);
  const [notesRow,   setNotesRow]   = useState<number | null>(null);

  useEffect(() => {
    if (scheduleName !== name) {
      newSchedule(name);
    }
  }, [name, scheduleName, newSchedule]);

  return (
    <div className="panel">
      <EditorToolbar />
      <ScheduleHeader />
      <ScheduleGrid
        onOpenContact={(i) => setContactRow(i)}
        onOpenStatus={(i)  => setStatusRow(i)}
        onOpenNotes={(i)   => setNotesRow(i)}
      />
      <div className="add-area">
        <button
          className="btn btn-light"
          onClick={() => {
            pushUndo();
            addRowAfter(rows.length - 1);
          }}
        >
          + Add Row
        </button>
      </div>

      <ContactModal
        open={contactRow !== null}
        row={contactRow !== null ? rows[contactRow] : null}
        onSave={(patch) => {
          if (contactRow !== null) {
            pushUndo();
            updateRow(contactRow, patch);
          }
        }}
        onClose={() => setContactRow(null)}
      />
      <StatusModal
        open={statusRow !== null}
        row={statusRow !== null ? rows[statusRow] : null}
        onSave={(status) => {
          if (statusRow !== null) {
            pushUndo();
            updateRow(statusRow, { status });
          }
        }}
        onClose={() => setStatusRow(null)}
      />
      <NotesModal
        open={notesRow !== null}
        notes={notesRow !== null ? rows[notesRow]?.notes ?? '' : ''}
        onSave={(notes) => {
          if (notesRow !== null) {
            pushUndo();
            updateRow(notesRow, { notes });
          }
        }}
        onClose={() => setNotesRow(null)}
      />
    </div>
  );
}
