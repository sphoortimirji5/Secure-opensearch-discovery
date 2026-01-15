import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
    sub: string;
    'cognito:groups'?: string[];
    iat?: number;
    exp?: number;
}

export interface AuthenticatedUser {
    userId: string;
    roles: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private configService: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('JWT_SECRET') || 'local-dev-secret-do-not-use-in-prod',
            issuer: configService.get<string>('JWT_ISSUER'),
        });
    }

    async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
        return {
            userId: payload.sub,
            roles: payload['cognito:groups'] || [],
        };
    }
}
