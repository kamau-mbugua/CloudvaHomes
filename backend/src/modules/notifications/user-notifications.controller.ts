import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/http/pagination.js';
import { ok } from '../../common/http/response.js';
import { AllowWhenSuspended, authContext } from '../auth/decorators.js';
import { NotificationsService } from './notifications.service.js';

export class ListUserNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsOptional()
  @IsBoolean()
  unreadOnly?: boolean;
}

export class RegisterDeviceTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  token!: string;

  @ApiProperty({ enum: ['android', 'ios', 'web'] })
  @IsString()
  @IsIn(['android', 'ios', 'web'])
  platform!: 'android' | 'ios' | 'web';
}

export class UnregisterDeviceTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  token!: string;
}

@ApiTags('Notifications')
@ApiBearerAuth()
@AllowWhenSuspended()
@Controller('notifications')
export class UserNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Query() q: ListUserNotificationsQueryDto) {
    return this.notifications.listForUser(authContext().userId, q);
  }

  @Post('read-all')
  @HttpCode(200)
  async markAllRead() {
    return ok(await this.notifications.markAllRead(authContext().userId));
  }

  @Post('test')
  @HttpCode(200)
  async sendTest() {
    return ok(await this.notifications.sendTestNotification(authContext().userId));
  }

  @Get('devices')
  async listDevices() {
    return ok(await this.notifications.listDevices(authContext().userId));
  }

  @Post('devices')
  @HttpCode(200)
  async registerDevice(@Body() dto: RegisterDeviceTokenDto) {
    return ok(await this.notifications.registerDevice(authContext().userId, dto));
  }

  @Delete('devices')
  @HttpCode(200)
  async unregisterDevice(@Body() dto: UnregisterDeviceTokenDto) {
    return ok(await this.notifications.unregisterDevice(authContext().userId, dto.token));
  }

  @Post(':id/read')
  @HttpCode(200)
  async markRead(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.notifications.markRead(authContext().userId, id));
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.notifications.deleteNotification(authContext().userId, id));
  }
}
