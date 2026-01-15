import { Module } from '@nestjs/common';
import { MembersRepository } from './members.repository';

@Module({
    providers: [MembersRepository],
    exports: [MembersRepository],
})
export class MembersModule { }
