import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import type { SmsPurchase } from '../../generated/prisma/client.js';
import { violatesUnique } from '../../prisma/errors.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { creditUnits } from '../notifications/sms/sms-accounts.service.js';
import { bundleAmount, effectiveUnitPrice } from '../notifications/sms/sms-math.js';

export interface SmsPurchaseView {
  id: string;
  units: number;
  amount: string;
  state: 'PENDING' | 'PAID' | 'FAILED';
  mpesaReceipt: string | null;
  createdAt: Date;
  paidAt: Date | null;
}

/**
 * KodiHub SMS bundles bought by M-Pesa (spec §5). Credits units exactly once per M-Pesa receipt
 * and never touches platform invoices or platform payments.
 */
@Injectable()
export class SmsPurchasesService {
  private readonly log = new Logger(SmsPurchasesService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly notifications: NotificationsService,
  ) {}

  view(p: SmsPurchase): SmsPurchaseView {
    return {
      id: p.id,
      units: p.units,
      amount: p.amount.toString(),
      state: p.state,
      mpesaReceipt: p.mpesaReceipt,
      createdAt: p.createdAt,
      paidAt: p.paidAt,
    };
  }

  /** The organisation's price per unit and the bundles on offer. */
  async quote(orgId: string) {
    const [settings, account] = await Promise.all([
      this.db.platformSettings.findUnique({
        where: { id: 1 },
        select: { smsUnitPrice: true, smsBundles: true, smsMinUnits: true },
      }),
      this.db.smsAccount.findUnique({ where: { orgId }, select: { unitPrice: true } }),
    ]);
    const unitPrice = effectiveUnitPrice(
      { unitPrice: account?.unitPrice ?? null },
      { smsUnitPrice: settings?.smsUnitPrice ?? 80n },
    );
    const bundles = settings?.smsBundles ?? [500, 1000, 5000];
    return {
      unitPrice,
      minUnits: settings?.smsMinUnits ?? 100,
      bundles: bundles.map((units) => ({
        units,
        amount: bundleAmount(units, unitPrice).toString(),
      })),
    };
  }

  async createPending(p: {
    orgId: string;
    units: number;
    unitPrice: bigint;
    phone: string;
    requestedById: string;
  }): Promise<SmsPurchase> {
    return this.db.smsPurchase.create({
      data: {
        orgId: p.orgId,
        units: p.units,
        unitPrice: p.unitPrice,
        amount: bundleAmount(p.units, p.unitPrice),
        phone: p.phone,
        source: 'STK',
        requestedById: p.requestedById,
      },
    });
  }

  async get(orgId: string, id: string): Promise<SmsPurchaseView> {
    const p = await this.db.smsPurchase.findFirst({ where: { id, orgId } });
    if (!p) throw AppError.notFound('SMS purchase');
    return this.view(p);
  }

  async byStk(stkRequestId: string): Promise<SmsPurchase | null> {
    return this.db.smsPurchase.findUnique({ where: { stkRequestId } });
  }

  async markFailed(stkRequestId: string): Promise<void> {
    await this.db.smsPurchase.updateMany({
      where: { stkRequestId, state: 'PENDING' },
      data: { state: 'FAILED' },
    });
  }

  /** M-Pesa confirmed the prompt: credit the units bought, at the price stored on the purchase. */
  async creditFromStk(stkRequestId: string, receipt: string): Promise<void> {
    const purchase = await this.byStk(stkRequestId);
    if (!purchase || purchase.state === 'PAID') return;
    const ref = receipt.toUpperCase();
    if (await this.db.smsPurchase.findUnique({ where: { mpesaReceipt: ref } })) return;
    let balance: number | null = null;
    try {
      balance = await this.db.$transaction(async (tx) => {
        const claimed = await tx.smsPurchase.updateMany({
          where: { id: purchase.id, state: { not: 'PAID' } },
          data: { state: 'PAID', mpesaReceipt: ref, paidAt: new Date() },
        });
        if (claimed.count !== 1) return null;
        return this.credit(tx, purchase.orgId, purchase.units, purchase.id);
      });
    } catch (e) {
      if (violatesUnique(e, 'mpesaReceipt')) return; // the same receipt already arrived by C2B
      throw e;
    }
    if (balance !== null) await this.tellOwners(purchase.orgId, purchase.units, balance);
  }

  /** Paybill payment with account "SMS<billing ref>": units = amount ÷ the organisation's price. */
  async creditFromC2b(billingRef: string, receipt: string, amount: bigint): Promise<void> {
    const org = await this.db.organization.findUnique({
      where: { billingRef },
      select: { id: true },
    });
    if (!org) {
      this.log.warn({ receipt }, 'SMS paybill payment with an unknown account number');
      return;
    }
    const ref = receipt.toUpperCase();
    if (await this.db.smsPurchase.findUnique({ where: { mpesaReceipt: ref } })) return;
    const { unitPrice } = await this.quote(org.id);
    const units = Number(amount / unitPrice);
    if (units <= 0) {
      this.log.warn({ receipt, amount }, 'SMS paybill payment too small for one unit');
      return;
    }
    let balance: number;
    try {
      balance = await this.db.$transaction(async (tx) => {
        const p = await tx.smsPurchase.create({
          data: {
            orgId: org.id,
            units,
            unitPrice,
            amount,
            state: 'PAID',
            mpesaReceipt: ref,
            source: 'C2B',
            paidAt: new Date(),
          },
        });
        return this.credit(tx, org.id, units, p.id);
      });
    } catch (e) {
      if (violatesUnique(e, 'mpesaReceipt')) return;
      throw e;
    }
    await this.tellOwners(org.id, units, balance);
  }

  private async credit(
    tx: Parameters<Parameters<Db['$transaction']>[0]>[0],
    orgId: string,
    units: number,
    purchaseId: string,
  ): Promise<number> {
    const balance = await creditUnits(tx, orgId, units, { kind: 'PURCHASE', purchaseId });
    await tx.smsAccount.update({
      where: { orgId },
      data: { emptyWarnedOn: null, lowWarnedOn: null },
    });
    return balance;
  }

  private async tellOwners(orgId: string, units: number, balance: number): Promise<void> {
    const body = `${units.toLocaleString('en-KE')} SMS units added. You now have ${balance.toLocaleString('en-KE')} units.`;
    await this.notifications.notifyOwners(
      orgId,
      { kind: 'sms_bought', title: 'SMS units added', body },
      { subject: 'SMS units added', text: `${body}\n\nThank you for buying KodiHub SMS.` },
    );
  }
}
