import { currentContext } from '../../common/context/request-context.js';

/** The active organisation, with or without a signed-in user (scheduled jobs have none). */
export function activeOrgId(): string {
  const orgId = currentContext()?.orgId;
  if (!orgId) throw new Error('No active organisation');
  return orgId;
}
