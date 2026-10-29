import { InvalidEnvError, parseEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(40),
  FIELD_ENCRYPTION_KEYS: `k1:${Buffer.alloc(32, 1).toString('base64')}`,
  FIELD_INDEX_KEY: Buffer.alloc(32, 2).toString('base64'),
};

describe('parseEnv', () => {
  it('applies defaults for a minimal development env', () => {
    const env = parseEnv(base);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 8080,
      LOG_LEVEL: 'debug',
      CORS_ORIGINS: [],
      ENABLE_DOCS: true,
    });
  });

  it('defaults production to info logs and docs off', () => {
    const env = parseEnv({ ...base, NODE_ENV: 'production', STORAGE_BUCKET: 'hodi-files' });
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.ENABLE_DOCS).toBe(false);
  });

  it('lets production opt in to docs', () => {
    expect(
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        STORAGE_BUCKET: 'hodi-files',
        ENABLE_DOCS: 'true',
      }).ENABLE_DOCS,
    ).toBe(true);
  });

  it('splits and trims CORS origins', () => {
    const env = parseEnv({ ...base, CORS_ORIGINS: ' https://a.test , ,https://b.test' });
    expect(env.CORS_ORIGINS).toEqual(['https://a.test', 'https://b.test']);
  });

  it('reports every problem at once', () => {
    try {
      parseEnv({ DATABASE_URL: 'mysql://x', PORT: '99999', NODE_ENV: 'staging' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidEnvError);
      const issues = (e as InvalidEnvError).issues.join('\n');
      expect(issues).toMatch(/DATABASE_URL/);
      expect(issues).toMatch(/PORT/);
      expect(issues).toMatch(/NODE_ENV/);
    }
  });

  it('requires DATABASE_URL', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: '  ' })).toThrow(/DATABASE_URL/);
  });

  it('treats empty values (KEY= in .env) as unset', () => {
    const env = parseEnv({ ...base, ENABLE_DOCS: '', GCP_PROJECT_ID: '', LOG_LEVEL: '', PORT: '' });
    expect(env).toMatchObject({ ENABLE_DOCS: true, PORT: 8080, LOG_LEVEL: 'debug' });
    expect(env.GCP_PROJECT_ID).toBeUndefined();
  });

  it('requires a long JWT secret', () => {
    expect(() => parseEnv({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => parseEnv({ ...base, FIELD_ENCRYPTION_KEYS: 'k1:c2hvcnQ=' })).toThrow(
      /FIELD_ENCRYPTION_KEYS/,
    );
    expect(() => parseEnv({ ...base, FIELD_INDEX_KEY: 'c2hvcnQ=' })).toThrow(/FIELD_INDEX_KEY/);
    expect(() => parseEnv({ ...base, NODE_ENV: 'production', DARAJA_MODE: 'simulated' })).toThrow(
      /DARAJA_MODE/,
    );
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow(/STORAGE_BUCKET/);
    const prod = parseEnv({ ...base, NODE_ENV: 'production', STORAGE_BUCKET: 'hodi-files' });
    expect(prod).toMatchObject({ DARAJA_MODE: 'live', STORAGE_DRIVER: 'gcs' });
    expect(parseEnv(base).STORAGE_DRIVER).toBe('local');
    expect(parseEnv(base).DARAJA_MODE).toBe('simulated');
  });

  it('defaults messaging to the log adapters and proxy hops to 0', () => {
    expect(parseEnv(base)).toMatchObject({
      SMS_PROVIDER: 'log',
      EMAIL_PROVIDER: 'log',
      TRUST_PROXY_HOPS: 0,
    });
  });

  it('requires provider credentials when a real provider is chosen', () => {
    expect(() => parseEnv({ ...base, SMS_PROVIDER: 'africastalking' })).toThrow(
      /AT_USERNAME[\s\S]*AT_API_KEY/,
    );
    expect(() =>
      parseEnv({ ...base, EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.example.invalid' }),
    ).toThrow(/SMTP_USER[\s\S]*SMTP_PASS/);
    expect(
      parseEnv({ ...base, SMS_PROVIDER: 'africastalking', AT_USERNAME: 'sandbox', AT_API_KEY: 'k' })
        .SMS_PROVIDER,
    ).toBe('africastalking');
  });

  it('allows local file storage in production only on an absolute (persistent) path', () => {
    const prod = { ...base, NODE_ENV: 'production', STORAGE_DRIVER: 'local' };
    expect(() => parseEnv(prod)).toThrow(/STORAGE_DIR/);
    expect(parseEnv({ ...prod, STORAGE_DIR: '/var/lib/hodi/files' }).STORAGE_DRIVER).toBe('local');
  });

  it('requires a long jobs secret when one is set', () => {
    expect(() => parseEnv({ ...base, JOBS_SHARED_SECRET: 'short' })).toThrow(/JOBS_SHARED_SECRET/);
    expect(
      parseEnv({ ...base, JOBS_SHARED_SECRET: 's'.repeat(40) }).JOBS_SHARED_SECRET,
    ).toHaveLength(40);
  });
});
