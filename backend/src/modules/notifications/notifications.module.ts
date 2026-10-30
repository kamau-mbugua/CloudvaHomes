import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { UserNotificationsController } from './user-notifications.controller.js';

@Global()
@Module({
  controllers: [UserNotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
