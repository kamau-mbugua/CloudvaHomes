import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators.js';
import { SHORT_LINK_GONE_HTML, ShortLinksService } from './short-links.service.js';

/** `GET /api/v1/s/:code` — a short link's redirect (go.kodihub.co.ke/<code> lands here too). */
@ApiTags('Short links')
@Public()
@Controller('s')
export class ShortLinksController {
  constructor(private readonly links: ShortLinksService) {}

  @Get(':code')
  async open(@Param('code') code: string, @Req() req: Request, @Res() res: Response) {
    await sendShortLink(this.links, code, req.ip ?? 'unknown', res);
  }
}

/** Redirects to the link's target, or shows a plain "expired" page. Never cached. */
export async function sendShortLink(
  links: ShortLinksService,
  code: string,
  ip: string,
  res: Response,
): Promise<void> {
  const target = await links.resolve(code, ip);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (target) {
    res.redirect(302, target);
    return;
  }
  res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(SHORT_LINK_GONE_HTML);
}
