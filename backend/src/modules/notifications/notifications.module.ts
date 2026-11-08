import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { SmsService } from './sms/sms.service.js';
import { UserNotificationsController } from './user-notifications.controller.js';

@Global()
@Module({
  controllers: [UserNotificationsController],
  providers: [NotificationsService, SmsService],
  exports: [NotificationsService, SmsService],
})
export class NotificationsModule {}
