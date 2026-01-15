/**
 * Generate mock JWT tokens for local development
 * Usage: ts-node scripts/generate-local-jwt.ts [auditor|compliance]
 */

import * as jwt from 'jsonwebtoken';

const LOCAL_SECRET = 'local-dev-secret-do-not-use-in-prod';
const ISSUER = 'http://localhost:3000';

interface TokenConfig {
    sub: string;
    groups: string[];
    expiresIn: string;
}

const tokenConfigs: Record<string, TokenConfig> = {
    auditor: {
        sub: 'local-auditor-user',
        groups: ['auditor'],
        expiresIn: '24h',
    },
    compliance: {
        sub: 'local-compliance-user',
        groups: ['compliance_lead'],
        expiresIn: '24h',
    },
};

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
        iat: Math.floor(Date.now() / 1000),
    };

    const token = jwt.sign(payload, LOCAL_SECRET, {
        issuer: ISSUER,
        expiresIn: config.expiresIn as jwt.SignOptions['expiresIn'],
    });

    return token;
}

// Main
const role = process.argv[2] || 'auditor';
const token = generateToken(role);

// Output only the token (for use in scripts)
console.log(token);
