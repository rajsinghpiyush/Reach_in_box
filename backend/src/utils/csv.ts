import { parse } from 'csv-parse/sync';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Extracts a deduplicated list of valid emails from raw CSV string.
 * Supports:
 * - CSVs with headers (e.g., Email, First Name, Last Name)
 * - Single column CSVs (one email per line)
 * - Comma/semicolon/tab delimited CSVs
 * - Plain lists with fallback regex extraction
 */
export function parseEmailsFromCsv(csvContent: string): string[] {
  if (!csvContent || typeof csvContent !== 'string') {
    return [];
  }

  const emailsSet = new Set<string>();

  try {
    const records: string[][] = parse(csvContent, {
      relax_quotes: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    });

    if (records.length > 0 && records[0]) {
      const firstRow = records[0].map(c => (c ? c.toLowerCase().trim() : ''));
      // Check if first row is a header row
      const emailHeaderIndex = firstRow.findIndex(
        col => col === 'email' || col === 'email address' || col === 'e-mail' || col === 'recipient' || col === 'to' || col.includes('email')
      );

      const startIndex = emailHeaderIndex !== -1 ? 1 : 0;
      const targetCol = emailHeaderIndex !== -1 ? emailHeaderIndex : -1;

      for (let i = startIndex; i < records.length; i++) {
        const row = records[i];
        if (!row) continue;

        if (targetCol !== -1 && row[targetCol]) {
          const val = row[targetCol].trim();
          if (EMAIL_REGEX.test(val)) {
            emailsSet.add(val.toLowerCase());
          }
        } else {
          // Check all columns in the row for any email
          for (const cell of row) {
            if (!cell) continue;
            const val = cell.trim();
            if (EMAIL_REGEX.test(val)) {
              emailsSet.add(val.toLowerCase());
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('csv-parse failed, falling back to regex parser:', err);
  }

  // Fallback regex scan in case CSV parsing was empty or malformed
  if (emailsSet.size === 0) {
    const matches = csvContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    if (matches) {
      for (const email of matches) {
        emailsSet.add(email.toLowerCase().trim());
      }
    }
  }

  return Array.from(emailsSet);
}
