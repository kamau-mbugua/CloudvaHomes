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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok } from '../../../common/http/response.js';
import { RequirePermission } from '../../auth/decorators.js';
import { CreateChannelDto, ListChannelsQueryDto, UpdateChannelDto } from './channels.dto.js';
import { ChannelsService } from './channels.service.js';

@ApiTags('Payment channels')
@ApiBearerAuth()
@Controller('payment-channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get()
  @RequirePermission('channels:view')
  async list(@Query() q: ListChannelsQueryDto) {
    return ok(await this.channels.list(q));
  }

  @Post()
  @RequirePermission('channels:manage')
  async create(@Body() dto: CreateChannelDto) {
    return ok(await this.channels.create(dto));
  }

  @Patch(':id')
  @RequirePermission('channels:manage')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateChannelDto) {
    return ok(await this.channels.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('channels:manage')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.channels.remove(id);
  }
}
