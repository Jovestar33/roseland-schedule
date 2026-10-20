'use client';
import { useEffect, useRef } from 'react';
import { useScheduleStore } from '../store/scheduleStore';

// Shared by toolbar saves and snapshot actions, so their responses cannot
// acknowledge or replace a document after a newer operation has started.
let latestRequest = 0;

export function useDocumentRequest(routeName: string | null) {
  const lifetime = useRef(0);
  function invalidate() { lifetime.current += 1; }
  useEffect(() => () => { lifetime.current += 1; }, [routeName]);

  function beginRequest() {
    const state = useScheduleStore.getState();
    return {
      sequence: ++latestRequest, lifetime: lifetime.current,
      session: state.documentSession, revision: state.editRevision, name: state.scheduleName,
    };
  }
  function isCurrent(request: ReturnType<typeof beginRequest>) {
    const state = useScheduleStore.getState();
    return request.sequence === latestRequest && request.lifetime === lifetime.current
      && request.session === state.documentSession && request.name === state.scheduleName;
  }
  return { beginRequest, isCurrent, invalidate };
}
