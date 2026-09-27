// The browser half of the .ics export (#426): apart from ics.ts, which the API
// also builds series calendars with (#608) and which must therefore not reach
// for `document`.

/** Hands the file to the browser. Revokes the object URL once it has it. */
export function downloadIcs(fileName: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
