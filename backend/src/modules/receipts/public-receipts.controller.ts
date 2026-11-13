import { Controller, Get, Inject, Param, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  emptyContext,
  runWithContext,
  withoutOrgScope,
} from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { Public } from '../auth/decorators.js';
import { ReceiptLinksService } from '../notifications/receipt-links.service.js';
import { rateKeyFor } from '../notifications/short-links.service.js';
import { renderReceiptPdf } from '../payments/pdfs.js';
import { PaymentsService } from '../payments/payments.service.js';
import { GuestNoticesService } from '../stays/notices/guest-notices.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const RECEIPT_LINK_GONE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipt link expired</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.25rem;color:#0A2540">
<h1 style="font-size:1.4rem">This receipt link has expired or is not valid</h1>
<p>Ask whoever you paid to send the receipt again.</p>
</body></html>`;

/**
 * `GET /api/v1/public/receipts/:kind/:id?e=&s=` — one receipt PDF from a link sent by SMS. The
 * link is signed and expires, so nobody can open a receipt they were not sent.
 */
@ApiTags('Receipts')
@Public()
@Controller('public/receipts')
export class PublicReceiptsController {
  constructor(
    private readonly links: ReceiptLinksService,
    private readonly payments: PaymentsService,
    private readonly notices: GuestNoticesService,
    private readonly rateLimit: RateLimitService,
    @Inject(DB) private readonly db: Db,
  ) {}

  @Get(':kind/:id')
  async open(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Query('e') exp: string,
    @Query('s') sig: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.rateLimit.hit({
      key: `receipt:ip:${rateKeyFor(req.ip ?? 'unknown')}`,
      limit: 30,
      windowSeconds: 60,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex');
    const gone = () =>
      res
        .status(404)
        .setHeader('Content-Type', 'text/html; charset=utf-8')
        .send(RECEIPT_LINK_GONE_HTML);

    if (!UUID.test(id) || !this.links.verify(kind, id, exp, sig)) {
      gone();
      return;
    }
    try {
      const file = kind === 'stay' ? await this.notices.receiptPdf(id) : await this.rentPdf(id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
      res.send(file.content);
    } catch {
      gone();
    }
  }

  /** A rent receipt, read as its organisation (the link is the caller's proof of access). */
  private async rentPdf(id: string): Promise<{ filename: string; content: Buffer }> {
    const row = await withoutOrgScope(() =>
      this.db.payment.findUnique({
        where: { id },
        select: { orgId: true, reversesId: true, reversedBy: { select: { id: true } } },
      }),
    );
    if (!row || row.reversesId || row.reversedBy) throw AppError.notFound('Receipt');
    return runWithContext(emptyContext({ orgId: row.orgId }), async () => {
      const data = await this.payments.forReceipt(id);
      return { filename: `${data.payment.number}.pdf`, content: await renderReceiptPdf(data) };
    });
  }
}
