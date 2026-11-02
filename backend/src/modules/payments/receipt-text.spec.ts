import { paymentReceiptText } from '../notifications/notifications.service.js';
import { LogPushSender, outbox, parseServiceAccountJson } from '../notifications/senders.js';
import { balanceText } from './payments.service.js';

describe('receipt wording', () => {
  it('describes what is owed', () => {
    expect(balanceText(120000n)).toBe('Balance KES 1,200.00');
    expect(balanceText(-30000n)).toBe('Credit KES 300.00');
    expect(balanceText(0n)).toBe('Nothing owing');
  });

  it('fits one SMS even with a long organisation name', () => {
    const text = paymentReceiptText({
      amount: '1,234,567.89',
      number: 'RCT-2026-000012',
      balance: 'Balance KES 1,234,567.89',
      organizationName: 'A Very Long Property Management Agency Name Limited of Nairobi',
    });
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text.startsWith('Received KES 1,234,567.89 ref RCT-2026-000012.')).toBe(true);
  });

  it('records push notifications in the outbox and parses FCM service account JSON', async () => {
    const sender = new LogPushSender(false);
    const res = await sender.send({
      token: 'fcm-device-token-123456',
      title: 'Payment received · KES 25,000.00',
      body: 'Receipt RCT-2026-000012',
      data: { kind: 'PAYMENT_RECEIVED', actionUrl: '/tenant/payments' },
    });
    expect(res.sent).toBe(true);
    const last = outbox.at(-1);
    expect(last?.channel).toBe('push');
    if (last?.channel === 'push') {
      expect(last.to).toBe('fcm-device-token-123456');
      expect(last.data?.kind).toBe('PAYMENT_RECEIVED');
    }

    const saJson = JSON.stringify({
      project_id: 'kodihub-prod',
      client_email: 'firebase-adminsdk@kodihub-prod.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
    });
    const parsedRaw = parseServiceAccountJson(saJson);
    expect(parsedRaw.project_id).toBe('kodihub-prod');
    expect(parsedRaw.private_key).toContain('\nabc\n');

    const parsedB64 = parseServiceAccountJson(Buffer.from(saJson, 'utf8').toString('base64'));
    expect(parsedB64.client_email).toBe('firebase-adminsdk@kodihub-prod.iam.gserviceaccount.com');
  });
});
