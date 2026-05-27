# AgentLX

**Acesso remoto seguro, inventário e automação para servidores Linux.**

AgentLX é uma plataforma open source para operação remota de servidores Linux via agent. O projeto combina painel web, API, WebSocket, banco PostgreSQL e um agent Linux em Python para permitir inventário de máquinas, heartbeat, execução auditável de comandos, terminal remoto em tempo real e automações operacionais com controle de acesso.

O objetivo do AgentLX é oferecer uma alternativa aberta e auto-hospedável para equipes que precisam administrar servidores Linux com segurança, rastreabilidade e controle.

O modelo de edição agora é Open Core: a base pública continua como **AgentLX Community** sob Apache-2.0, enquanto os módulos proprietários ficam na camada privada **AgentLX Enterprise**. Veja [docs/enterprise.md](docs/enterprise.md).

Na edição Community, a instalação fica limitada a 10 máquinas registradas, 10
templates e 10 grupos de máquinas. Limites maiores são responsabilidade do
overlay privado AgentLX Enterprise e vêm no payload de licença emitido pelo
AgentLX Cloud.

---

## Visão geral

Com o AgentLX, você pode:

- visualizar servidores Linux conectados ao painel;
- acompanhar status, heartbeat e telemetria básica;
- acessar terminal remoto em tempo real pelo navegador;
- executar comandos e templates operacionais;
- organizar máquinas por grupos;
- controlar permissões por usuário e por tela;
- auditar ações executadas na plataforma;
- instalar e atualizar agents Linux de forma automatizada.

O projeto foi desenhado para ambientes onde a transparência e o controle são importantes. Por ser open source, o código do painel, do backend, do agent e do protocolo pode ser auditado, revisado e adaptado conforme a necessidade da infraestrutura.

---

## Principais recursos

### Painel web

- Dashboard com resumo da frota.
- Lista de máquinas com busca e filtro por status.
- Geração de token e comando de instalação do agent.
- Página de detalhe da máquina com CPU, RAM, disco e inventário.
- Terminal remoto em tempo real.
- Quick actions para tmux.
- Execução de templates pelo terminal.
- Reinício e desligamento remotos.
- Gerenciamento de grupos vinculados às máquinas.
- Catálogo de templates com criação, edição, exclusão e execução.
- Logs de execução, agendamentos e auditoria.
- Tela de usuários para administradores.
- Perfil com troca de senha.

### Backend e API

- API HTTP integrada à aplicação.
- Server functions para o painel.
- Persistência em PostgreSQL.
- Endpoints para registro do agent, heartbeat, polling, resultado de execução e descomissionamento.
- WebSocket para túnel persistente do agent.
- WebSocket para terminal remoto no navegador.
- Distribuição do runtime do agent pela própria API.
- Endpoints oficiais de `install.sh` e `update.sh`.

### Agent Linux

- Agent modular escrito em Python.
- Registro inicial com token de enrollment.
- Heartbeat periódico com inventário da máquina.
- Polling de fila de execução.
- Execução remota de comandos.
- Túnel persistente via WebSocket para terminal remoto.
- Suporte a instalação como serviço systemd.
- Atualização automatizada do runtime.
- Self-uninstall remoto.

---

## Arquitetura

O AgentLX é composto por quatro partes principais:

1. **Painel web**
   Interface administrativa usada por operadores e administradores.

2. **Backend/API**
   Responsável por autenticação, regras de negócio, fila de execução, auditoria, comunicação com agents e terminal remoto.

3. **Banco PostgreSQL**
   Armazena máquinas, agents, usuários, permissões, grupos, inventários, execuções, tokens e logs de auditoria.

4. **Agent Linux**
   Runtime instalado nos servidores Linux, responsável por inventário, heartbeat, execução de comandos e túnel remoto.

Fluxo resumido:

```text
Navegador ── Painel/API AgentLX ── PostgreSQL
                  │
                  ├── WebSocket Terminal
                  │
                  └── Agent Linux ── Servidor gerenciado
```

---

## Como funciona

### 1. Cadastro de uma máquina

1. O operador acessa a tela de máquinas.
2. O painel gera um token de enrollment temporário.
3. O painel monta o comando de instalação do agent.
4. O servidor Linux executa o `install.sh` disponibilizado pela API.
5. O agent troca o token temporário por uma identidade definitiva.
6. A máquina passa a aparecer no painel.

Depois do registro, o agent utiliza um segredo próprio para assinar as requisições operacionais.

---

### 2. Ciclo normal do agent

Após instalado, o agent:

- envia heartbeat para a API;
- atualiza inventário da máquina;
- consulta a fila de execuções;
- executa comandos autorizados;
- devolve saída, erro, status e duração;
- mantém túnel WebSocket persistente para terminal remoto.

As execuções podem ser originadas por templates, ações operacionais ou terminal remoto.

---

### 3. Execução remota

O AgentLX suporta execução remota por fila.

Cada execução passa por estados como:

- `queued`
- `dispatched`
- `running`
- `success`
- `failed`
- `cancelled`

As execuções são registradas no banco e podem ser acompanhadas nos logs do painel.

---

### 4. Terminal remoto

O terminal remoto funciona por WebSocket e túnel persistente do agent.

O fluxo é:

1. O navegador solicita uma sessão de terminal.
2. O backend valida usuário, permissão e acesso à máquina.
3. O navegador conecta em `/api/terminal/ws`.
4. O agent mantém conexão ativa em `/api/agent/tunnel`.
5. O backend faz a ponte entre navegador e agent.
6. Entrada, saída, resize e fechamento são transmitidos em tempo real.

O terminal remoto não é um SSH tradicional embutido. Ele depende do agent instalado na máquina e da autorização feita pelo painel.

---

## Segurança

O AgentLX lida com acesso remoto e execução de comandos em servidores Linux. Por isso, segurança e auditoria são partes centrais do projeto.

Recursos atuais de segurança:

- autenticação por sessão no painel;
- controle de acesso por role;
- permissões por tela;
- restrição de máquinas por grupos;
- criação do primeiro administrador apenas por script;
- senha com hash via `scrypt`;
- proteção de origem em ações sensíveis;
- cookies seguros em produção;
- headers de endurecimento HTTP;
- CSP;
- HSTS;
- `frame-ancestors 'none'`;
- `Referrer-Policy: no-referrer`;
- `X-Content-Type-Options: nosniff`.

### Segurança do agent

- Token de enrollment temporário e com expiração.
- Token pendente cifrado no banco.
- `agent_secret` emitido no registro inicial.
- Requisições operacionais assinadas com HMAC-SHA256.
- Uso de timestamp e nonce para reduzir risco de replay.
- Sem fallback Bearer em endpoints operacionais do agent.
- Comunicação operacional via `Authorization: Agent <agent_id>`.
- Segredo do agent persistido localmente no host instalado.

### Auditoria e logs

- Registro de ações relevantes no painel.
- Logs de execução com status, saída, erro e duração.
- Redaction de segredos em saídas e erros.
- Mascaramento de tokens, senhas, chaves e headers sensíveis.
- Severidade em eventos de auditoria.
- Hash de integridade em registros de auditoria.

> Importante: o AgentLX deve ser publicado sempre atrás de HTTPS em produção. Caso `APP_ORIGIN` não esteja configurado com `https://`, recursos sensíveis ficam bloqueados.

---

## Stack

### Aplicação

- Node.js 24+
- React 19
- TanStack Start
- TanStack Router
- TanStack React Query
- Vite 7
- Tailwind CSS 4
- Radix UI
- xterm.js
- ws
- pg
- zod
- PostgreSQL 16+

### Agent Linux

- Python 3
- websockets
- systemd, recomendado para produção

---

## Requisitos

### Desenvolvimento local

- Node.js 24+
- npm
- PostgreSQL 16+

### Host Linux gerenciado

- Linux moderno
- `curl`
- `python3`
- `python3-venv`
- `systemd`, recomendado
- acesso HTTPS até a API do AgentLX

---

## Instalação local

Clone o repositório:

```bash
git clone https://github.com/agentlx/agentlx.git
cd agentlx
```

Crie o arquivo de ambiente:

```bash
cp .env.example .env
```

Configure no mínimo:

```env
APP_ORIGIN=http://localhost:3000
APP_TIME_ZONE=America/Sao_Paulo
DATABASE_URL=postgresql://agentlx:agentlx@localhost:5432/agentlx
AGENTLX_PENDING_TOKEN_SECRET=troque-este-segredo
```

Instale as dependências:

```bash
npm install
```

Inicialize o banco:

```bash
npm run db:init
```

Rode em desenvolvimento:

```bash
npm run dev
```

A aplicação sobe por padrão em:

```text
http://localhost:3000
```

---

## Build de produção

```bash
npm run build
npm run start
```

O comando `start` sobe o servidor Node responsável por:

- servir o build client;
- executar o SSR do TanStack Start;
- iniciar o WebSocket do terminal remoto.

---

## Docker

### Imagem oficial

A imagem pública recomendada para produção é versionada e deve ficar fixada no Compose:

```yaml
image: ghcr.io/agentlx/agentlx:v1.0.19
```

Em produção, prefira fixar também o digest publicado da release:

```yaml
image: ghcr.io/agentlx/agentlx:v1.0.19@sha256:5983820abc50a4539d0943f63d687e4334a384a10c00401977e9850523fd6868
```

Para atualizar uma instalação existente:

```bash
cd /opt/agentlx-panel
sed -i 's|ghcr.io/agentlx/agentlx:v[0-9.]*|ghcr.io/agentlx/agentlx:v1.0.19|' docker-compose.yml
docker compose pull app
docker compose up -d --force-recreate app
docker compose logs -f app
```

Depois da subida, valide a integridade do build e do enforcement de limite:

```bash
curl -fsS https://agentlx.example.com/api/health
curl -fsS https://agentlx.example.com/api/deployment-status
```

### Docker com PostgreSQL no Compose

Crie o arquivo de ambiente Docker:

```bash
cp .env.docker.example .env.docker
```

Suba a aplicação com banco integrado:

```bash
docker compose --env-file .env.docker --profile with-db up -d --build
```

Nesse modo:

- o container do banco é criado;
- o app aguarda o PostgreSQL responder;
- o schema é aplicado;
- a aplicação é iniciada.

### Reset completo do ambiente Docker

Atenção: o comando abaixo remove o volume do PostgreSQL e apaga os dados.

```bash
docker compose --env-file .env.docker --profile with-db down -v
docker compose --env-file .env.docker --profile with-db up -d --build
docker compose --env-file .env.docker exec app npm run db:init
```

Crie o administrador:

```bash
read -rsp "Admin password: " AGENTLX_ADMIN_PASSWORD
printf '\n'
printf '%s' "$AGENTLX_ADMIN_PASSWORD" | docker compose --env-file .env.docker exec -T app node scripts/create-admin.mjs --name "Admin" --email "admin@agentlx.local" --password-stdin
unset AGENTLX_ADMIN_PASSWORD
```

---

## Variáveis de ambiente principais

| Variável                        | Obrigatória | Descrição                                                                         |
| ------------------------------- | ----------: | --------------------------------------------------------------------------------- |
| `APP_ORIGIN`                    |         Sim | Origem pública da aplicação. Em produção deve ser HTTPS real.                     |
| `APP_TIME_ZONE`                 |         Não | Fuso horário IANA usado pelo app. Padrão: `America/Sao_Paulo`.                    |
| `DATABASE_URL`                  |         Sim | String de conexão PostgreSQL.                                                     |
| `DATABASE_SSL`                  |         Não | Ativa SSL no banco. Em produção, o padrão recomendado é `true`.                   |
| `AGENTLX_TRUST_PROXY`           |         Não | Usa headers `X-Forwarded-*` atrás de reverse proxy.                               |
| `AGENTLX_PENDING_TOKEN_SECRET`  |         Sim | Segredo usado para cifrar tokens pendentes.                                       |
| `AGENTLX_MFA_ENCRYPTION_SECRET` | Recomendado | Segredo usado para cifrar dados de MFA.                                           |
| `AGENTLX_SEED_ON_BOOT`          |         Não | Injeta dados de demonstração quando o banco está vazio. Em produção, use `false`. |

Exemplo de produção:

```env
APP_ORIGIN=https://ops.seudominio.com
AGENTLX_TRUST_PROXY=true
APP_TIME_ZONE=America/Sao_Paulo
DATABASE_SSL=true
AGENTLX_SEED_ON_BOOT=false
```

---

## Reverse proxy

O AgentLX foi pensado para rodar atrás de um proxy HTTPS, como:

- Nginx Proxy Manager;
- Traefik;
- Nginx;
- Caddy.

O proxy precisa encaminhar HTTP normal e WebSocket.

Rotas que precisam suportar upgrade WebSocket:

```text
/api/agent/tunnel
/api/terminal/ws
```

Também é importante que o domínio público acessado no navegador seja o mesmo configurado em `APP_ORIGIN`.

---

## Instalação do agent Linux

O fluxo recomendado é gerar o comando pela interface web em:

```text
Máquinas > Adicionar máquina
```

Exemplo de comando gerado:

```bash
curl -fsSL https://api.seudominio.com/api/agent/install.sh | sudo bash -s -- \
  --api-base-url https://api.seudominio.com \
  --enrollment-token TOKEN_UNICO \
  --location DC-SP-01
```

O instalador:

- valida instalação existente;
- baixa o runtime do agent;
- cria `config.json`;
- cria virtualenv Python;
- instala dependências;
- registra a máquina;
- instala e inicia o serviço systemd quando possível.

---

## Atualização do agent

Para atualizar hosts já instalados:

```bash
curl -fsSL https://api.seudominio.com/api/agent/update.sh -o /tmp/agentlx-update.sh
sudo bash /tmp/agentlx-update.sh --api-base-url https://api.seudominio.com
```

O update:

- baixa o manifest do runtime;
- atualiza apenas arquivos declarados;
- remove arquivos antigos removidos do runtime;
- reinstala dependências quando necessário;
- reinicia o serviço apenas quando houve alteração;
- preserva `config.json`, `agent_id`, `machine_id` e `agent_secret`.

---

## Comandos úteis do agent

```bash
python3 agent.py register
python3 agent.py run
python3 agent.py run-foreground
python3 agent.py status
python3 agent.py stop
sudo python3 agent.py install-service
sudo python3 agent.py uninstall-service
sudo python3 agent.py uninstall
```

---

## Healthcheck

Endpoint:

```text
GET /api/health
```

Resposta esperada:

```json
{
  "ok": true,
  "service": "agentlx-api",
  "database": "ok",
  "now": "2026-05-16T00:00:00.000Z"
}
```

---

## Estrutura do repositório

```text
.
|-- agent-linux/
|   |-- install.sh
|   |-- update.sh
|   |-- agent.py
|   |-- config.example.json
|   `-- agentlx/
|       |-- app.py
|       |-- config.py
|       |-- executor.py
|       |-- inventory.py
|       |-- protocol.py
|       |-- system.py
|       |-- terminal.py
|       |-- transport.py
|       `-- utils.py
|-- db/
|   `-- schema.sql
|-- scripts/
|   |-- create-admin.mjs
|   |-- db-init.mjs
|   |-- queue-remote-command.mjs
|   |-- start-server.mjs
|   |-- test-tmux-quick-actions.mjs
|   `-- wait-for-db.mjs
|-- src/
|   |-- components/
|   |-- hooks/
|   |-- lib/
|   |-- routes/
|   `-- server/
|-- docker-compose.yml
|-- Dockerfile
`-- package.json
```

---

## Scripts principais

| Script                        | Uso                                       |
| ----------------------------- | ----------------------------------------- |
| `npm run dev`                 | Roda o ambiente de desenvolvimento.       |
| `npm run build`               | Gera build de produção.                   |
| `npm run build:dev`           | Gera build em modo development.           |
| `npm run preview`             | Executa preview do build.                 |
| `npm run start`               | Sobe o servidor Node da aplicação.        |
| `npm run db:init`             | Aplica `db/schema.sql`.                   |
| `npm run db:wait`             | Aguarda o PostgreSQL responder.           |
| `npm run user:create-admin`   | Cria ou promove administrador.            |
| `npm run agent:queue-command` | Enfileira comando remoto direto no banco. |
| `npm run lint`                | Executa ESLint.                           |
| `npm run format`              | Formata o projeto com Prettier.           |

---

## Templates padrão

O sistema inclui templates operacionais padrão, como:

- `carbonio-ssl-check`
- `carbonio-mailq-status`
- `system-disk-usage`
- `system-top-processes`
- `system-package-updates-debian`
- `system-package-updates-redhat`

Templates personalizados também podem ser criados pela interface web.

---

## Status das máquinas

O status visual das máquinas é calculado a partir de fatores como:

- último heartbeat;
- CPU;
- RAM;
- disco.

Estados principais:

- `online`
- `warning`
- `offline`

Por padrão, a máquina pode ser considerada offline se ficar sem heartbeat por tempo suficiente, e warning se estiver com métricas altas ou heartbeat atrasado.

---

## Troubleshooting

### O painel abre, mas sem estilo

Verifique se os assets em `/assets/*` estão sendo servidos corretamente pelo app e encaminhados pelo proxy.

### O agent registra, mas não executa comandos

Verifique:

- `config.json`;
- acesso da máquina até `APP_ORIGIN`;
- status do serviço `agentlx`;
- logs com `journalctl -u agentlx -f`;
- conectividade com `/api/agent/tunnel`.

### O terminal remoto não conecta

Verifique:

- se a máquina está online;
- se o agent abriu túnel persistente;
- se o proxy encaminha WebSocket;
- se `APP_ORIGIN` bate exatamente com o domínio acessado pelo navegador.

### O host Linux é muito antigo

Ambientes legados podem falhar por:

- TLS antigo;
- `curl` desatualizado;
- ausência de `python3`;
- ausência de `python3-venv`;
- ausência de `systemd`.

O alvo recomendado são distribuições Linux modernas.

---

## Validação recomendada pós-instalação

1. Acesse a aplicação web.
2. Confirme o healthcheck.
3. Crie o primeiro administrador.
4. Faça login no painel.
5. Gere um enrollment em `Máquinas`.
6. Instale o agent em uma máquina Linux de teste.
7. Confirme que a máquina aparece no painel.
8. Abra o terminal remoto.
9. Execute um template.
10. Confira o retorno em `Logs`.

---

## Licença

Apache-2.0.

---

## Status do projeto

O AgentLX já funciona como uma aplicação única que concentra painel, API HTTP, WebSocket de terminal, schema PostgreSQL e runtime oficial do agent Linux no mesmo repositório.

O projeto ainda deve ser tratado como software em evolução. Antes de usar em produção, revise a documentação de hardening, configure HTTPS, proteja os segredos, restrinja acesso ao painel, valide permissões e teste o agent em ambiente controlado.

```mermaid
flowchart LR
  UI["Painel web\nTanStack Start + React"] --> API["App Node\nSSR + API + WebSocket"]
  API --> DB["PostgreSQL"]
  UI --> WS["/api/terminal/ws"]
  AGENT["Agent Linux\nPython"] --> API
  AGENT --> WS2["/api/agent/tunnel"]
  API --> RUNTIME["agent-linux/\nruntime publicado pela API"]
```
