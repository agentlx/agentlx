# agentlx Linux agent

Agent em Python para o fluxo inicial do projeto:

- registra a maquina no backend;
- usa `machine_id` e `agent_id` proprios para identificar o cadastro, sem depender do hostname;
- envia heartbeat com telemetria rapida;
- usa um runtime modular com dispatcher de acoes e bootstrap fino em `agent.py`;
- identifica a distribuicao Linux real via `os-release`;
- detecta Carbonio e servicos comuns em refresh lento com cache local;
- consulta execucoes pendentes;
- mantem tunel persistente WebSocket para PTY remoto em tempo real;
- executa comandos recebidos da API;
- devolve resultado para o painel.

## Uso

1. Copie `agent-linux/config.example.json` para `agent-linux/config.json`.
2. Ajuste `api_base_url` e `enrollment_token`.
3. Instale as dependencias Python do agent:

```bash
pip install -r requirements.txt
```

Exemplo em producao:

```json
{
  "api_base_url": "https://api.seudominio.com",
  "enrollment_token": "token-forte-de-enrollment",
  "heartbeat_interval_sec": 60,
  "inventory_refresh_interval_sec": 300,
  "terminal_output_batch_ms": 50,
  "terminal_working_directory": "/root"
}
```

4. Registre o agent:

```bash
python agent.py register
```

Se o `register` for executado como `root` em Linux com `systemd`, o serviço `agentlx` é instalado e iniciado automaticamente ao final do cadastro.

5. Para iniciar em background manualmente:

```bash
python agent.py run
```

O comando acima nao prende mais o terminal. Ele cria um processo em background e grava logs em `agent-linux/agent.log`.

Comandos uteis:

```bash
python agent.py status
python agent.py stop
python agent.py run-foreground
sudo python agent.py uninstall
```

## Coleta otimizada

- o `agent.py` virou apenas bootstrap; a logica fica no pacote `agentlx/`.
- a execucao remota passa por dispatcher de acoes (`run_shell`, `agent_self_uninstall`) para manter o protocolo organizado.
- CPU e lida via `/proc/stat`, sem chamar `top`.
- Disco e lido via `os.statvfs()`, sem chamar `df`.
- Memoria e uptime continuam vindo de `/proc`.
- Inventario lento e servicos ficam em cache local e so sao recalculados no intervalo configurado.
- heartbeat e poll podem ter intervalos independentes via `heartbeat_interval_sec`, reduzindo carga sem aumentar a latencia de execucao.
- O agent evita `shell=True` na coleta local e usa shell apenas quando precisa executar comandos remotos com pipes, redirecionamentos ou outros recursos de shell.
- O terminal remoto pode abrir direto em um diretorio fixo com `terminal_working_directory`; quando vazio, o agent usa `/root` para root ou a `HOME` do usuario do processo.

## Rodando como servico no boot com auto-restart

Em producao, prefira instalar como servico `systemd`:

```bash
sudo python agent.py install-service
```

Esse comando:

- cria `agentlx.service` em `/etc/systemd/system/`;
- inicia automaticamente no boot;
- reinicia sozinho se o processo cair;
- executa o agent sem depender de terminal aberto.

Para remover:

```bash
sudo python agent.py uninstall-service
```

Para desinstalar completamente o agent da maquina e remove-lo do painel:

```bash
sudo python agent.py uninstall
```

## Instalacao automatizada com `install.sh`

O projeto agora inclui um instalador oficial em `agent-linux/install.sh`.

Quando a API do painel estiver no ar, ela mesma publica:

- `/api/agent/install.sh`
- `/api/agent/update.sh`
- `/api/agent/files/runtime-manifest`
- `/api/agent/files/runtime?path=...`

O uso recomendado e gerar um token unico no painel em `Maquinas > Adicionar maquina` e executar o comando entregue por ele. Um exemplo fica assim:

```bash
curl -fsSL https://api.seudominio.com/api/agent/install.sh | sudo bash -s -- \
  --api-base-url https://api.seudominio.com \
  --enrollment-token TOKEN_UNICO_GERADO_NO_PAINEL \
  --location DC-SP-01
```

O instalador:

- instala `python3`, `pip` e dependencias basicas se faltarem;
- baixa ou copia o runtime modular completo do agent;
- gera `config.json` com os parametros informados;
- cria virtualenv em `/opt/agentlx/.venv`;
- instala as dependencias Python;
- roda `python3 agent.py register`;
- valida o servico `agentlx` no `systemd`.

Antes de instalar, o script verifica se ja existe uma instalacao anterior valida e, nesse caso, recusa a nova instalacao para evitar duplicar o cadastro da maquina.

Observacoes:

- por padrao, a instalacao vai para `/opt/agentlx`;
- o `install.sh` e o `update.sh` servidos pela API ja apontam automaticamente para o manifesto do runtime e para os arquivos modulares;
- cada token gerado no painel so autoriza uma maquina e expira em 10 minutos se nao for consumido.

## Atualizacao com `update.sh`

O atualizador passa a baixar o manifesto do runtime, sincronizar os arquivos do pacote `agentlx/`, preservar `config.json` e remover arquivos antigos que deixaram de fazer parte do runtime.

Uso tipico:

```bash
curl -fsSL https://api.seudominio.com/api/agent/update.sh | sudo bash
```

Diagnostico operacional do servico e do tunel:

```bash
sudo systemctl status agentlx --no-pager
sudo journalctl -u agentlx -n 120 --no-pager
sudo /opt/agentlx/.venv/bin/python -m pip show websockets
curl -fsSL https://api.seudominio.com/api/agent/update.sh | sudo bash
sudo systemctl restart agentlx
```

Se o tunel WebSocket nao iniciar, o agent deve continuar mantendo heartbeat,
poll da fila e extensoes Enterprise. Apos atualizar, confirme nos logs a linha
`[agent][tunnel] conectado`.

O `ExecStart` do systemd deve apontar para `/opt/agentlx/.venv/bin/python`.
Se aparecer `/usr/bin/python3` ou erro de dependencia ausente para
`websockets`, rode o `update.sh` novamente para regenerar a unit com a
virtualenv correta.

O `update.sh` usa um diretorio temporario por execucao e deve finalizar sem
erro de cleanup como `tmp_dir: unbound variable`; se isso aparecer, baixe o
atualizador mais recente pela API e execute novamente.

## Requisitos minimos

Para o instalador automatico e o agent funcionarem corretamente, o host precisa ter perfil de sistema moderno:

- `curl` com suporte a TLS 1.2+
- `python3`
- `python3-venv`
- `systemd`
- ambiente Linux atual com suporte a `os-release`

Exemplos de base suportada na pratica:

- Debian 11+
- Ubuntu 20.04+
- RHEL / Rocky / AlmaLinux 8+
- CentOS Stream 8+

## Sistemas legados nao suportados

Distribuicoes muito antigas, como familias `RHEL/CentOS 5`, ficam fora do suporte do instalador atual.

Sintomas comuns:

- `curl: (35) ... tlsv1 alert protocol version`
- `OpenSSL 0.9.8`
- falta de `python3`
- falta de `venv`
- falta de `systemd`
- falta de `/etc/os-release`

Exemplo de stack incompatível:

- `curl 7.29.0`
- `OpenSSL 0.9.8e-fips-rhel5`

Nesses casos, o recomendado e atualizar ou migrar o sistema operacional antes de tentar instalar o agent.

## Seguranca do MVP

- o cadastro inicial exige `x-agent-enrollment-token` unico, gerado no painel;
- depois do cadastro, o agent usa `Authorization: Agent <agent_id>`;
- o `agent_secret` fica persistido localmente e nunca trafega como Bearer;
- heartbeat, poll, envio de resultado, decommission e tunel WebSocket exigem headers `x-agent-auth-*`;
- a assinatura usa HMAC-SHA256 com timestamp e nonce unicos por requisicao;
- o backend aplica janela de tempo e protecao contra replay;
- nao ha fallback Bearer nos endpoints operacionais do agent;
- o backend so enfileira templates conhecidos;
- o agent executa apenas o comando retornado pela API para o template liberado.
- quando o tunel persistente estiver online, a API envia um aviso imediato via WebSocket para antecipar o proximo poll e reduzir a latencia das execucoes.
