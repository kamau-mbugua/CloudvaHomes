import {
  emptyContext,
  runWithContext,
  withoutOrgScope,
} from '../common/context/request-context.js';
import { OrgScopeViolation, orgScopeExtension } from './org-scope.extension.js';

// Pull the query hook out of the extension definition and drive it with a fake `query`.
type Hook = (p: {
  model: string;
  operation: string;
  args: unknown;
  query: (a: unknown) => unknown;
}) => Promise<unknown>;
const ext = (typeof orgScopeExtension === 'function' ? null : orgScopeExtension) as unknown;
let hook: Hook;

beforeAll(() => {
  // defineExtension returns a function of the client; call it with a stub that captures args.
  const captured: { query?: { $allModels: { $allOperations: Hook } } } = {};
  (orgScopeExtension as unknown as (c: unknown) => unknown)({
    $extends: (def: typeof captured) => {
      Object.assign(captured, def);
      return def;
    },
  });
  hook = captured.query!.$allModels.$allOperations;
  expect(ext).toBeNull();
});

const ORG = '00000000-0000-7000-8000-000000000001';
const run = (model: string, operation: string, args: unknown, orgId: string | null = ORG) =>
  runWithContext(emptyContext({ orgId }), () =>
    hook({ model, operation, args, query: async (a) => a }),
  );

describe('org-scope extension', () => {
  it('ANDs orgId into reads and bulk writes', async () => {
    expect(await run('Role', 'findMany', { where: { name: 'x' } })).toEqual({
      where: { AND: [{ name: 'x' }, { orgId: ORG }] },
    });
    expect(await run('Membership', 'count', {})).toEqual({ where: { orgId: ORG } });
    expect(await run('Role', 'deleteMany', { where: { id: 'r' } })).toEqual({
      where: { AND: [{ id: 'r' }, { orgId: ORG }] },
    });
  });

  it('adds orgId to unique lookups so foreign ids miss', async () => {
    expect(await run('Role', 'findUnique', { where: { id: 'r' } })).toEqual({
      where: { id: 'r', orgId: ORG },
    });
    expect(await run('Role', 'update', { where: { id: 'r' }, data: { name: 'n' } })).toEqual({
      where: { id: 'r', orgId: ORG },
      data: { name: 'n' },
    });
  });

  it('stamps creates and refuses writes for another organisation', async () => {
    expect(await run('Role', 'create', { data: { name: 'n' } })).toEqual({
      data: { name: 'n', orgId: ORG },
    });
    expect(await run('Role', 'createMany', { data: [{ name: 'a' }] })).toEqual({
      data: [{ name: 'a', orgId: ORG }],
    });
    await expect(
      run('Role', 'create', { data: { name: 'n', orgId: 'other' } }),
    ).rejects.toBeInstanceOf(OrgScopeViolation);
  });

  it('leaves global models and org-less contexts alone', async () => {
    expect(await run('User', 'findMany', { where: { id: 'u' } })).toEqual({ where: { id: 'u' } });
    expect(await run('Role', 'findMany', { where: { id: 'r' } }, null)).toEqual({
      where: { id: 'r' },
    });
    const scoped = runWithContext(emptyContext({ orgId: ORG }), () =>
      withoutOrgScope(() =>
        hook({ model: 'Role', operation: 'findMany', args: {}, query: async (a) => a }),
      ),
    );
    expect(await scoped).toEqual({});
  });
});
