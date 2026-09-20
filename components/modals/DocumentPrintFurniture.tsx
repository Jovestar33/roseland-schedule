import { printMarginCss } from '@/lib/print-margins';

/** Only mounted in the active document portal; Chromium 131+ page margin boxes. */
export default function DocumentPrintFurniture({name, date, kind}: {name: string; date: string; kind: string}) {
  return <style>{printMarginCss(name, date, kind)}</style>;
}
