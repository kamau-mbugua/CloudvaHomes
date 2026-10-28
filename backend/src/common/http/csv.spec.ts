import { csvCell, toCsv } from './csv.js';

describe('CSV', () => {
  it('quotes, escapes and formats money as shillings', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, "b"')).toBe('"a, ""b"""');
    expect(csvCell(250050n)).toBe('2500.50');
    expect(csvCell(-100n)).toBe('-1.00');
    expect(csvCell(null)).toBe('');
    expect(csvCell(0.5)).toBe('0.5');
  });

  it('neutralises spreadsheet formulas in text', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+254700000001')).toBe("'+254700000001");
  });

  it('starts with a BOM and uses CRLF', () => {
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('﻿a,b\r\n1,x\r\n');
  });
});
