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
import { RequirePermission } from '../auth/decorators.js';
import { InviteUserDto, ListUsersQueryDto, UpdateMemberDto } from './users.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission('users:view')
  list(@Query() q: ListUsersQueryDto) {
    return this.users.list(q);
  }

  @Post('invitations')
  @RequirePermission('users:create')
  async invite(@Body() dto: InviteUserDto) {
    return ok(await this.users.invite(dto));
  }

  @Post(':userId/invitation/resend')
  @HttpCode(200)
  @RequirePermission('users:create')
  async resend(@Param('userId', ParseUUIDPipe) userId: string) {
    return ok(await this.users.resendInvitation(userId));
  }

  @Patch(':userId')
  @RequirePermission('users:update')
  async update(@Param('userId', ParseUUIDPipe) userId: string, @Body() dto: UpdateMemberDto) {
    return ok(await this.users.update(userId, dto));
  }

  @Delete(':userId')
  @HttpCode(204)
  @RequirePermission('users:delete')
  async remove(@Param('userId', ParseUUIDPipe) userId: string) {
    await this.users.remove(userId);
  }
}
