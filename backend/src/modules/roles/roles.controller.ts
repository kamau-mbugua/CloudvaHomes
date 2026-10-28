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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok } from '../../common/http/response.js';
import { RequireAnyPermission, RequireOrg, RequirePermission } from '../auth/decorators.js';
import { PERMISSION_CATALOGUE } from './permissions.js';
import { CreateRoleDto, UpdateRoleDto } from './roles.dto.js';
import { RolesService } from './roles.service.js';

@ApiTags('Roles & permissions')
@ApiBearerAuth()
@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  /** The full permission catalogue, grouped, for the role editor. */
  @Get('permissions')
  @RequireOrg()
  permissions() {
    return ok(PERMISSION_CATALOGUE);
  }

  // People who manage users need the role list to pick one, even without the role editor.
  @Get('roles')
  @RequireAnyPermission('roles:view', 'users:view')
  async list() {
    return ok(await this.roles.list());
  }

  @Get('roles/:id')
  @RequirePermission('roles:view')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.roles.get(id));
  }

  @Post('roles')
  @RequirePermission('roles:create')
  async create(@Body() dto: CreateRoleDto) {
    return ok(await this.roles.create(dto));
  }

  @Patch('roles/:id')
  @RequirePermission('roles:update')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return ok(await this.roles.update(id, dto));
  }

  @Delete('roles/:id')
  @HttpCode(204)
  @RequirePermission('roles:delete')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.roles.remove(id);
  }
}
