import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import type { Response } from 'supertest';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module';

describe('MemberSearch E2E Tests', () => {
    let app: INestApplication;

    const JWT_SECRET = 'local-dev-secret-do-not-use-in-prod';
    const JWT_ISSUER = 'http://localhost:3000';

    // Generate test tokens
    const generateToken = (role: string): string => {
        return jwt.sign(
            { sub: `test-${role}`, 'cognito:groups': [role] },
            JWT_SECRET,
            { issuer: JWT_ISSUER, expiresIn: '1h' }
        );
    };

    const auditorToken = generateToken('auditor');
    const complianceToken = generateToken('compliance_lead');

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('Authentication', () => {
        it('GET /search - should return 401 without JWT', () => {
            return request(app.getHttpServer())
                .get('/search?q=test')
                .expect(401);
        });

        it('GET /search - should return 401 with invalid JWT', () => {
            return request(app.getHttpServer())
                .get('/search?q=test')
                .set('Authorization', 'Bearer invalid-token')
                .expect(401);
        });

        it('GET /search - should accept valid auditor JWT', () => {
            return request(app.getHttpServer())
                .get('/search?q=test')
                .set('Authorization', `Bearer ${auditorToken}`)
                .expect((res: Response) => {
                    // May return 200 or 500 depending on OpenSearch availability
                    // But should NOT return 401
                    expect(res.status).not.toBe(401);
                });
        });

        it('GET /search - should accept valid compliance JWT', () => {
            return request(app.getHttpServer())
                .get('/search?q=test')
                .set('Authorization', `Bearer ${complianceToken}`)
                .expect((res: Response) => {
                    expect(res.status).not.toBe(401);
                });
        });
    });

    describe('Health Endpoint', () => {
        it('GET /search/health - should return health status without auth', () => {
            return request(app.getHttpServer())
                .get('/search/health')
                .expect(200)
                .expect((res: Response) => {
                    expect(res.body).toHaveProperty('status', 'ok');
                });
        });
    });

    describe('Metrics Endpoint', () => {
        it('GET /metrics - should return Prometheus metrics', () => {
            return request(app.getHttpServer())
                .get('/metrics')
                .expect(200)
                .expect((res: Response) => {
                    expect(res.text).toContain('process_cpu');
                    expect(res.text).toContain('nodejs_heap');
                });
        });
    });
});
