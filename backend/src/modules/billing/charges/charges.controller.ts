import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok } from '../../../common/http/response.js';
import { RequirePermission } from '../../auth/decorators.js';
import {
  ChargeEntriesQueryDto,
  CreateChargeTypeDto,
  CreateMoveInChargeDto,
  ListChargesQueryDto,
  SaveChargeEntriesDto,
  UpdateChargeTypeDto,
  UpdateMoveInChargeDto,
} from './charges.dto.js';
import { ChargesService } from './charges.service.js';

@ApiTags('Charges')
@ApiBearerAuth()
@Controller()
export class ChargesController {
  constructor(private readonly charges: ChargesService) {}

  @Get('charge-types')
  @RequirePermission('charges:view')
  async listChargeTypes(@Query() q: ListChargesQueryDto) {
    return ok(await this.charges.listChargeTypes(q));
  }

  @Post('charge-types')
  @RequirePermission('charges:create')
  async createChargeType(@Body() dto: CreateChargeTypeDto) {
    return ok(await this.charges.createChargeType(dto));
  }

  @Patch('charge-types/:id')
  @RequirePermission('charges:update')
  async updateChargeType(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateChargeTypeDto) {
    return ok(await this.charges.updateChargeType(id, dto));
  }

  @Delete('charge-types/:id')
  @HttpCode(204)
  @RequirePermission('charges:delete')
  async removeChargeType(@Param('id', ParseUUIDPipe) id: string) {
    await this.charges.removeChargeType(id);
  }

  @Get('move-in-charges')
  @RequirePermission('charges:view')
  async listMoveIn(@Query() q: ListChargesQueryDto) {
    return ok(await this.charges.listMoveInCharges(q));
  }

  @Post('move-in-charges')
  @RequirePermission('charges:create')
  async createMoveIn(@Body() dto: CreateMoveInChargeDto) {
    return ok(await this.charges.createMoveInCharge(dto));
  }

  @Patch('move-in-charges/:id')
  @RequirePermission('charges:update')
  async updateMoveIn(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMoveInChargeDto) {
    return ok(await this.charges.updateMoveInCharge(id, dto));
  }

  @Delete('move-in-charges/:id')
  @HttpCode(204)
  @RequirePermission('charges:delete')
  async removeMoveIn(@Param('id', ParseUUIDPipe) id: string) {
    await this.charges.removeMoveInCharge(id);
  }

  /** The month's amounts of a variable charge, one row per unit it applies to. */
  @Get('charge-entries')
  @RequirePermission('charges:view')
  async entries(@Query() q: ChargeEntriesQueryDto) {
    return ok(await this.charges.listEntries(q));
  }

  @Put('charge-entries')
  @RequirePermission('charges:update')
  async saveEntries(@Body() dto: SaveChargeEntriesDto) {
    return ok(await this.charges.saveEntries(dto));
  }
}
