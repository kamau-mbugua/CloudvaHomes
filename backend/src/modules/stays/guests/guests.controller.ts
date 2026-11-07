import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok } from '../../../common/http/response.js';
import { RequirePermission } from '../../auth/decorators.js';
import { ListGuestsQueryDto, UpdateGuestDto } from './guests.dto.js';
import { GuestsService } from './guests.service.js';

@ApiTags('Host — Guests')
@ApiBearerAuth()
@Controller('host/guests')
export class GuestsController {
  constructor(private readonly guests: GuestsService) {}

  @RequirePermission('guests:view')
  @Get()
  list(@Query() q: ListGuestsQueryDto) {
    return this.guests.list(q);
  }

  @RequirePermission('guests:view')
  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.guests.get(id));
  }

  @RequirePermission('guests:update')
  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGuestDto) {
    return ok(await this.guests.update(id, dto));
  }
}
