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
  type Type,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok } from '../../../common/http/response.js';
import { RequireAnyPermission, RequirePermission } from '../../auth/decorators.js';
import { CreateCatalogItemDto, UpdateCatalogItemDto } from './catalog.dto.js';
import { type CatalogKind, CatalogService } from './catalog.service.js';

/**
 * One controller class per list (`/unit-types`, `/unit-categories`, `/unit-features`), built
 * from the same template. Reads are also open to `units:view`: unit forms need the pickers.
 */
function catalogController(path: string, kind: CatalogKind): Type<unknown> {
  @ApiTags('Unit setup')
  @ApiBearerAuth()
  @Controller(path)
  class CatalogController {
    constructor(readonly catalog: CatalogService) {}

    @Get()
    @RequireAnyPermission('unit-categories:view', 'units:view')
    async list() {
      return ok(await this.catalog.list(kind));
    }

    @Post()
    @RequirePermission('unit-categories:create')
    async create(@Body() dto: CreateCatalogItemDto) {
      return ok(await this.catalog.create(kind, dto));
    }

    @Patch(':id')
    @RequirePermission('unit-categories:update')
    async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCatalogItemDto) {
      return ok(await this.catalog.update(kind, id, dto));
    }

    @Delete(':id')
    @HttpCode(204)
    @RequirePermission('unit-categories:delete')
    async remove(@Param('id', ParseUUIDPipe) id: string) {
      await this.catalog.remove(kind, id);
    }
  }
  // Distinct class names keep Swagger operation ids unique.
  Object.defineProperty(CatalogController, 'name', {
    value: `${kind[0]!.toUpperCase()}${kind.slice(1)}Controller`,
  });
  return CatalogController;
}

export const UnitTypesController = catalogController('unit-types', 'unitType');
export const UnitCategoriesController = catalogController('unit-categories', 'unitCategory');
export const UnitFeaturesController = catalogController('unit-features', 'unitFeature');
