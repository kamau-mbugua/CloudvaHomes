import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { AppError } from '../common/errors/app-error.js';
import { ok } from '../common/http/response.js';
import { Public } from '../modules/auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DB_TIMEOUT_MS = 2000;

@ApiTags('Health')
@Public() // Cloud Run probes and uptime checks don't sign in
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: the process is up. Never touches the database, so a DB outage doesn't restart instances. */
  @Get()
  @ApiOkResponse({ description: 'Process is running' })
  live() {
    return ok({ status: 'ok' });
  }

  /** Readiness: the API can serve real traffic (database reachable). */
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Database reachable' })
  @ApiServiceUnavailableResponse({ description: 'Database unreachable' })
  async ready() {
    const started = Date.now();
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT_MS);
        }),
      ]);
    } catch {
      throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'Database is not reachable');
    } finally {
      clearTimeout(timer);
    }
    return ok({
      status: 'ok',
      checks: { database: { status: 'ok', latencyMs: Date.now() - started } },
    });
  }
}
