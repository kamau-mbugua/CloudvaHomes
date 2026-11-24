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
import { ok } from '../../common/http/response.js';
import { PlatformAdminOnly, PlatformOperatorOnly } from '../auth/decorators.js';
import {
  CloseAccountDto,
  ListPlatformUsersQueryDto,
  SetPlatformUserStatusDto,
  UpdatePlatformUserDto,
} from './platform.dto.js';
import { PlatformUsersService } from './platform-users.service.js';

/**
 * Customers' accounts and organisations' teams, for KodiHQ support. Salespeople are limited to
 * the organisations they look after (see PlatformUsersService); deleted accounts are for
 * superadmins. Password resets, sign-in detail changes, closing, erasing and removing a team
 * member need a fresh one-time code (step-up).
 */
@ApiTags('Platform')
@ApiBearerAuth()
@PlatformOperatorOnly()
@Controller('platform')
export class PlatformUsersController {
  constructor(private readonly users: PlatformUsersService) {}

  @Get('users')
  async list(@Query() q: ListPlatformUsersQueryDto) {
    return this.users.list(q);
  }

  @Get('users/:id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.users.get(id));
  }

  @Patch('users/:id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlatformUserDto) {
    return ok(await this.users.update(id, dto));
  }

  @Post('users/:id/status')
  @HttpCode(200)
  async status(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetPlatformUserStatusDto) {
    return ok(await this.users.setStatus(id, dto.status));
  }

  @Post('users/:id/sign-out')
  @HttpCode(200)
  async signOut(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.users.signOutEverywhere(id));
  }

  @Post('users/:id/reset-password')
  @HttpCode(200)
  async resetPassword(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.users.resetPassword(id));
  }

  @Post('users/:id/close')
  @PlatformAdminOnly()
  @HttpCode(200)
  async close(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseAccountDto) {
    return ok(await this.users.closeAccount(id, dto.reason));
  }

  @Post('users/:id/restore')
  @PlatformAdminOnly()
  @HttpCode(200)
  async restore(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.users.restore(id));
  }

  @Post('users/:id/purge')
  @PlatformAdminOnly()
  @HttpCode(200)
  async purge(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.users.purge(id));
  }

  @Get('organizations/:id/members')
  async members(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.users.members(id));
  }

  @Post('organizations/:id/members/:membershipId/resend')
  @HttpCode(200)
  async resend(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return ok(await this.users.resendInvitation(id, membershipId));
  }

  @Delete('organizations/:id/members/:membershipId')
  @HttpCode(204)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    await this.users.removeMember(id, membershipId);
  }
}
