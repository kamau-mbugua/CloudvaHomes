import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { ReceiptLinksService } from './receipt-links.service.js';
import { ShortLinksController } from './short-links.controller.js';
import { ShortLinksService } from './short-links.service.js';
import { SmsService } from './sms/sms.service.js';
import { UserNotificationsController } from './user-notifications.controller.js';

@Global()
@Module({
  controllers: [UserNotificationsController, ShortLinksController],
  providers: [NotificationsService, SmsService, ShortLinksService, ReceiptLinksService],
  exports: [NotificationsService, SmsService, ShortLinksService, ReceiptLinksService],
})
export class NotificationsModule {}
