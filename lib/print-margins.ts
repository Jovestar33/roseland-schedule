// Escape CSS strings, including style-delimiter characters, without treating
// document text as a selector, declaration or markup.
function cssString(value: string): string {
  return '"' + value.replace(/[\\"\n\r\f<>]/g, c => `\\${c.charCodeAt(0).toString(16)} `) + '"';
}
export function printMarginCss(name: string, date: string, kind: string): string {
  const identity = [name || 'Schedule', date || 'Date not set'].join(' · ');
  return `@media print { @page local-document {
    margin: .65in .45in .55in;
    @top-left { content: ${cssString(identity)}; font: 8pt "DM Sans", Arial, sans-serif; color: #5e5e68; vertical-align: middle; }
    @bottom-left { content: ${cssString(kind)}; font: 8pt "DM Sans", Arial, sans-serif; color: #5e5e68; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt "DM Sans", Arial, sans-serif; color: #5e5e68; }
  } }`;
}
