import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiExcludeController,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import type { WithRawBody } from '../../common/http/body-parsers.js';
import { ok } from '../../common/http/response.js';
import { AllowWhenSuspended, Public, RequirePermission } from '../auth/decorators.js';
import { bankAdapterCodes } from './bank-adapter.js';
import { BanksService, MAX_STATEMENT_BYTES } from './banks.service.js';

class StatementBodyDto {
  @IsOptional() @IsString() @MaxLength(2000) mapping?: string;
}

class BankWebhookDto {
  @IsIn(bankAdapterCodes()) adapter!: string;
}

type CsvFile = { buffer: Buffer; size: number; originalname?: string };

const upload = FileInterceptor('file', { limits: { fileSize: MAX_STATEMENT_BYTES, files: 1 } });
const FILE_BODY = {
  schema: {
    type: 'object',
    properties: {
      file: { type: 'string', format: 'binary' },
      mapping: { type: 'string', description: 'JSON StatementMapping' },
    },
  },
};

@ApiTags('Banks')
@ApiBearerAuth()
@Controller('payment-channels/:id')
export class BanksController {
  constructor(private readonly banks: BanksService) {}

  @Post('statement-imports/preview')
  @HttpCode(200)
  @AllowWhenSuspended()
  @RequirePermission('reconciliation:update')
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY)
  @UseInterceptors(upload)
  async preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StatementBodyDto,
    @UploadedFile() file?: CsvFile,
  ) {
    return ok(await this.banks.preview(id, file, body.mapping));
  }

  /** Money in: allowed while the organisation's Hodi account is suspended. */
  @Post('statement-imports')
  @AllowWhenSuspended()
  @RequirePermission('reconciliation:update')
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY)
  @UseInterceptors(upload)
  async import(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StatementBodyDto,
    @UploadedFile() file?: CsvFile,
  ) {
    return ok(await this.banks.importStatement(id, file, body.mapping));
  }

  @Get('statement-imports')
  @RequirePermission('reconciliation:view')
  async imports(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.banks.imports(id));
  }

  @Put('bank-webhook')
  @RequirePermission('channels:manage')
  async enable(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BankWebhookDto) {
    return ok(await this.banks.enableWebhook(id, dto.adapter));
  }

  @Delete('bank-webhook')
  @HttpCode(204)
  @RequirePermission('channels:manage')
  async disable(@Param('id', ParseUUIDPipe) id: string) {
    await this.banks.disableWebhook(id);
  }
}

/** Banks' notifications: proven by the URL token and the body signature. */
@ApiExcludeController()
@Public()
@Controller('hooks/bank/:token')
export class BankHooksController {
  constructor(private readonly banks: BanksService) {}

  @Post()
  @HttpCode(200)
  async receive(@Param('token') token: string, @Req() req: Request & WithRawBody) {
    return ok(await this.banks.receiveWebhook(token, req.headers, req.rawBody));
  }
}
