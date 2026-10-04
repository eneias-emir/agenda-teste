import 'reflect-metadata';
import { Body, Controller, Delete, Get, Inject, Injectable, Module, NotFoundException, Param, ParseIntPipe, Post, Put, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import { asc, eq, sql } from 'drizzle-orm';
import { Database } from './db/database';
import { contacts } from './db/schema';

class ContactDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 100)
  name!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(3, 30) @Matches(/^[+\d\s().-]+$/)
  phone!: string;
}

@Injectable()
class ContactsService {
  constructor(@Inject(Database) private readonly database: Database) {}
  list() { return this.database.db.select().from(contacts).orderBy(asc(contacts.name), asc(contacts.id)); }
  async create(data: ContactDto) { return (await this.database.db.insert(contacts).values(data).returning())[0]; }
  async update(id: number, data: ContactDto) {
    const [contact] = await this.database.db.update(contacts).set(data).where(eq(contacts.id, id)).returning();
    if (!contact) throw new NotFoundException('Contato não encontrado');
    return contact;
  }
  async remove(id: number) {
    const [contact] = await this.database.db.delete(contacts).where(eq(contacts.id, id)).returning();
    if (!contact) throw new NotFoundException('Contato não encontrado');
    return contact;
  }
}

@Controller('contacts')
class ContactsController {
  constructor(@Inject(ContactsService) private readonly service: ContactsService) {}
  @Get() list() { return this.service.list(); }
  @Post() create(@Body() data: ContactDto) { return this.service.create(data); }
  @Put(':id') update(@Param('id', ParseIntPipe) id: number, @Body() data: ContactDto) { return this.service.update(id, data); }
  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number) { return this.service.remove(id); }
}

@Controller('health')
class HealthController {
  constructor(@Inject(Database) private readonly database: Database) {}
  @Get() async check() { await this.database.db.execute(sql`select 1`); return { status: 'ok' }; }
}

@Module({ controllers: [ContactsController, HealthController], providers: [Database, ContactsService] })
class AppModule {}

async function bootstrap() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL é obrigatória');
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  await app.listen(3000, '0.0.0.0');
}
bootstrap().catch(error => { console.error(error); process.exit(1); });
