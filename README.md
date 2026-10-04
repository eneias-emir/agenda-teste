# Agenda com Docker, Angular, NestJS e Drizzle

Deploy na VPS com Nginx, HTTPS Cloudflare e dois subdomínios: veja [deploy/README.md](deploy/README.md). Use `compose.vps.yaml` para a agenda na VPS e `deploy/proxy/compose.yaml` para o proxy compartilhado.

Containers gerenciados por Lazydocker

Agenda simples de nome e telefone, com inserção, alteração, exclusão e listagem. Sem autenticação.

## Arquitetura

```text
Navegador → localhost:8080 → frontend (Angular + Nginx)
                                    │ /api/*
                                    ▼
                               backend (NestJS :3000)
                                    │ Drizzle / pg
                                    ▼
                               db (PostgreSQL :5432)
                                    │
                               volume postgres_data
```

O Compose cria uma rede privada. Os nomes `backend` e `db` são resolvidos pelo DNS dessa rede. Somente o frontend publica uma porta no Windows. O Nginx encaminha `/api` sem remover esse prefixo; assim, o navegador usa a mesma origem e dispensa configuração de CORS. O backend aguarda o banco saudável, executa migrations versionadas do Drizzle e inicia o NestJS. O frontend aguarda a API saudável. As imagens são construídas em múltiplos estágios para separar compilação e execução.

## Pastas

```text
frontend/              Angular, Nginx e Dockerfile
backend/               NestJS e Dockerfile
  src/db/              Schema, conexão e executor de migrations
  drizzle/             Migrations SQL geradas pelo Drizzle Kit
compose.yaml           Serviços, rede, volume e healthchecks
.env.example           Configuração da demonstração
scripts/smoke.mjs      Teste HTTP de integração
scripts/persistence.mjs Teste de persistência entre recriações
```

## Executar no WSL (Ubuntu)

1. Habilite WSL 2 e a integração com Ubuntu no Docker Desktop. No terminal Ubuntu, `docker version` deve mostrar cliente e servidor, e `docker compose version` deve funcionar. Caso esteja usando Podman, é necessário um provedor Compose compatível.
2. Copie o projeto para o filesystem Linux (melhor desempenho que `/mnt/d`). No Ubuntu:

```bash
mkdir -p ~/projetos/agenda-demo
cp -r /mnt/d/temp/node/exemplo-api/. ~/projetos/agenda-demo/
cd ~/projetos/agenda-demo
cp .env.example .env
docker compose up -d --build --wait
docker compose ps
```

3. Abra **http://localhost:8080** no navegador do Windows. Cadastre, altere e exclua contatos pela tela. Se o encaminhamento localhost do WSL não funcionar, obtenha o IP com `hostname -I` no Ubuntu e abra `http://IP_DO_WSL:8080`.

Neste computador, o projeto também foi copiado para `/home/emitech/projetos/agenda-demo` no Ubuntu. O Docker instalado nesse Ubuntu exige privilégios administrativos; execute os comandos como `sudo docker compose ...` se aparecer `permission denied` no socket. O comando `docker` do Windows usa outro servidor (Podman), portanto use o terminal Ubuntu para gerenciar esta demonstração. Mantenha o terminal Ubuntu aberto durante o uso: os containers dependem da distribuição WSL estar em execução.

`FRONTEND_HOST=0.0.0.0` permite acessar pela interface do WSL. Para limitar a publicação ao loopback Linux, use `127.0.0.1` (o acesso pelo IP do WSL deixará de funcionar).

As credenciais padrão são apenas para demonstração local. Se alterar a senha, use caracteres seguros para URL ou codifique os caracteres especiais, pois ela compõe `DATABASE_URL`. Alterar a senha no `.env` não altera a senha de um banco já inicializado.

## Testes

O teste usa o Node 22 já presente no container backend, sem instalar Node no WSL:

```bash
docker compose exec -T -e BASE_URL=http://frontend backend node --input-type=module < scripts/smoke.mjs
```

Ele verifica a página Angular, a conexão com o banco, validação, CRUD e respostas 404. Cria um contato temporário e o remove ao final. Para testar pela porta publicada, com Node 22+ instalado:

```bash
node scripts/smoke.mjs
```

Para verificar persistência, crie um contato na tela e execute:

```bash
docker compose down
docker compose up -d --wait
```

O contato deve continuar na lista porque o volume não é removido. Para conferir os registros diretamente:

```bash
docker compose exec db psql -U agenda -d agenda -c 'SELECT * FROM contacts;'
```

## Comandos úteis

```bash
docker compose logs -f backend
docker compose logs -f db
docker compose restart backend
docker compose down
```

`docker compose down -v` **apaga os contatos**, removendo o volume. Use apenas se quiser reiniciar a demonstração do zero. Se a porta 8080 estiver ocupada, altere `FRONTEND_PORT` no `.env`.

## API

| Método | Caminho | Operação |
|---|---|---|
| GET | `/api/health` | Saúde da API e do banco |
| GET | `/api/contacts` | Listar contatos por nome |
| POST | `/api/contacts` | Criar contato |
| PUT | `/api/contacts/:id` | Alterar nome e telefone |
| DELETE | `/api/contacts/:id` | Excluir contato |

POST e PUT recebem `{"name":"Maria","phone":"(11) 99999-9999"}`. Nome: 1–100 caracteres; telefone: 3–30 caracteres com números e pontuação telefônica. O `id` é gerado pelo banco. Contato inexistente retorna 404; dados inválidos retornam 400.

## Alterar o schema

Edite `backend/src/db/schema.ts`, depois gere uma migration e reconstrua:

```bash
cd backend
npm ci
npm run db:generate
cd ..
docker compose up -d --build --wait
```

As migrations são aplicadas pelo backend a cada inicialização, com histórico mantido pelo Drizzle. As dependências são fixadas nos `package-lock.json` e instaladas com `npm ci` nos Dockerfiles.

## Validação realizada

Os builds Angular e NestJS e as imagens Docker foram construídos. O teste HTTP validou o CRUD, dados inválidos e contatos inexistentes pela porta publicada no Windows. Um contato também foi preservado depois de `docker compose down` e `docker compose up`, confirmando o volume PostgreSQL. Os registros temporários dos testes foram removidos.

Versões principais: Angular 22, NestJS 11, Drizzle ORM 0.45 e PostgreSQL 17. O build Angular usa Node 24; a API usa Node 22. A auditoria não apontou vulnerabilidades nas dependências do frontend nem nas dependências de produção do backend. O Drizzle Kit ainda traz alertas moderados em dependências de desenvolvimento, que não são incluídas na imagem final da API.

Referências: [Docker Compose](https://docs.docker.com/compose/), [Angular](https://angular.dev/), [NestJS](https://docs.nestjs.com/), [Drizzle migrations](https://orm.drizzle.team/docs/migrations).
