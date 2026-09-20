import type { ScheduleData } from './types';
export interface SchedulePrintRequest { name: string; data: ScheduleData; authorize?: () => Promise<boolean> }
/** Open a deterministic, paginated preview; screen expansion state is irrelevant. */
export async function printSchedule(name: string, data: ScheduleData, authorize?: () => Promise<boolean>) {
  window.dispatchEvent(new CustomEvent<SchedulePrintRequest>('schedule-print-preview', {
    detail: { name, data: structuredClone(data), authorize },
  }));
}
