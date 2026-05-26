# AgentLX Community e Enterprise

O AgentLX segue um modelo Open Core:

- **AgentLX Community**: repositorio publico, licenca Apache-2.0 e recursos essenciais open source.
- **AgentLX Enterprise**: camada privada proprietaria com licenciamento, governanca, compliance, integracoes e recursos de escala.

## Separacao tecnica

O projeto publico declara o catalogo e os contratos de recursos enterprise em
`src/lib/edition.ts` e `src/enterprise/types.ts`, alem de stubs em
`src/enterprise`. Recursos pagos nao devem ter a implementacao operacional
completa no repositorio publico com apenas um `if` de licenca na frente.

No build Community, o alias `@agentlx/enterprise` aponta para `src/enterprise/community.ts`. Esse provider sempre retorna `edition: "community"` e bloqueia recursos Enterprise.

No build Enterprise, o alias `@agentlx/enterprise` aponta para o pacote privado
`agentlx-enterprise/src/index.ts`. Esse pacote valida a licenca, expoe os
recursos habilitados, registra migracoes adicionais e entrega a implementacao
dos recursos proprietarios.

Exemplo atual: a Community conhece o contrato de `recurring_jobs`, mas nao
contem o SQL/comportamento que cria ou materializa recorrencias. Criar, listar,
cancelar e materializar execucoes recorrentes fica no overlay privado
`agentlx-enterprise`.

A Community tambem conhece apenas o contrato de limites para recursos
gerenciados. O provider Community aplica o teto open source de 10 maquinas, 10
templates e 10 grupos; o provider Enterprise calcula esses limites a partir da
licenca assinada. A base publica chama esse contrato antes de criar enrollment,
registrar nova maquina, criar template ou criar grupo, sem embutir a politica
comercial de escala no codigo publico.

Cada compra aprovada no AgentLX Cloud gera uma licenca individual com `tier`
(`starter`, `pro` ou `enterprise`), `features` e `limits`. A ativacao online
vincula essa licenca a uma unica instalacao ativa; se o cliente comprar tres
licencas Enterprise, a Cloud emite tres licencas independentes e cada uma pode
ser instalada em uma maquina diferente.

## Recursos controlados

- Auditoria avancada
- Execucoes recorrentes
- Colaboracao em terminal
- SSO/SAML/OIDC
- RBAC avancado
- Politicas de maquinas
- Exportacao de relatorios
- Limites de alta escala

## Build

Community:

```bash
npm run build
```

Enterprise:

```bash
AGENTLX_EDITION=enterprise npm run build:enterprise
```

Imagem enterprise a partir do diretorio que contem `agentlx` e `agentlx-enterprise`:

```bash
git -C agentlx pull --ff-only
git -C agentlx-enterprise pull --ff-only
docker build -f agentlx-enterprise/Dockerfile -t ghcr.io/agentlx/agentlx-enterprise:latest .
```

Build e push da imagem Enterprise publicada no Harbor:

```bash
docker build -f agentlx-enterprise/Dockerfile \
  -t registry.agentlx.com.br/agentlx/agentlx-enterprise:stable .
docker push registry.agentlx.com.br/agentlx/agentlx-enterprise:stable
```

No ambiente publicado, o GitHub e a fonte oficial do estado dos projetos; faca
commit/push localmente e use `git pull --ff-only` no servidor antes do build da
imagem.

## Licenca

A edicao Enterprise aceita:

- `AGENTLX_LICENSE`
- `AGENTLX_LICENSE_FILE`
- `AGENTLX_LICENSE_PUBLIC_KEY`

O formato esperado e:

```text
AGENTLX-LICENSE-v1.payload.signature
```

O payload e assinado com Ed25519. A chave privada deve ficar apenas na ferramenta interna de emissao de licencas; o runtime Enterprise recebe somente a chave publica.

O AgentLX Community nunca recebe credenciais de registry nem controles
administrativos. Ele consulta somente o provider Enterprise (`hasFeature`,
`requireFeature`, estado da licenca e limites de recursos) para decidir quais
funcionalidades proprietarias podem funcionar na instalacao atual.
