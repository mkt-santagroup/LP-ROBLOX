# LP Roblox — Brazilian Life RP

Landing page de **redirecionamento** + painel de métricas (`/admin`).

A LP não tem mais vídeo: quem entra vê a tela “Estamos redirecionando você pro jogo”
por ~4 segundos e é mandado automaticamente pro link do jogo. O painel `/admin`
mostra acessos, conversões, resgates de codiguin e gasto de anúncios.

---

## Rodando localmente

**Pré-requisito:** Node.js

```bash
npm install
cp .env.example .env    # depois preencha o .env (veja abaixo)
npm run dev             # http://localhost:5180
```

Outros comandos:

| Comando | O que faz |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento na porta 5180 |
| `npm run build` | build de produção em `dist/` |
| `npm run preview` | serve o build de produção |
| `npm run lint` | checagem de tipos (`tsc --noEmit`) |

> **O Vite só lê o `.env` na inicialização.** Depois de editar o arquivo,
> pare o servidor (Ctrl+C) e rode `npm run dev` de novo.

---

## Configuração

### 1. `.env` (obrigatório)

O `.env` já vem comentado explicando cada variável. O mínimo pra funcionar:

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
VITE_ADMIN_PASSWORD=sua_senha
```

Pegue a URL e a chave em **Supabase → Project Settings → Data API**
(“Project URL” e a chave **anon public** — nunca a `service_role`).

> ⚠️ Tudo que começa com `VITE_` é embutido no bundle e fica **público** no navegador.

### 2. Migrations do banco

No **SQL Editor** do Supabase, rode os arquivos de `supabase/migrations/` em ordem.
Todos são idempotentes (pode rodar de novo sem quebrar nada). As duas mais recentes:

| Migration | O que cria |
| --- | --- |
| `20260801_add_redirect_tracking_to_lp_roblox.sql` | colunas que separam redirect automático de clique manual no painel |
| `20260803_add_meta_ad_identifiers_to_lp_roblox.sql` | identificadores de anúncio do Meta (`fbclid`, `fbc`, `fbp`, `conversion_event_id`, `campaign_params`) |

> Enquanto elas não rodam, a LP continua funcionando e ainda registra a conversão:
> o código tenta gravar com as colunas novas e, se o banco recusar, repete sem
> elas. Perde-se o detalhe (como a pessoa saiu, de qual anúncio veio), nunca o
> registro do visitante nem a conversão. O console avisa quando isso acontece.

### 3. Resto no painel

Com o banco conectado, o que sobra é configurado em **`/admin/configuracoes`**,
sem precisar de deploy:

- link de redirecionamento e tempo de espera da LP;
- token, conta de anúncios e tag de campanha do Meta.

---

## Como o link de redirecionamento é escolhido

Do mais específico pro mais genérico — vale o primeiro que existir:

1. **Link do influencer** — cadastrado em `/admin/influenciadores` (por pessoa);
2. **Link global** — `/admin/configuracoes` (muda na hora, sem deploy);
3. **`VITE_REDIRECT_URL`** — do `.env` (precisa de rebuild);
4. **Padrão embutido** — em `src/lib/appConfig.ts`.

Essa cascata existe pra que a LP **sempre** tenha pra onde mandar a pessoa: se o
Supabase estiver fora do ar ou demorar demais, ela cai pro `.env` e redireciona
do mesmo jeito, sem travar na tela de espera.

---

## O que o painel mede

A LP tem duas saídas possíveis pro jogo, e o painel separa as duas porque a
diferença entre elas é diagnóstico:

| Métrica | O que é |
| --- | --- |
| **Usuários únicos** | quantas pessoas chegaram na tela de espera (`visitor_id`) |
| **Redirecionados** | quantas de fato foram mandadas pro jogo |
| **Saíram antes** | chegaram e fecharam a página sem chegar no jogo |
| **Redirect automático** | o timer estourou e a página foi sozinha — o fluxo esperado |
| **Clicaram no link antes** | tocaram em *"Não abriu? Toque aqui"* **antes** do timer |

**Clique manual subindo é sinal de problema:** ou o tempo de espera está longo
demais (ajuste em `/admin/configuracoes`), ou o navegador in-app do Instagram/TikTok
está segurando o redirect automático daquele público. Se o mesmo visitante toca
mais de uma vez, `manual_clicks` acumula — é o sintoma mais forte de redirect travado.

Todas essas métricas respeitam o filtro de influenciador e aparecem quebradas por
pessoa (e por rede social) no ranking de origem.

Duas coisas garantem que "redirecionados" não seja subestimado:

- a gravação vai com `keepalive`, então ela **termina mesmo depois** de a página
  sair do ar — antes, toda conexão mais lenta que o teto de espera perdia o registro;
- o redirect tem um `setTimeout` de segurança além do `requestAnimationFrame`, que o
  navegador **pausa** em aba de segundo plano. Sem ele, quem abria o link numa aba
  de fundo nunca era redirecionado e entrava na conta como "saiu antes".

---

## Pixel do Meta e rastreamento de anúncio

O pixel fica **no código** (`src/lib/metaPixel.ts`) e dispara **dois eventos, só
dois**:

| Evento | Quando |
| --- | --- |
| `PageView` | a pessoa abre a LP |
| `Reencaminhado` | **a conversão** — a pessoa é mandada pro jogo |

O ID do pixel vem de `VITE_META_PIXEL_ID` (vazio = o padrão embutido no arquivo).

> ⚠️ `Reencaminhado` é evento **personalizado** (`trackCustom`) — não está na
> lista fechada de eventos padrão do Meta. Pra otimizar campanha por ele é
> preciso criar uma **Conversão personalizada** no Events Manager apontando pra
> esse nome.

**O GTM (`GTM-TL5N76RP`) foi removido da página em 03/ago.** Não há mais nenhuma
camada de tag entre o código e o Meta. O diagnóstico que motivou isso, medido na
Graph API do próprio pixel, está em [`docs/pixel-meta.md`](docs/pixel-meta.md) —
em resumo: a conversão estava praticamente morta (56 pageviews para 3 conversões
em 24h) e as tags órfãs da era do vídeo despejavam **~193 eventos falsos por
dia** de "assistiu 10/25/50/75/90%" numa página sem vídeo, poluindo os públicos
de remarketing.

**O que vai junto dos dois eventos:**

- **Advanced Matching:** `external_id` (o `visitor_id`) e `country` (deduzido do
  fuso do navegador). São os únicos dois da lista fechada do Meta que a LP tem
  como preencher — e-mail, telefone, nome, nascimento, cidade, estado e CEP
  exigem dados que uma tela de redirect de 4s simplesmente não coleta.
- **`fbc`/`fbp`:** não são parâmetros — o pixel lê os cookies sozinho. O `fbc`
  nasce do `?fbclid=` na URL, e é o que mais pesa na correspondência; por isso a
  LP **devolve pra URL** o `fbclid` de quem clicou num anúncio nos últimos 90
  dias e voltou por outro caminho, deixando o pixel montar o cookie.
- **IP e user agent:** o Meta preenche sozinho no lado dele.
- **Parâmetros personalizados:** influencer, rede social, device, UTMs e
  `campaign_id`/`adset_id`/`ad_id` — mais `redirect_mode` e `tempo_na_pagina_ms`
  na conversão.
- **`eventID`:** nos dois eventos, pra deduplicar com um envio server-side.

Duas garantias na saída pro jogo:

- a navegação espera o beacon do pixel sair, com teto de 600ms. Sem isso o
  navegador cancelava a requisição e a conversão nunca chegava ao Meta — o painel
  contava redirecionamentos que o Events Manager não via;
- se as migrations novas não tiverem rodado, a escrita cai pro conjunto básico de
  colunas em vez de falhar inteira.

> **Detalhes e como testar em [`docs/pixel-meta.md`](docs/pixel-meta.md)**.
> Esse documento também explica por que a conversão de redirect, sozinha, é um
> sinal fraco pra otimização, e onde está o sinal quente de verdade
> (`robux_spent` / `play_time` em `coupon_usages`, via Conversions API).

---

## Rotas

| Rota | O que é |
| --- | --- |
| `/` | LP de redirecionamento |
| `/:influencer` | mesma LP, atribuindo o acesso a um influencer |
| `/:influencer/:rede` | idem, também registrando a rede social (`/nathan/instagram`) |
| `/admin` | dashboard de métricas |
| `/admin/influenciadores` | cadastro de influencers e geração de links |
| `/admin/anuncios` | métricas de campanhas do Meta |
| `/admin/configuracoes` | link de redirect, tempo de espera, credenciais do Meta e diagnóstico da conexão |

O `/admin` é protegido só por uma senha de tela (`VITE_ADMIN_PASSWORD`). Ela **não**
protege o banco — quem tiver a URL e a anon key acessa os dados direto. Pra fechar
isso de verdade seria preciso usar Supabase Auth com RLS por usuário autenticado.

---

## Quando o painel não mostra nada

Abra **`/admin/configuracoes`** — a primeira seção testa a conexão e diz o motivo
exato. Uma faixa vermelha também aparece no topo do painel quando o banco não responde.

O caso mais comum é `ERR_NAME_NOT_RESOLVED` no console: o domínio do projeto não
existe mais no DNS. Isso **não** é problema de chave — acontece quando o projeto
está pausado (o plano free pausa sozinho depois de ~7 dias parado; basta clicar em
*Restore project*) ou quando ele foi apagado/recriado e a Project URL mudou.
