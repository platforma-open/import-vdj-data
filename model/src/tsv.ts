/**
 * The data rows of a headed TSV as polars writes it: a field holding a tab, newline or quote is
 * wrapped in quotes, with embedded quotes doubled. Blank lines are skipped.
 */
export function parseTsvRows(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  const endRecord = () => {
    record.push(field);
    if (record.length > 1 || record[0] !== "") records.push(record);
    record = [];
    field = "";
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === "\t") {
      record.push(field);
      field = "";
    } else if (c === "\n") endRecord();
    else if (c !== "\r") field += c;
  }
  if (field !== "" || record.length > 0) endRecord();

  return records.slice(1);
}
