import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { ShortLinksController } from './short-links.controller.js';
import { ShortLinksService } from './short-links.service.js';
import { SmsService } from './sms/sms.service.js';
import { UserNotificationsController } from './user-notifications.controller.js';

@Global()
@Module({
  controllers: [UserNotificationsController, ShortLinksController],
  providers: [NotificationsService, SmsService, ShortLinksService],
  exports: [NotificationsService, SmsService, ShortLinksService],
})
export class NotificationsModule {}
