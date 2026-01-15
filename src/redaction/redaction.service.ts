import { Injectable } from '@nestjs/common';

interface RedactionPattern {
    regex: RegExp;
    replacement: string;
}

@Injectable()
export class RedactionService {
    private readonly patterns: RedactionPattern[] = [
        // SSN: 123-45-6789 or 123456789
        { regex: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, replacement: '[SSN-REDACTED]' },

        // Phone: 555-123-4567, (555) 123-4567, 5551234567
        { regex: /\b(\+1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g, replacement: '[PHONE-REDACTED]' },

        // Email
        { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL-REDACTED]' },

        // Credit card (basic pattern)
        { regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: '[CC-REDACTED]' },
    ];

    /**
     * Redact PII from a string
     */
    redact(input: string): string {
        if (!input) return input;

        let result = input;
        for (const pattern of this.patterns) {
            result = result.replace(pattern.regex, pattern.replacement);
        }
        return result;
    }

    /**
     * Redact PII from an object's string fields (shallow)
     */
    redactObject<T extends Record<string, unknown>>(obj: T, fields: (keyof T)[]): T {
        const result = { ...obj };
        for (const field of fields) {
            if (typeof result[field] === 'string') {
                result[field] = this.redact(result[field] as string) as T[keyof T];
            }
        }
        return result;
    }

    /**
     * Check if a string contains potential PII
     */
    containsPII(input: string): boolean {
        if (!input) return false;
        return this.patterns.some(pattern => pattern.regex.test(input));
    }
}
