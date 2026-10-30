import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import {
  UnitCategoriesController,
  UnitFeaturesController,
  UnitTypesController,
} from './catalog/catalog.controller.js';
import { CatalogService } from './catalog/catalog.service.js';
import { IdNumbers } from './id-numbers.js';
import { LandlordsController } from './landlords/landlords.controller.js';
import { LandlordsService } from './landlords/landlords.service.js';
import { PropertiesController } from './properties/properties.controller.js';
import { PropertiesService } from './properties/properties.service.js';
import { TenanciesController } from './tenancies/tenancies.controller.js';
import { TenanciesService } from './tenancies/tenancies.service.js';
import { TenantsController } from './tenants/tenants.controller.js';
import { TenantsService } from './tenants/tenants.service.js';
import { UnitsController } from './units/units.controller.js';
import { UnitsService } from './units/units.service.js';

/**
 * Portfolio (phase 2): what an organisation manages and who lives there — landlords
 * (agencies), properties, unit setup lists, units, tenants and tenancies.
 */
@Module({
  imports: [FilesModule],
  controllers: [
    LandlordsController,
    PropertiesController,
    UnitTypesController,
    UnitCategoriesController,
    UnitFeaturesController,
    UnitsController,
    TenantsController,
    TenanciesController,
  ],
  providers: [
    IdNumbers,
    LandlordsService,
    PropertiesService,
    CatalogService,
    UnitsService,
    TenantsService,
    TenanciesService,
  ],
  exports: [PropertiesService, UnitsService, TenantsService, TenanciesService],
})
export class PortfolioModule {}
