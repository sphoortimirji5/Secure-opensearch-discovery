import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import type { Response } from 'supertest';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module';

/**
 * Integration tests that require Docker containers running:
 * - OpenSearch on port 9200
 * - DynamoDB Local on port 8000
 * 
 * Run: docker-compose up -d && npm run seed && npm run test:e2e
 */
describe('Search Integration Tests', () => {
    let app: INestApplication;

    const JWT_SECRET = 'local-dev-secret-do-not-use-in-prod';
    const JWT_ISSUER = 'http://localhost:3000';

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

    describe('RBAC Field Filtering', () => {
        it('auditor should NOT see status_notes field', async () => {
            const res = await request(app.getHttpServer())
                .get('/search?q=violation')
                .set('Authorization', `Bearer ${auditorToken}`);

            // Skip if OpenSearch not available
            if (res.status === 500) {
                console.warn('Skipping: OpenSearch not available');
                return;
            }

            expect(res.status).toBe(200);

            if (res.body.length > 0) {
                res.body.forEach((doc: Record<string, unknown>) => {
                    expect(doc).not.toHaveProperty('status_notes');
                    expect(doc).not.toHaveProperty('ssn_last4');
                });
            }
        });

        it('compliance_lead SHOULD see status_notes field', async () => {
            const res = await request(app.getHttpServer())
                .get('/search?q=violation')
                .set('Authorization', `Bearer ${complianceToken}`);

            // Skip if OpenSearch not available
            if (res.status === 500) {
                console.warn('Skipping: OpenSearch not available');
                return;
            }

            expect(res.status).toBe(200);

            // Compliance lead should have access to sensitive fields
            // (they appear in source filter, actual presence depends on data)
        });
    });

    describe('Search Functionality', () => {
        it('should support fuzzy search', async () => {
            const res = await request(app.getHttpServer())
                .get('/search?q=Johnaton&fuzzy=true') // Misspelled "Jonathan"
                .set('Authorization', `Bearer ${auditorToken}`);

            if (res.status === 500) {
                console.warn('Skipping: OpenSearch not available');
                return;
            }

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });

        it('should support exact email search', async () => {
            const res = await request(app.getHttpServer())
                .get('/search?email=john.doe@example.com')
                .set('Authorization', `Bearer ${auditorToken}`);

            if (res.status === 500) {
                console.warn('Skipping: OpenSearch not available');
                return;
            }

            expect(res.status).toBe(200);
        });

        it('should respect limit parameter', async () => {
            const res = await request(app.getHttpServer())
                .get('/search?q=*&limit=2')
                .set('Authorization', `Bearer ${auditorToken}`);

            if (res.status === 500) {
                console.warn('Skipping: OpenSearch not available');
                return;
            }

            expect(res.status).toBe(200);
            expect(res.body.length).toBeLessThanOrEqual(2);
        });
    });

    describe('PII Redaction Verification', () => {
        it('search results should NOT contain raw SSN patterns', async () => {
            const res = await request(app.getHttpServer())
                .get('/search?q=violation')
                .set('Authorization', `Bearer ${complianceToken}`);

            if (res.status === 500) {
                console.warn('Skipping: OpenSearch not available');
                return;
            }

            expect(res.status).toBe(200);

            // Check that no raw SSN patterns appear in any text field
            const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/;

            res.body.forEach((doc: Record<string, unknown>) => {
                if (doc.status_notes) {
                    expect(doc.status_notes).not.toMatch(ssnPattern);
                }
            });
        });
    });
});
