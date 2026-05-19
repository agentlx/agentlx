# agentlx

Painel full stack open source para operacao de servidores Linux com:

- inventario de maquinas via agent Python;
- heartbeat e telemetria basica;
- execucao remota por fila;
- terminal remoto em tempo real por WebSocket;
- templates operacionais;
- grupos para controlar acesso a maquinas;
- autenticacao local com permissoes por tela.

O projeto atual nao e mais um rascunho simples. Hoje ele ja funciona como uma aplicacao unica que concentra painel, API HTTP, WebSocket de terminal, schema PostgreSQL e runtime oficial do agent Linux no mesmo repositorio.

## Open source e instalacao

- Licenca: Apache-2.0.
- Versao inicial planejada: `v0.1.0`.
- Instalacao Docker com `.env`: `deploy/docker-compose.env.yml`.
- Instalacao Docker com Docker Secrets: `deploy/docker-compose.secrets.yml`.
- Guia rapido de instalacao: `docs/installation.md`.
- Hardening de producao: `docs/hardening.md`.
- Processo de release: `docs/release.md`.

## O que existe hoje

### Painel web

- Dashboard com resumo da frota.
- Lista de maquinas com filtro por status e busca.
- Modal para gerar token e comando de instalacao do agent.
- Pagina de detalhe da maquina com:
  - indicadores de CPU, RAM e disco;
  - informacoes do ultimo inventario;
  - terminal remoto;
  - quick actions do tmux;
  - execucao de templates pelo terminal;
  - reinicio e desligamento remotos;
  - gerenciamento de grupos vinculados.
- Catalogo de templates com criacao, edicao, exclusao e execucao.
- Logs separados em:
  - eventos de execucao;
  - agendamentos;
  - auditoria.
- Tela de grupos para organizar acesso a maquinas.
- Tela de usuarios para administradores.
- Tela de perfil com troca da propria senha.

### Backend/API

- API HTTP no mesmo app TanStack Start.
- Persistencia em PostgreSQL com `pg`.
- Server functions para o painel.
- Endpoints para:
  - registro do agent;
  - heartbeat;
  - polling de fila;
  - devolucao de resultado;
  - descomissionamento;
  - tunel persistente do agent;
  - terminal remoto do navegador;
  - distribuicao do runtime do agent;
  - `install.sh` e `update.sh`.

### Agent Linux

- Agent Python modular em `agent-linux/agentlx/`.
- Bootstrap fino em `agent-linux/agent.py`.
- Registro inicial com token de enrollment.
- Polling da fila de execucao.
- Heartbeat com inventario da maquina.
- Tunel persistente WebSocket para terminal remoto.
- Self-uninstall remoto.
- Instalacao automatica via `install.sh`.
- Atualizacao automatica via `update.sh`.
- Suporte a servico `systemd`.

## Arquitetura atual

```mermaid
flowchart LR
  UI["Painel web\nTanStack Start + React"] --> API["App Node\nSSR + API + WebSocket"]
  API --> DB["PostgreSQL"]
  UI --> WS["/api/terminal/ws"]
  AGENT["Agent Linux\nPython"] --> API
  AGENT --> WS2["/api/agent/tunnel"]
  API --> RUNTIME["agent-linux/\nruntime publicado pela API"]
```

## Fluxos principais

### 1. Cadastro de uma nova maquina

1. Um operador abre `Maquinas`.
2. O painel gera um token pendente cifrado no banco.
3. O painel monta o comando de instalacao do agent.
4. Esse comando baixa `install.sh` da propria API.
5. O script instala o runtime em Linux e roda `register`.
6. O agent troca o token pendente por um `agent_secret` definitivo.
7. A maquina aparece no painel.
8. Depois disso, a identidade local fica em `config.json` e o segredo nunca trafega como Bearer.

### 2. Ciclo normal do agent

1. O agent se registra em `POST /api/agent/register`.
2. Ele passa a enviar heartbeat para `POST /api/agent/heartbeat`.
3. O backend atualiza:
   - `agents`;
   - `machines`;
   - `machine_inventories`;
   - `machine_services`;
   - `machine_status_history`.
4. O agent consulta fila em `POST /api/agent/poll`.
5. Quando encontra uma execucao, ele roda o comando.
6. O resultado volta por `POST /api/agent/executions/result`.
7. O painel mostra status, saida, erro, duracao e auditoria.
8. Heartbeat, poll, resultado e tunel usam `Authorization: Agent <agent_id>`.
9. Cada requisicao operacional e assinada com HMAC v2 (`x-agent-auth-*`) usando o `agent_secret`.
10. O backend rejeita chamada sem assinatura valida, timestamp dentro da janela e nonce ainda nao utilizado.

### 3. Execucao remota

Existem dois tipos de execucao no banco:

- `template`: criada a partir de um template catalogado.
- `terminal`: criada a partir do terminal remoto ou de acoes operacionais.

As execucoes passam por estados:

- `queued`
- `dispatched`
- `running`
- `success`
- `failed`
- `cancelled`

### 4. Terminal remoto

O terminal remoto nao e um SSH embutido. O fluxo atual e:

1. O navegador pede uma sessao ao backend.
2. O backend valida usuario, maquina e tunel do agent.
3. O backend cria uma sessao temporaria em memoria.
4. O navegador conecta em `/api/terminal/ws`.
5. O agent ja mantem um tunel persistente em `/api/agent/tunnel`.
6. O backend encadeia os dois lados e repassa:
   - abertura;
   - resize;
   - input;
   - output;
   - fechamento.

O terminal tambem:

- envia heartbeat do navegador para detectar sessoes orfas;
- suporta colar/copiar com integracao ao clipboard;
- mostra quick actions de tmux;
- pode iniciar uma execucao de template no shell ao vivo.

### 5. Controle de acesso

Existem dois niveis principais:

- `admin`
- `member`

Permissoes por tela:

- `dashboard`
- `machines`
- `groups`
- `templates`
- `logs`
- `users`

Regras atuais:

- `admin` recebe acesso a todas as telas.
- `member` recebe apenas as telas liberadas.
- a tela `users` e exclusiva de administradores.
- maquinas tambem respeitam grupos:
  - owners e members de um grupo enxergam as maquinas vinculadas a ele;
  - administradores ignoram esse filtro.

## Estrutura do repositorio

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

## Diretorios e arquivos importantes

### `src/server/`

Responsabilidades principais do backend.

- `auth.server.ts`
  - login, logout, sessao, protecao por role e por tela.
- `db.server.ts`
  - pool PostgreSQL, bootstrap do schema e seed opcional.
- `agent.server.ts`
  - endpoints do agent, registro, heartbeat, poll e resultado.
- `panel.server.ts`
  - regras de negocio do painel.
- `terminal-realtime.server.ts`
  - bridge WebSocket entre navegador e agent.
- `agent-runtime.server.ts`
  - publica `install.sh`, `update.sh`, manifest e arquivos do runtime.
- `env.server.ts`
  - validacao de ambiente via Zod.

### `src/lib/`

Contratos compartilhados e utilitarios.

- `agentlx.ts`
  - schemas Zod, tipos, view models e templates padrao.
- `auth.ts`
  - papeis, telas e regras de navegacao.
- `panel-api.ts`
  - server functions consumidas pelo frontend.
- `realtime-terminal-client.ts`
  - fechamento de sessao de terminal no navegador.
- `template-terminal-handoff.ts`
  - handoff de execucao de template para a pagina da maquina.
- `tmux-quick-actions.ts`
  - catalogo pesquisavel de atalhos do tmux.
- `xterm-clipboard.ts`
  - integracao de copy/paste do terminal web.

### `src/routes/`

Rotas principais da UI.

- `/`
  - dashboard da frota.
- `/machines`
  - lista, enrollment e remocao do agent.
- `/machines/$machineId`
  - detalhe da maquina, terminal remoto, templates e grupos.
- `/templates`
  - catalogo e criacao de templates.
- `/logs`
  - execucoes, agendamentos e auditoria.
- `/groups`
  - grupos de acesso a maquinas.
- `/users`
  - administracao de usuarios.
- `/profile`
  - perfil da conta logada.
- `/login`
  - autenticacao.

### `agent-linux/`

Runtime distribuido para as maquinas Linux.

- `install.sh`
  - instalacao inicial.
- `update.sh`
  - atualizacao de maquinas ja instaladas.
- `.agentlx-runtime-manifest.json`
  - gerado no host instalado para controlar arquivos do runtime.

## Banco de dados

O schema atual fica em `db/schema.sql`.

Tabelas principais:

- `agents`
- `machines`
- `machine_services`
- `machine_status_history`
- `machine_inventories`
- `action_templates`
- `action_executions`
- `audit_logs`
- `agent_enrollment_tokens`
- `users`
- `machine_groups`
- `machine_group_users`
- `machine_group_links`
- `user_sessions`

Algumas observacoes relevantes:

- `action_executions.execution_kind`
  - `template` ou `terminal`.
- `action_executions.available_at`
  - controla agendamento futuro.
- `action_executions.command`
  - guarda a versao mascarada do comando para leitura no painel e auditoria.
- `action_executions.command_encrypted`
  - guarda a versao cifrada do comando real, usada apenas no despacho ao agent.
- `users.allowed_screens`
  - define telas liberadas para `member`.
- `agent_enrollment_tokens`
  - armazena token cifrado, validade, local e pasta de instalacao.
- `agents.auth_token_encrypted`
  - guarda o token atual do agent cifrado para rotacao transparente.
- `agents.auth_token_prev_hash` e `agents.auth_token_prev_expires_at`
  - mantem a janela de recuperacao do token anterior durante a rotacao em duas etapas.
- `agents.auth_token_last_acknowledged_at`, `agents.auth_token_last_persist_error` e `agents.auth_token_last_persist_error_at`
  - registram confirmacao de persistencia do token novo e falhas reportadas pelo agent.
- `agent_request_nonces`
  - guarda nonces recentes para bloquear replay das requisicoes assinadas pelos agents.
- `machines`
  - guarda tambem metadata de distro:
    - `distro_id`
    - `distro_family`
    - `distro_version`
- `audit_logs.severity`, `metadata_json`, `integrity_prev_hash` e `integrity_hash`
  - enriquecem a trilha de auditoria com criticidade, contexto e encadeamento de integridade.

## Stack atual

### Aplicacao

- Node.js 24+
- TanStack Start
- TanStack Router
- TanStack React Query
- React 19
- Vite 7
- Tailwind CSS 4
- Radix UI
- xterm.js
- `ws`
- `pg`
- `zod`

### Agent Linux

- Python 3
- `websockets>=13,<16`
- `systemd` para o modo recomendado em producao

## Requisitos

### Desenvolvimento local

- Node.js 24+
- npm
- PostgreSQL 16+ acessivel pela `DATABASE_URL`

### Hosts do agent

- Linux moderno
- `curl`
- `python3`
- `python3-venv`
- `systemd` para instalacao automatica do servico
- suporte a TLS moderno para acessar a API por HTTPS

## Variaveis de ambiente

Os arquivos de exemplo oficiais sao:

- `.env.example`
- `.env.docker.example`

### Variaveis da aplicacao

| Variavel                             | Obrigatoria | Descricao                                                                                            |
| ------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                           | nao         | ambiente de execucao                                                                                 |
| `HOST`                               | nao         | host HTTP do app                                                                                     |
| `PORT`                               | nao         | porta HTTP do app                                                                                    |
| `APP_ORIGIN`                         | sim         | origem publica usada por CSRF, SSE, WebSocket e validacao de origem; em producao deve ser HTTPS real |
| `AGENTLX_TRUST_PROXY`                | nao         | quando `true`, usa headers `X-Forwarded-*` para detectar a origem publica atras de reverse proxy     |
| `APP_TIME_ZONE`                      | nao         | fuso horario IANA usado pelo app e pela sessao PostgreSQL; default `America/Sao_Paulo`               |
| `DATABASE_URL`                       | sim         | conexao PostgreSQL                                                                                   |
| `DATABASE_URL_FILE`                  | nao         | caminho de arquivo/secret para `DATABASE_URL`                                                        |
| `DATABASE_SSL`                       | nao         | ativa SSL no acesso ao banco; em producao o default e `true`                                         |
| `DATABASE_POOL_MAX`                  | nao         | tamanho maximo do pool                                                                               |
| `DATABASE_CONNECT_RETRIES`           | nao         | tentativas de espera do banco                                                                        |
| `DATABASE_CONNECT_RETRY_DELAY_MS`    | nao         | intervalo entre tentativas                                                                           |
| `AGENTLX_PENDING_TOKEN_SECRET`       | sim         | segredo usado para cifrar tokens pendentes                                                           |
| `AGENTLX_PENDING_TOKEN_SECRET_FILE`  | nao         | caminho de arquivo/secret para `AGENTLX_PENDING_TOKEN_SECRET`                                        |
| `AGENTLX_MFA_ENCRYPTION_SECRET`      | recomendado | segredo usado para cifrar dados MFA                                                                  |
| `AGENTLX_MFA_ENCRYPTION_SECRET_FILE` | nao         | caminho de arquivo/secret para `AGENTLX_MFA_ENCRYPTION_SECRET`                                       |
| `AGENTLX_SEED_ON_BOOT`               | nao         | injeta seed demo quando o banco esta vazio; em producao o default e `false`                          |

### Bloqueio de HTTPS

Se `APP_ORIGIN` nao estiver configurado com `https://`, o servidor sobe em modo bloqueado.
Nesse modo, a interface mostra que o agentlx iniciou corretamente e aponta para
`https://doc.agentlx.com.br`, mas login, APIs sensiveis, enrollment, terminal e execucoes ficam
indisponiveis. `NODE_ENV=development` nao libera HTTP.

### Comportamento importante do bootstrap

Na primeira subida com banco vazio:

- o schema e garantido automaticamente;
- templates padrao sao inseridos;
- nenhum usuario administrador e criado automaticamente;
- o primeiro administrador deve ser criado explicitamente com `scripts/create-admin.mjs`.

## Subindo em desenvolvimento local

### 1. Configure o ambiente

```bash
cp .env.example .env
```

Ajuste no minimo:

```env
APP_ORIGIN=http://localhost:3000
APP_TIME_ZONE=America/Sao_Paulo
DATABASE_URL=postgresql://agentlx:agentlx@localhost:5432/agentlx
AGENTLX_PENDING_TOKEN_SECRET=troque-este-segredo
```

Para producao, use uma origem publica real com HTTPS e mantenha o seed desligado:

```env
APP_ORIGIN=https://ops.seudominio.com
AGENTLX_TRUST_PROXY=true
APP_TIME_ZONE=America/Sao_Paulo
DATABASE_SSL=true
AGENTLX_SEED_ON_BOOT=false
```

### 2. Instale dependencias

```bash
npm install
```

### 3. Inicialize o banco

```bash
npm run db:init
```

### 4. Rode o app

```bash
npm run dev
```

O app sobe em `http://localhost:3000` por padrao.

## Build e execucao de producao

```bash
npm run build
npm run start
```

O script `start` usa `scripts/start-server.mjs`, que:

- serve o build client;
- sobe o servidor SSR do TanStack Start;
- inicializa o servidor WebSocket do terminal remoto.

## Docker

## Docker com banco no proprio Compose

```bash
cp .env.docker.example .env.docker
docker compose --env-file .env.docker --profile with-db up -d --build
```

Nesse modo:

- o container `db` sobe junto;
- o container `app` espera o banco responder;
- o schema e aplicado;
- a aplicacao inicia em seguida.

### Reset completo do banco Docker

Use este procedimento quando quiser apagar todos os dados de teste, recriar o volume PostgreSQL, subir a aplicacao e criar novamente um administrador.

Importante: o Docker Compose nao le `.env.docker` automaticamente. Sempre passe `--env-file .env.docker`. O `down -v` remove o volume `postgres_data`; sem isso, trocar `POSTGRES_PASSWORD` no arquivo `.env.docker` nao altera a senha de um banco ja criado.

```bash
docker compose --env-file .env.docker --profile with-db down -v
docker compose --env-file .env.docker --profile with-db up -d --build
docker compose --env-file .env.docker exec app npm run db:init
read -rsp "Admin password: " AGENTLX_ADMIN_PASSWORD
printf '\n'
printf '%s' "$AGENTLX_ADMIN_PASSWORD" | docker compose --env-file .env.docker exec -T app node scripts/create-admin.mjs --name "Admin" --email "admin@agentlx.local" --password-stdin
unset AGENTLX_ADMIN_PASSWORD
```

Para criar ou atualizar um administrador depois que o banco ja existe:

```bash
read -rsp "Admin password: " AGENTLX_ADMIN_PASSWORD
printf '\n'
printf '%s' "$AGENTLX_ADMIN_PASSWORD" | docker compose --env-file .env.docker exec -T app node scripts/create-admin.mjs --name "Admin" --email "admin@agentlx.local" --password-stdin
unset AGENTLX_ADMIN_PASSWORD
```

Para confirmar quais variaveis o container esta recebendo:

```bash
docker compose --env-file .env.docker exec app printenv | grep -E 'POSTGRES|DATABASE|agentlx'
```

## Docker com banco externo

```bash
cp .env.docker.example .env.docker
docker compose --env-file .env.docker up -d --build app
```

Preencha `DATABASE_URL` apontando para o PostgreSQL externo.

## Comportamento do `docker-compose.yml`

O Compose atual tem dois jeitos de trabalhar:

- com `DATABASE_URL` explicita;
- sem `DATABASE_URL`, montando a string a partir de `POSTGRES_*`.

Por isso, alguns comandos do Docker Compose podem mostrar avisos de variavel vazia no shell do host mesmo quando o container `app` continua funcional com a configuracao interna.

## Reverse proxy / producao

O projeto foi pensado para ficar atras de um proxy HTTPS, como Nginx Proxy Manager, Traefik ou Nginx.

Pontos que precisam bater:

- `APP_ORIGIN` deve ser a URL publica real.
- O proxy deve encaminhar:
  - HTTP normal;
  - upgrade WebSocket para:
    - `/api/agent/tunnel`
    - `/api/terminal/ws`
- O host publicado precisa servir tambem os assets do build client.

## Runtime do agent publicado pela API

A API publica os artefatos do runtime diretamente do diretorio `agent-linux/`.

Endpoints relevantes:

- `/api/agent/install.sh`
- `/api/agent/update.sh`
- `/api/agent/files/runtime-manifest`
- `/api/agent/files/runtime?path=...`

Arquivos do runtime modular publicados hoje:

- `agent.py`
- `requirements.txt`
- `config.example.json`
- tudo dentro de `agentlx/`

Isso permite:

- instalacao remota controlada pelo painel;
- atualizacao do runtime sem copiar arquivo manualmente;
- limpeza de arquivos removidos pelo manifest.

## Agent Linux

## Estrutura do runtime

- `agent.py`
  - bootstrap simples.
- `agentlx/app.py`
  - comandos CLI e loop principal.
- `agentlx/transport.py`
  - cliente HTTP/WebSocket da API.
- `agentlx/terminal.py`
  - tunel persistente e sessoes PTY.
- `agentlx/system.py`
  - `systemd`, PID, shell commands, metricas e self-uninstall.
- `agentlx/inventory.py`
  - coleta e cache de inventario.
- `agentlx/executor.py`
  - executa acoes da fila.
- `agentlx/protocol.py`
  - tipos de payload e normalizacao de execucao.

## Exemplo de configuracao do agent

```json
{
  "api_base_url": "https://api.seudominio.com",
  "enrollment_token": "TOKEN_GERADO_NO_PAINEL",
  "agent_name": "srv-imapsync",
  "location": "DC-SP-01",
  "poll_interval_sec": 30,
  "heartbeat_interval_sec": 60,
  "inventory_refresh_interval_sec": 300,
  "terminal_output_batch_ms": 16,
  "terminal_working_directory": "",
  "agent_version": "agentlx-linux-0.1.0",
  "agent_secret": "",
  "machine_id": "",
  "agent_id": ""
}
```

Campos preenchidos depois do registro:

- `agent_secret`
- `machine_id`
- `agent_id`

## Instalacao inicial do agent

O fluxo recomendado e sempre gerar o comando pela UI em `Maquinas > Adicionar maquina`.

Exemplo do formato gerado:

```bash
curl -fsSL https://api.seudominio.com/api/agent/install.sh | sudo bash -s -- \
  --api-base-url https://api.seudominio.com \
  --enrollment-token TOKEN_UNICO \
  --location DC-SP-01
```

O instalador:

- valida se ja existe instalacao em `/opt/agentlx` por padrao;
- baixa o runtime modular;
- cria `config.json`;
- cria virtualenv;
- instala dependencias Python;
- roda `register`;
- instala e sobe o servico `agentlx` quando possivel.

## Atualizacao do agent

Para hosts ja instalados:

```bash
curl -fsSL https://api.seudominio.com/api/agent/update.sh -o /tmp/agentlx-update.sh
sudo bash /tmp/agentlx-update.sh --api-base-url https://api.seudominio.com
```

O `update.sh` atual:

- baixa o manifest do runtime;
- baixa apenas os arquivos declarados no manifest;
- remove arquivos antigos removidos do runtime;
- atualiza `agent.py` e `agentlx/*`;
- reinstala dependencias so quando necessario;
- reinstala e reinicia o servico apenas se houve mudanca;
- preserva `config.json`, incluindo `agent_id`, `machine_id` e `agent_secret`.

## Comandos uteis do agent

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

## Desinstalacao forcada do agent

Use primeiro a desinstalacao normal quando o agent ainda consegue autenticar na API:

```bash
sudo python3 /opt/agentlx/agent.py uninstall
```

Se a instalacao local estiver quebrada, com identidade/token invalido, ou o comando acima falhar com erro HTTP/autenticacao, remova tudo localmente antes de instalar de novo:

```bash
sudo systemctl stop agentlx 2>/dev/null || true
sudo systemctl disable agentlx 2>/dev/null || true
sudo rm -f /etc/systemd/system/agentlx.service
sudo systemctl daemon-reload
sudo systemctl reset-failed agentlx 2>/dev/null || true
sudo pkill -f '/opt/agentlx/agent.py' 2>/dev/null || true
sudo pkill -f 'agentlx' 2>/dev/null || true
sudo rm -rf /opt/agentlx
```

Confira se nao sobrou servico nem diretorio:

```bash
systemctl status agentlx --no-pager
ls -la /opt/agentlx
```

Esse procedimento remove apenas a instalacao local da maquina. Se o painel ainda mostrar a maquina antiga, remova pelo painel ou limpe/recrie o banco em ambiente de teste. Para reinstalar, gere um novo token de enrollment no painel e execute novamente o comando de instalacao.

## Scripts do projeto

Scripts reais definidos em `package.json` hoje:

| Script                                                               | Uso                                         |
| -------------------------------------------------------------------- | ------------------------------------------- |
| `npm run dev`                                                        | desenvolvimento                             |
| `npm run build`                                                      | build de producao                           |
| `npm run build:dev`                                                  | build em modo development                   |
| `npm run preview`                                                    | preview do build                            |
| `npm run start`                                                      | sobe o servidor Node da app                 |
| `npm run db:init`                                                    | aplica `db/schema.sql`                      |
| `npm run db:wait`                                                    | espera o PostgreSQL responder               |
| `npm run user:create-admin -- --name ... --email ... --password ...` | cria ou promove admin                       |
| `npm run agent:queue-command -- --machine ... --command ...`         | enfileira um comando remoto direto no banco |
| `npm run lint`                                                       | roda o ESLint                               |
| `npm run format`                                                     | formata o projeto com Prettier              |

## Healthcheck

Endpoint atual:

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

Scripts auxiliares fora do `package.json`, mas relevantes:

- `scripts/test-tmux-quick-actions.mjs`
  - valida o catalogo de quick actions do tmux.

## O que o script `agent:queue-command` faz

Ele nao fala com a maquina diretamente.

Na pratica ele:

1. resolve a maquina no banco;
2. insere uma linha em `action_executions` com comando mascarado e payload cifrado;
3. grava auditoria em `audit_logs`;
4. espera o agent consumir a fila;
5. mostra o status final e a saida.

Ele existe como ferramenta operacional e de suporte. Como aceita qualquer shell command remoto, deve ser tratado como utilitario administrativo.

## Templates padrao embarcados

Hoje o sistema sempre garante estes templates padrao:

- `carbonio-ssl-check`
- `carbonio-mailq-status`
- `system-disk-usage`
- `system-top-processes`
- `system-package-updates-debian`
- `system-package-updates-redhat`

Observacoes:

- templates personalizados tambem podem ser criados pela UI;
- a exclusao de um template cancela execucoes `queued` e `dispatched` ainda pendentes;
- execucoes historicas permanecem no log.

## Telemetria e regras de status

O status visual da maquina e derivado principalmente de:

- ultima vez vista;
- CPU;
- disco;
- percentual de RAM.

Regras atuais em `src/lib/formatting.ts`:

- `offline`
  - sem heartbeat ha pelo menos 180 segundos;
- `warning`
  - sem heartbeat ha pelo menos 90 segundos, ou CPU/disco/RAM em nivel alto;
- `online`
  - quando nada acima dispara alerta.

## Seguranca atual

### Aplicacao

- sessao em cookie `agentlx_session`;
- cookie `Secure` quando a origem e HTTPS e sempre em producao;
- protecao por tela;
- protecao por role;
- verificacao de origem em server functions mutadoras;
- verificacao de origem tambem nos endpoints HTTP autenticados por cookie, inclusive SSE de presenca e fechamento de terminal;
- validacao de acesso real a maquina no stream de presenca do terminal;
- hash de senha via `scrypt`;
- headers de endurecimento HTTP:
  - HSTS;
  - CSP;
  - `frame-ancestors 'none'`;
  - `Referrer-Policy: no-referrer`;
  - `X-Content-Type-Options: nosniff`;
- criacao do primeiro admin apenas via `scripts/create-admin.mjs`.

### Enrollment do agent

- o token gerado pela UI nao e salvo em texto puro;
- ele e cifrado com AES-256-GCM usando `AGENTLX_PENDING_TOKEN_SECRET`;
- possui expiracao;
- e consumido no primeiro registro valido.

### Credencial do agent

- o `agent_secret` e emitido apenas no registro inicial ou re-registro autorizado por enrollment;
- o agent nunca envia o segredo em Bearer; ele envia `Authorization: Agent <agent_id>`;
- o segredo fica cifrado no banco e persistido localmente em `config.json`;
- nao ha rotacao automatica que invalide a comunicacao sem uma nova instalacao ou re-registro explicito;
- cada requisicao HTTP operacional e o tunel WebSocket precisam ser assinados com:
  - `x-agent-auth-version`;
  - `x-agent-auth-timestamp`;
  - `x-agent-auth-nonce`;
  - `x-agent-auth-signature`;
- a assinatura usa HMAC-SHA256 sobre metodo, path, timestamp, nonce e hash do corpo;
- o backend rejeita replay com nonce reutilizado e aplica janela de tempo;
- nao ha fallback Bearer para endpoints operacionais do agent;
- agents antigos precisam ser reinstalados ou re-registrados para falar o protocolo v2.

### Execucoes, logs e saidas

- comandos enfileirados passam a ser persistidos em duas formas:
  - mascarada para leitura no painel;
  - cifrada para execucao real no agent;
- saidas e erros retornados pelo agent passam por redaction antes de serem gravados;
- mascaramento cobre casos comuns como:
  - `Authorization`;
  - bearer token;
  - `password`, `secret`, `token`, `api_key`;
  - chaves privadas PEM;
  - linhas estilo `.env` com segredos.

### Auditoria

- `audit_logs` agora suporta severidade (`info`, `notice`, `warn`, `critical`);
- eventos relevantes recebem `metadata_json` com contexto adicional;
- cada registro pode apontar para o hash anterior e para seu proprio hash de integridade;
- o sistema ja registra com prioridade reforcada eventos como:
  - criacao de admin;
  - troca de role;
  - novo agent registrado ou re-registrado;
  - uninstall do agent;
  - comandos sensiveis;
  - muitas falhas de login.

### Runtime remoto

- o terminal remoto depende de:
  - sessao autenticada no painel;
  - tunel persistente do agent;
  - validacao da origem `APP_ORIGIN`.

## Operacao do terminal remoto

Recursos importantes que ja existem hoje:

- quick actions de tmux com busca;
- deteccao se o tmux esta ativo;
- botao para iniciar ou reanexar `tmux new-session -A -s main`;
- envio de templates direto do terminal conectado;
- copy/paste integrado ao clipboard do navegador;
- fechamento automatico da sessao quando o navegador some ou a pagina fecha.

## Seed de demonstracao

Quando `AGENTLX_SEED_ON_BOOT=true` e nao existem maquinas, o backend pode carregar um dataset demo com:

- varias maquinas ficticias;
- inventarios;
- status;
- execucoes;
- logs de auditoria.

Esse seed mora em `src/server/seed.server.ts`.

Para ambiente real, use:

```env
AGENTLX_SEED_ON_BOOT=false
```

## Troubleshooting

### O painel abre, mas sem estilo

Verifique se os assets em `/assets/*` estao sendo servidos pelo app e encaminhados pelo proxy.

### O agent registra, mas nao executa nada

Verifique:

- `config.json`;
- acesso da maquina a `APP_ORIGIN`;
- status do servico `agentlx`;
- logs do `journalctl -u agentlx -f`;
- se o tunel `/api/agent/tunnel` consegue conectar.

### O terminal remoto nao conecta

Verifique:

- se a maquina esta `online`;
- se o agent atual abriu tunel persistente;
- se o proxy repassa upgrade WebSocket;
- se `APP_ORIGIN` corresponde exatamente ao dominio acessado pelo navegador.

### O host Linux e muito antigo

Ambientes legados podem falhar por:

- TLS antigo;
- `curl` velho;
- falta de `python3`;
- falta de `venv`;
- falta de `systemd`.

O alvo real do instalador atual sao distribuicoes Linux modernas.

## Validacao recomendada depois de subir o sistema

1. Acesse a aplicacao web.
2. Confirme o healthcheck e o login.
3. Crie o primeiro admin com `scripts/create-admin.mjs`.
4. Gere um enrollment em `Maquinas`.
5. Instale o agent em uma maquina Linux de teste.
6. Confirme que a maquina aparece no painel.
7. Abra o terminal remoto.
8. Execute um template ou use `agent:queue-command`.
9. Confira o retorno em `Logs`.

## Resumo do estado atual do projeto

Hoje o agentlx e composto por:

- uma aplicacao unica Node/React para UI, API e WebSocket;
- um banco PostgreSQL com modelo de execucao, auditoria, usuarios, grupos e enrollment;
- um agent Linux Python modular com install/update oficiais;
- um terminal remoto em tempo real sobre tunel persistente;
- uma camada de acesso por grupos e por telas.

O README antigo descrevia uma fase inicial do produto. Este documento passa a refletir o codigo atual do repositorio neste momento.
