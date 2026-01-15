import { RolesGuard, ROLES_KEY } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';

describe('RolesGuard', () => {
    let guard: RolesGuard;
    let reflector: Reflector;

    beforeEach(() => {
        reflector = new Reflector();
        guard = new RolesGuard(reflector);
    });

    const createMockContext = (user: { roles: string[] } | null): ExecutionContext => ({
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
            getRequest: () => ({ user }),
            getResponse: jest.fn(),
            getNext: jest.fn(),
        }),
        getType: jest.fn(),
        getArgs: jest.fn(),
        getArgByIndex: jest.fn(),
        switchToRpc: jest.fn(),
        switchToWs: jest.fn(),
    } as unknown as ExecutionContext);

    it('should allow access when no roles are required', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
        const context = createMockContext({ roles: ['auditor'] });

        expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when user has required role', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['auditor']);
        const context = createMockContext({ roles: ['auditor'] });

        expect(guard.canActivate(context)).toBe(true);
    });

    it('should deny access when user lacks required role', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['compliance_lead']);
        const context = createMockContext({ roles: ['auditor'] });

        expect(guard.canActivate(context)).toBe(false);
    });

    it('should deny access when no user is present', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['auditor']);
        const context = createMockContext(null);

        expect(guard.canActivate(context)).toBe(false);
    });

    it('should allow access with any matching role', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['auditor', 'compliance_lead']);
        const context = createMockContext({ roles: ['compliance_lead'] });

        expect(guard.canActivate(context)).toBe(true);
    });
});
