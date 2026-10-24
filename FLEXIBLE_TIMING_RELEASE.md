# Timing trial reverted

The experimental fixed-start/fixed-finish and backward-planning release was reverted at the user's request. The editor, store, time calculation, templates, call sheet, printing and synchronization behavior are restored to pre-trial commit b6391247dcc1da4c0ed5686574eff281b59a81b5. Contacts, cast, call-sheet improvements, navigation, drawer animation and all earlier work are retained.

Duration now uses the same 36px value slot as Time In and Time Out, keeping their values aligned. Existing custom durations and the original time locks remain available.

A read-only hosted check before rollback found 63 active schedules, zero documents using trial timing metadata, and zero history versions using it. No hosted schedule data needs restoration and no schedule records were changed.

The already-applied additive database validator migration and its database checks remain in history. They do not activate the reverted editor behavior or recalculate documents. Do not delete migration history or reset the database.

The complete trial patch, decisions and test evidence are archived at /Users/johnsammon/roseland-schedule/artifacts/timing-trial-archive-20261024 for future design work. The implementation passed automated tests but did not meet user usability acceptance.
