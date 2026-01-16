/**
 * @fileoverview Local JWT Token Generator
 *
 * Generates mock JWT tokens for local development testing.
 * Supports multiple user personas including multi-tenant scenarios.
 *
 * @remarks
 * Usage:
 * ```bash
 * npm run token:auditor      # Internal auditor
 * npm run token:compliance   # Internal compliance lead
 * npm run token:admin        # Internal admin
 * npm run token:external     # External location admin
 * ```
 */

import * as jwt from 'jsonwebtoken';

/* -------------------------------------------------------------------------- */
/*                              Configuration                                  */
/* -------------------------------------------------------------------------- */

/** Local development secret - NEVER use in production */
const LOCAL_SECRET = 'local-dev-secret-do-not-use-in-prod';

/** Local mock issuer URL */
const ISSUER = 'http://localhost:3000';

/* -------------------------------------------------------------------------- */
/*                              Token Configurations                           */
/* -------------------------------------------------------------------------- */

interface TokenConfig {
    sub: string;
    groups: string[];
    tenantId: string;
    tenantType: 'internal' | 'external';
    expiresIn: string;
}

/**
 * Predefined token configurations for different user personas.
 */
const tokenConfigs: Record<string, TokenConfig> = {
    /**
     * Internal RCM auditor - base field access only
     */
    auditor: {
        sub: 'local-auditor-user',
        groups: ['auditor'],
        tenantId: 'rcm-internal',
        tenantType: 'internal',
        expiresIn: '24h',
    },

    /**
     * Internal RCM compliance lead - full field access
     */
    compliance: {
        sub: 'local-compliance-user',
        groups: ['compliance_lead'],
        tenantId: 'rcm-internal',
        tenantType: 'internal',
        expiresIn: '24h',
    },

    /**
     * Internal RCM admin - can trigger reindex
     */
    admin: {
        sub: 'local-admin-user',
        groups: ['admin', 'compliance_lead'],
        tenantId: 'rcm-internal',
        tenantType: 'internal',
        expiresIn: '24h',
    },

    /**
     * External location admin - isolated to their tenant
     */
    external: {
        sub: 'external-admin-user',
        groups: ['admin'],
        tenantId: 'loc-test-001',
        tenantType: 'external',
        expiresIn: '24h',
    },
};

/* -------------------------------------------------------------------------- */
/*                              Token Generation                               */
/* -------------------------------------------------------------------------- */

/**
 * Generates a signed JWT token for the specified role.
 *
 * @param role - One of: auditor, compliance, admin, external
 * @returns Signed JWT token string
 */
function generateToken(role: string): string {
    const config = tokenConfigs[role];

    if (!config) {
        console.error(`Unknown role: ${role}`);
        console.error(`Available roles: ${Object.keys(tokenConfigs).join(', ')}`);
        process.exit(1);
    }

    const payload = {
        sub: config.sub,
        'cognito:groups': config.groups,
        tenant_id: config.tenantId,
        tenant_type: config.tenantType,
        iat: Math.floor(Date.now() / 1000),
    };

    const token = jwt.sign(payload, LOCAL_SECRET, {
        issuer: ISSUER,
        expiresIn: config.expiresIn as jwt.SignOptions['expiresIn'],
    });

    return token;
}

/* -------------------------------------------------------------------------- */
/*                              Main Entrypoint                                */
/* -------------------------------------------------------------------------- */

const role = process.argv[2] || 'auditor';
const token = generateToken(role);

// Output only the token (for use in shell scripts)
console.log(token);
