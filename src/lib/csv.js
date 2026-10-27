// Spreadsheet formulas can start after whitespace/control characters, even in quoted CSV.
export function csvField(value) {
  const text=String(value??'');
  const safe=/^[\s\u0000-\u001f]*[-=+@]/u.test(text)?"'"+text:text;
  return '"'+safe.replaceAll('"','""')+'"';
}
