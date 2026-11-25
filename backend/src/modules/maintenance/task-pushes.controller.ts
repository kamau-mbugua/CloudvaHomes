import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { ok } from '../../common/http/response.js';
import { Public } from '../auth/decorators.js';
import { JobsGuard } from '../jobs/job-auth.js';
import { TaskPushesService } from './task-pushes.service.js';

export class CaretakerDailyJobDto {
  @IsOptional()
  @IsString()
  today?: string;
}

export class MaintenanceLateJobDto {
  @IsOptional()
  @IsString()
  now?: string;
}

@ApiExcludeController()
@Public()
@UseGuards(JobsGuard)
@Controller('internal/jobs')
export class TaskPushesController {
  constructor(private readonly pushes: TaskPushesService) {}

  @Post('caretaker-daily')
  @HttpCode(200)
  async caretakerDaily(@Body() body?: CaretakerDailyJobDto) {
    return ok(await this.pushes.runCaretakerDaily(body?.today));
  }

  @Post('maintenance-late')
  @HttpCode(200)
  async maintenanceLate(@Body() body?: MaintenanceLateJobDto) {
    return ok(await this.pushes.runMaintenanceLate(body?.now));
  }
}
