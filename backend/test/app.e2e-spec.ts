import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Type } from 'class-transformer';
import { IsInt, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { ok } from '../src/common/http/response.js';
import { Public } from '../src/modules/auth/decorators.js';

// ── Test-only routes exercising validation and money serialisation through the real pipeline ──
class LineDto {
  @IsInt()
  @Min(1)
  amount!: number;
}

class ProbeDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @ValidateNested({ each: true })
  @Type(() => LineDto)
  lines!: LineDto[];
}

@Public()
@Controller('__probe')
class ProbeController {
  @Post()
  create(@Body() body: ProbeDto) {
    return ok({ name: body.name, total: body.lines.reduce((s, l) => s + BigInt(l.amount), 0n) });
  }

  @Get('boom')
  boom(): never {
    throw new Error('db password=hunter2 leaked?');
  }
}

@Module({ imports: [AppModule], controllers: [ProbeController] })
class TestAppModule {}

describe('HTTP pipeline (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  it('GET /api/v1/health → 200 without touching the database', async () => {
    const res = await http().get('/api/v1/health').expect(200);
    expect(res.body).toEqual({ data: { status: 'ok' } });
  });

  it('GET /api/v1/health/ready → 200 with a database check', async () => {
    const res = await http().get('/api/v1/health/ready').expect(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.checks.database.status).toBe('ok');
  });

  it('echoes a caller request id and mints one otherwise', async () => {
    const given = await http().get('/api/v1/health').set('x-request-id', 'trace-abc-1').expect(200);
    expect(given.headers['x-request-id']).toBe('trace-abc-1');

    const minted = await http().get('/api/v1/health').expect(200);
    expect(minted.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('unknown routes → 404 in the standard error shape', async () => {
    const res = await http().get('/api/v1/nope').set('x-request-id', 'req-404').expect(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: expect.any(String) },
      requestId: 'req-404',
    });
  });

  it('invalid bodies → 422 with per-field details (nested paths)', async () => {
    const res = await http()
      .post('/api/v1/__probe')
      .send({ name: 'x', lines: [{ amount: 0 }], extra: true })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'lines[0].amount', 'extra']));
  });

  it('malformed JSON → 400 INVALID_JSON', async () => {
    const res = await http()
      .post('/api/v1/__probe')
      .set('content-type', 'application/json')
      .send('{"name":')
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('oversized bodies → 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await http()
      .post('/api/v1/__probe')
      .send({ name: 'x'.repeat(1_100_000), lines: [] })
      .expect(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('serialises BigInt money as JSON integers', async () => {
    const res = await http()
      .post('/api/v1/__probe')
      .send({ name: 'rent', lines: [{ amount: 1500000 }, { amount: 250000 }] })
      .expect(201);
    expect(res.body).toEqual({ data: { name: 'rent', total: 1750000 } });
  });

  it('unexpected errors → 500 INTERNAL without leaking internals', async () => {
    const res = await http().get('/api/v1/__probe/boom').expect(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(res.body)).not.toMatch(/hunter2/);
  });

  it('sets security headers', async () => {
    const res = await http().get('/api/v1/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
