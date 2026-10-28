import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { AppError, flattenValidationErrors } from './app-error.js';
import { toBodyParserError } from '../http/body-parsers.js';
import { normaliseError } from './http-exception.filter.js';

describe('normaliseError', () => {
  it('passes AppError through with its code and details', () => {
    const err = AppError.validation([{ field: 'phone', message: 'phone is invalid' }]);
    expect(normaliseError(err)).toEqual({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'Some fields are invalid',
      details: [{ field: 'phone', message: 'phone is invalid' }],
    });
  });

  it('maps Nest HTTP exceptions to stable codes', () => {
    expect(normaliseError(new NotFoundException('Unit not found'))).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Unit not found',
    });
    expect(normaliseError(new ForbiddenException())).toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect(normaliseError(new BadRequestException(['a is bad', 'b is bad']))).toMatchObject({
      status: 400,
      message: 'a is bad; b is bad',
    });
  });

  it('maps body-parser failures (via toBodyParserError)', () => {
    const parse = Object.assign(new SyntaxError('Unexpected end'), {
      status: 400,
      type: 'entity.parse.failed',
    });
    expect(normaliseError(toBodyParserError(parse))).toMatchObject({
      status: 400,
      code: 'INVALID_JSON',
    });
    expect(
      normaliseError(toBodyParserError({ status: 413, type: 'entity.too.large' })),
    ).toMatchObject({
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });
    const other = new Error('other');
    expect(toBodyParserError(other)).toBe(other);
  });

  it('hides internals of unknown errors', () => {
    const result = normaliseError(new Error('connection string postgres://secret@db'));
    expect(result).toMatchObject({ status: 500, code: 'INTERNAL' });
    expect(result.message).not.toMatch(/secret/);
  });
});

describe('flattenValidationErrors', () => {
  it('produces dotted and indexed field paths', () => {
    const child = Object.assign(new ValidationError(), {
      property: 'amount',
      constraints: { isInt: 'amount must be an integer' },
      children: [],
    });
    const item = Object.assign(new ValidationError(), { property: '0', children: [child] });
    const lines = Object.assign(new ValidationError(), {
      property: 'lines',
      constraints: { arrayMinSize: 'lines must not be empty' },
      children: [item],
    });

    expect(flattenValidationErrors([lines])).toEqual([
      { field: 'lines', message: 'lines must not be empty' },
      { field: 'lines[0].amount', message: 'amount must be an integer' },
    ]);
  });
});
