import { Injectable } from '@nestjs/common';
import { FieldCipher, maskHint, normalizeIdNumber } from '../../common/crypto/field-cipher.js';

export type IdOwner = 'tenant' | 'landlord';

export interface SealedIdNumber {
  idNumberEnc: Uint8Array<ArrayBuffer> | null;
  idNumberIndex: string | null;
  idNumberHint: string | null;
}

/**
 * National ID / passport numbers at rest (design §8): encrypted, bound to the organisation
 * and record kind, with a keyed hash for duplicate checks and a 3-character hint for display.
 */
@Injectable()
export class IdNumbers {
  constructor(private readonly cipher: FieldCipher) {}

  /** Normalised value, or null for an empty/blank input (= clear the field). */
  normalize(raw: string | null | undefined): string | null {
    const value = raw ? normalizeIdNumber(raw) : '';
    return value || null;
  }

  index(normalised: string, orgId: string, owner: IdOwner): string {
    return this.cipher.blindIndex(normalised, `${orgId}:${owner}`);
  }

  seal(normalised: string | null, orgId: string, owner: IdOwner): SealedIdNumber {
    if (!normalised) return { idNumberEnc: null, idNumberIndex: null, idNumberHint: null };
    return {
      idNumberEnc: this.cipher.encrypt(normalised, `${orgId}:${owner}.idNumber`),
      idNumberIndex: this.index(normalised, orgId, owner),
      idNumberHint: normalised.slice(-3),
    };
  }

  reveal(enc: Uint8Array | null, orgId: string, owner: IdOwner): string | null {
    return enc ? this.cipher.decrypt(enc, `${orgId}:${owner}.idNumber`) : null;
  }

  masked(hint: string | null): string | null {
    return maskHint(hint);
  }
}
