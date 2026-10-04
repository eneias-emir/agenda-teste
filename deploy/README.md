# Deploy Ubuntu VPS — emitech.com.br

Fluxo: navegador → Cloudflare (HTTPS) → Nginx edge (HTTPS :443) → agenda-web (:80) → backend (:3000) → PostgreSQL.
O futuro ns-web compartilha apenas a rede externa emitech-proxy com o proxy. Banco e backend da agenda ficam na rede privada do projeto. Só o edge publica portas no host.

## 1. Preparar a VPS e copiar o projeto

Os comandos abaixo são executados no Ubuntu da VPS com um usuário que possa executar Docker (adicione `sudo` se necessário). Verifique:

```bash
docker version
docker compose version
sudo ss -ltnp | grep -E ':(80|443)\b'
```

As portas 80/443 precisam estar livres. Se já houver outro proxy atendendo sites, integre estas rotas nele antes de substituir qualquer serviço.
Copie o projeto inteiro, incluindo frontend, backend e deploy, para `/opt/agenda-demo` por Git/SFTP/SCP, excluindo node_modules e .env local. Os comandos seguintes assumem esse caminho.

No firewall da Hostinger, libere TCP 80 e 443 e mantenha a porta de SSH acessível. Se usar UFW, permita a porta real de SSH antes de ativá-lo. Portas publicadas pelo Docker podem contornar regras do UFW: use também o firewall do provedor. Não abra 8080, 3000 ou 5432.

## 2. Cloudflare e certificado

Em DNS, confirme os registros A de `agenda` e `ns` apontando para o IP da VPS, ambos com **Proxied / nuvem laranja**. Remova/corrija registros AAAA se a VPS não estiver preparada para aquele IPv6.

Em SSL/TLS → Origin Server → Create Certificate, gere um certificado PEM com chave RSA cobrindo `agenda.emitech.com.br` e `ns.emitech.com.br` (ou `*.emitech.com.br`). Salve o certificado e a chave na VPS:

```text
/opt/agenda-demo/deploy/proxy/certs/emitech-origin.pem
/opt/agenda-demo/deploy/proxy/certs/emitech-origin.key
```

```bash
cd /opt/agenda-demo
chmod 700 deploy/proxy/certs
chmod 600 deploy/proxy/certs/emitech-origin.key
chmod 644 deploy/proxy/certs/emitech-origin.pem
openssl x509 -in deploy/proxy/certs/emitech-origin.pem -noout -dates -ext subjectAltName
```

Guarde a chave fora do Git. Programe a substituição antes da validade terminar; este pacote não renova certificados automaticamente. Após iniciar o proxy no passo 4, configure SSL/TLS → Overview como **Full (strict)**. Não use Flexible, pois o redirecionamento para HTTPS pode gerar loop.

Origin CA é confiável pela Cloudflare, mas não pelos navegadores diretamente. Mantenha a nuvem laranja; para usar DNS only, instale um certificado público, como Let's Encrypt, e adapte os caminhos TLS.

## 3. Configurar e subir a agenda

```bash
cd /opt/agenda-demo
umask 077
# Somente se ainda não houver .env:
test -f .env || printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)" > .env
docker network inspect emitech-proxy >/dev/null 2>&1 || docker network create emitech-proxy
docker compose -f compose.vps.yaml config --quiet
docker compose -f compose.vps.yaml up -d --build --wait
docker compose -f compose.vps.yaml ps
```

`compose.vps.yaml` é um arquivo completo: use apenas `-f compose.vps.yaml`, sem combinar com compose.yaml. O arquivo local publica 8080; o arquivo VPS não publica portas da aplicação. Use sempre o arquivo VPS nos comandos de manutenção.

Se o .env já existir, configure POSTGRES_PASSWORD com uma senha forte composta de caracteres seguros para URL (o comando acima gera hexadecimal). Alterar .env não altera a senha de um PostgreSQL já inicializado. Se já usa a agenda nesta VPS, preserve a senha e o volume existentes. O nome de projeto continua agenda-demo para preservar o volume padrão; caso tenha usado `-p` diferente, reutilize aquele nome em todos os comandos. Não execute `down -v`.

## 4. Validar e iniciar o proxy

```bash
cd /opt/agenda-demo
docker compose -f deploy/proxy/compose.yaml config --quiet
docker compose -f deploy/proxy/compose.yaml run --rm --no-deps nginx nginx -t
docker compose -f deploy/proxy/compose.yaml up -d
docker compose -f deploy/proxy/compose.yaml ps
```

Agora habilite Full (strict) na Cloudflare e, opcionalmente, Always Use HTTPS. Para HTML/API desta agenda, não configure Cache Everything; se tiver regras amplas, crie uma regra de bypass para `/api/*`.

## 5. Conferir o resultado

```bash
curl -I http://agenda.emitech.com.br
curl -fsS https://agenda.emitech.com.br/api/health
curl -I https://agenda.emitech.com.br
curl -i https://ns.emitech.com.br
docker compose -f deploy/proxy/compose.yaml logs --tail=100 nginx
```

Esperado: HTTP redireciona para HTTPS; agenda e /api/health retornam 200; ns retorna 503 com mensagem de manutenção. Abra a agenda no navegador para conferir cadastro, edição e exclusão.

Teste direto na origem, dentro da VPS, apenas para diagnóstico (o `-k` é necessário porque Origin CA não é uma CA pública):

```bash
curl -k --resolve agenda.emitech.com.br:443:127.0.0.1 https://agenda.emitech.com.br/api/health
```

521/522: verifique proxy ativo, IP e firewall. 525/526: confira certificado, chave, validade, SAN e Full (strict). 502: confira agenda ativa e alias/rede com `docker network inspect emitech-proxy`. Os logs registram o IP da conexão (normalmente Cloudflare); não confiamos indiscriminadamente em cabeçalhos de IP enviados pelo cliente.

## 6. Ativar o segundo SaaS

Use `deploy/ns.compose.example.yaml` como modelo no projeto futuro. Ajuste build e porta; o processo deve escutar em `0.0.0.0:3000` no container (ou sua porta real). Conecte apenas o serviço HTTP à rede emitech-proxy com alias exclusivo `ns-web`, sem publicar porta no host. Mantenha banco e serviços internos na rede própria.

Depois de subir e validar o segundo SaaS, substitua o bloco `location /` do servidor `ns.emitech.com.br` em `deploy/proxy/conf.d/routes.conf` por:

```nginx
location / {
    set $ns_upstream ns-web:3000;
    proxy_pass http://$ns_upstream;
    include /etc/nginx/snippets/proxy.conf;
}
```

Use a porta interna real. Se o SaaS tiver frontend e API separados, seu serviço HTTP deve encaminhar /api internamente, como a agenda, ou você precisará adicionar essa rota ao proxy.

```bash
cd /opt/agenda-demo
docker compose -f deploy/proxy/compose.yaml exec nginx nginx -t
docker compose -f deploy/proxy/compose.yaml exec nginx nginx -s reload
curl -I https://ns.emitech.com.br
```

A resolução DNS em tempo de requisição permite iniciar o proxy sem o segundo SaaS e acompanhar mudanças de IP dos containers. Mantenha o arquivo routes.conf anterior como cópia para reverter uma alteração de rota e recarregue após `nginx -t`.

## Operação

Atualizar agenda: `docker compose -f compose.vps.yaml up -d --build --wait`. Após mudar arquivos do proxy ou substituir certificados: `nginx -t` e `nginx -s reload` pelos comandos acima. As imagens usam tags de atualização; registre os digests homologados se precisar de releases reproduzíveis.

Backup do banco:

```bash
cd /opt/agenda-demo
umask 077
docker compose -f compose.vps.yaml exec -T db pg_dump -U agenda -d agenda > "agenda-$(date +%F-%H%M%S).sql"
```

Guarde backups fora da VPS e teste a restauração. A agenda atual não tem autenticação: qualquer visitante pode listar e alterar contatos. Use dados fictícios no teste público; para contatos reais, implemente autenticação ou proteja o domínio com Cloudflare Access antes de disponibilizá-lo.

## Referências

- https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/
- https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/
- https://docs.docker.com/compose/how-tos/networking/
- https://nginx.org/en/docs/http/websocket.html
