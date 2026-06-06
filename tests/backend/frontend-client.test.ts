import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

describe('frontend InsForge integration helper', () => {
  it('stores both storage URL and key before invoking the analyze function', () => {
    const source = readFileSync('track_1_frontend/insforgeAgentClient.ts', 'utf8');

    expect(source).toMatch(/storage\s*\.\s*from\('repair-photos'\)/);
    expect(source).toContain('image_url: upload.data.url');
    expect(source).toContain('image_key: upload.data.key');
    expect(source).toContain("functions.invoke('analyze'");
    expect(source).toContain('.insert([');
  });

  it('ships a browser adapter for the deployed frontend flow', async () => {
    const servicePath = 'frontend/services/insforgeApi.js';

    expect(existsSync(servicePath), 'frontend/services/insforgeApi.js should exist').toBe(true);
    if (!existsSync(servicePath)) return;

    const source = readFileSync(servicePath, 'utf8');
    expect(source).toContain("const REPAIR_PHOTO_BUCKET = 'repair-photos'");
    expect(source).toMatch(/storage\s*\.\s*from\(REPAIR_PHOTO_BUCKET\)/);
    expect(source).toContain("database.from('repair_requests')");
    expect(source).toContain('image_url: upload.data.url');
    expect(source).toContain('image_key: upload.data.key');
    expect(source).toContain("functions.invoke('analyze'");
    expect(source).toContain("functions.invoke('search-contractors'");
    expect(source).toContain("functions.invoke('notify-contractors'");
    expect(source).toContain("functions.invoke('status'");
  });

  it('uses the real InsForge adapter from the Vercel frontend entrypoint', () => {
    const source = readFileSync('frontend/app.js', 'utf8');

    expect(source).toContain("./services/insforgeApi.js");
    expect(source).not.toContain("./services/mockApi.js");
  });

  it('requires frontend auth and exposes Google OAuth when InsForge is configured', () => {
    const appSource = readFileSync('frontend/app.js', 'utf8');
    const serviceSource = readFileSync('frontend/services/insforgeApi.js', 'utf8');

    expect(serviceSource).toContain("signInWithOAuth('google'");
    expect(serviceSource).toContain('signInWithGoogle');
    expect(serviceSource).toContain('verifyEmail');
    expect(serviceSource).toContain('resendVerificationEmail');
    expect(appSource).toContain('name="otp"');
    expect(appSource).toContain('Verify Email');
    expect(appSource).toContain('Resend code');
    expect(appSource).toContain("refreshAuthState({ requireLogin: true })");
    expect(appSource).toContain('if (!requireSignedIn()) return;');
    expect(appSource).toContain('Continue with Google');
    expect(appSource).toContain('required: true');
  });

  it('verifies and resends email verification codes through the InsForge SDK', async () => {
    const serviceUrl = new URL('../../frontend/services/insforgeApi.js', import.meta.url).href;
    const { createRepairApi } = await import(serviceUrl);
    const verifyEmail = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@example.com', emailVerified: true }, accessToken: 'token' },
      error: null,
    });
    const resendVerificationEmail = vi.fn().mockResolvedValue({
      data: { success: true, message: 'Verification email sent' },
      error: null,
    });

    const api = createRepairApi({
      config: {
        baseUrl: 'https://pzv974n7.us-east.insforge.app',
        anonKey: 'anon',
        useMock: false,
      },
      insforge: {
        auth: {
          getCurrentUser: vi.fn(),
          verifyEmail,
          resendVerificationEmail,
        },
      },
    });

    await expect(api.verifyEmail({ email: 'test@example.com', otp: '123456' })).resolves.toEqual({
      user: { id: 'user-1', email: 'test@example.com', emailVerified: true },
      accessToken: 'token',
    });
    await expect(api.resendVerificationEmail({
      email: 'test@example.com',
      redirectTo: 'http://localhost:3000/',
    })).resolves.toEqual({ success: true, message: 'Verification email sent' });

    expect(verifyEmail).toHaveBeenCalledWith({ email: 'test@example.com', otp: '123456' });
    expect(resendVerificationEmail).toHaveBeenCalledWith({
      email: 'test@example.com',
      redirectTo: 'http://localhost:3000/',
    });
  });

  it('direct-uploads storage files and stores normalized metadata before analysis', async () => {
    const serviceUrl = new URL('../../frontend/services/insforgeApi.js', import.meta.url).href;
    const { createRepairApi } = await import(serviceUrl);
    const sdkUpload = vi.fn().mockResolvedValue({ data: { key: 'should-not-use-sdk' }, error: null });
    const directUpload = vi.fn().mockResolvedValue({
      bucket: 'repair-photos',
      key: 'users/user-1/requests/request-1/photo.jpg',
      size: 3,
      mimeType: 'image/jpeg',
      uploadedAt: '2026-06-06T19:41:13.000Z',
      url: '/api/storage/buckets/repair-photos/objects/users%2Fuser-1%2Frequests%2Frequest-1%2Fphoto.jpg',
    });
    const insertSelect = vi.fn().mockResolvedValue({ data: [{ id: 'request-1' }], error: null });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });
    const invoke = vi.fn().mockResolvedValue({
      data: {
        isIdentified: true,
        category: 'hvac',
        brand: 'Carrier',
        modelNumber: 'Infinity 26',
        messageToUser: 'Identified.',
        contractorSearchQuery: 'Carrier HVAC repair',
      },
      error: null,
    });

    const api = createRepairApi({
      config: {
        baseUrl: 'https://pzv974n7.us-east.insforge.app',
        anonKey: 'anon',
        useMock: false,
        locationText: 'San Francisco, CA',
      },
      cryptoImpl: { randomUUID: () => 'request-1' },
      insforge: {
        auth: {
          getCurrentUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
        },
        storage: {
          from: vi.fn().mockReturnValue({ upload: sdkUpload }),
        },
        getHttpClient: vi.fn().mockReturnValue({ request: directUpload }),
        database: {
          from: vi.fn().mockReturnValue({ insert }),
        },
        functions: { invoke },
      },
    });

    const result = await api.analyzeImage('blob:preview', 'medium', new File(['abc'], 'photo.jpg', { type: 'image/jpeg' }));

    expect(sdkUpload).not.toHaveBeenCalled();
    expect(directUpload).toHaveBeenCalledWith(
      'PUT',
      '/api/storage/buckets/repair-photos/objects/users%2Fuser-1%2Frequests%2Frequest-1%2Fphoto.jpg',
      expect.objectContaining({ body: expect.any(FormData), headers: {} }),
    );
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({
      image_key: 'users/user-1/requests/request-1/photo.jpg',
      image_url: 'https://pzv974n7.us-east.insforge.app/api/storage/buckets/repair-photos/objects/users%2Fuser-1%2Frequests%2Frequest-1%2Fphoto.jpg',
    })]);
    expect(invoke).toHaveBeenCalledWith('analyze', { body: { requestId: 'request-1' } });
    expect(result.imageKey).toBe('users/user-1/requests/request-1/photo.jpg');
  });

  it('optimizes camera PNGs and direct-uploads without hitting the presigned S3 path', async () => {
    const serviceUrl = new URL('../../frontend/services/insforgeApi.js', import.meta.url).href;
    const { createRepairApi } = await import(serviceUrl);
    const originalFile = new File(['original png bytes'], 'photo.png', { type: 'image/png' });
    const optimizedFile = new File(['compressed jpg'], 'photo.jpg', { type: 'image/jpeg' });
    const preparePhotoForUpload = vi.fn().mockResolvedValue(optimizedFile);
    const sdkUpload = vi.fn().mockResolvedValue({ data: { key: 'should-not-use-sdk' }, error: null });
    const directUpload = vi.fn().mockResolvedValue({
      bucket: 'repair-photos',
      key: 'users/user-1/requests/request-2/photo.jpg',
      size: optimizedFile.size,
      mimeType: optimizedFile.type,
      uploadedAt: '2026-06-06T20:10:00.000Z',
      url: '/api/storage/buckets/repair-photos/objects/users%2Fuser-1%2Frequests%2Frequest-2%2Fphoto.jpg',
    });
    const insertSelect = vi.fn().mockResolvedValue({ data: [{ id: 'request-2' }], error: null });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });

    const api = createRepairApi({
      config: {
        baseUrl: 'https://pzv974n7.us-east.insforge.app',
        anonKey: 'anon',
        useMock: false,
        locationText: 'San Francisco, CA',
      },
      cryptoImpl: { randomUUID: () => 'request-2' },
      preparePhotoForUpload,
      insforge: {
        auth: {
          getCurrentUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
        },
        storage: {
          from: vi.fn().mockReturnValue({ upload: sdkUpload }),
        },
        getHttpClient: vi.fn().mockReturnValue({ request: directUpload }),
        database: {
          from: vi.fn().mockReturnValue({ insert }),
        },
        functions: {
          invoke: vi.fn().mockResolvedValue({
            data: {
              isIdentified: true,
              category: 'hvac',
              brand: 'Carrier',
              modelNumber: 'Infinity 26',
              messageToUser: 'Identified.',
              contractorSearchQuery: 'Carrier HVAC repair',
            },
            error: null,
          }),
        },
      },
    });

    const result = await api.analyzeImage('blob:preview', 'medium', originalFile);

    expect(preparePhotoForUpload).toHaveBeenCalledWith(originalFile);
    expect(sdkUpload).not.toHaveBeenCalled();
    expect(directUpload).toHaveBeenCalledWith(
      'PUT',
      '/api/storage/buckets/repair-photos/objects/users%2Fuser-1%2Frequests%2Frequest-2%2Fphoto.jpg',
      expect.objectContaining({ body: expect.any(FormData), headers: {} }),
    );
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({
      image_key: 'users/user-1/requests/request-2/photo.jpg',
      image_url: 'https://pzv974n7.us-east.insforge.app/api/storage/buckets/repair-photos/objects/users%2Fuser-1%2Frequests%2Frequest-2%2Fphoto.jpg',
    })]);
    expect(result.imageKey).toBe('users/user-1/requests/request-2/photo.jpg');
  });
});
