// Spreadsheet formulas can start after whitespace/control characters, even in quoted CSV.
export function csvField(value) {
  const text=String(value??'');
  // Control characters are intentional here: Excel ignores them before a formula.
  // eslint-disable-next-line no-control-regex
  const safe=/^[\s\u0000-\u001f]*[-=+@]/u.test(text)?"'"+text:text;
  return '"'+safe.replaceAll('"','""')+'"';
}
