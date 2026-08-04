# Pixel do Meta — 2 disparos, direto no código

---

## 1. O que dispara

Dois eventos. Só dois. Ambos ficam em [`src/lib/metaPixel.ts`](../src/lib/metaPixel.ts).

| # | Evento | Quando | Onde no código |
| --- | --- | --- | --- |
| 1 | `PageView` | a pessoa abre a LP | `initMetaPixel()`, na montagem do `useRobloxAnalytics` |
| 2 | `Reencaminhado` | **a conversão** — a pessoa é mandada pro jogo | `trackMetaConversion()`, dentro de `trackRedirect()` |

> ⚠️ **`Reencaminhado` é evento PERSONALIZADO** (`trackCustom`), não um dos
> padrão do Meta — a lista de padrão é fechada (`Lead`, `Purchase`,
> `CompleteRegistration`…) e esse nome não está nela.
>
> **Consequência prática:** pra otimizar campanha por ele é preciso criar uma
> **Conversão personalizada** no Events Manager apontando pro nome
> `Reencaminhado`. Sem isso ele aparece nos relatórios, mas não fica disponível
> como objetivo de otimização.

O `Reencaminhado` sai **uma vez por acesso**. Se a pessoa tocar no link de escape
depois do redirect automático já ter disparado, o toque só engrossa
`manual_clicks` no banco — o pixel não repete.

---

## 2. Tudo que vai junto dos eventos

### 2.1 Advanced Matching — o que define a qualidade da correspondência

O `fbevents.js` aceita **exatamente** estas chaves (conferido no próprio
arquivo): `em, ph, fn, ln, ge, db, ct, st, zp, country, external_id,
subscription_id`.

Vão nos dois eventos, via `fbq('init', …)`, **crus** — quem faz o SHA-256 é o
próprio pixel no navegador (ao contrário da Conversions API, onde o hash é
responsabilidade de quem manda).

| Campo | Valor | Origem |
| --- | --- | --- |
| `external_id` | o `visitor_id` da LP | `localStorage`, estável por navegador |
| `country` | `br` | deduzido do fuso horário do navegador (`Intl`), com o idioma como reserva |

O Meta pede explicitamente que o país vá **sempre**, mesmo quando é sempre o
mesmo, porque a correspondência é global. Vale a ressalva de que ele é
**deduzido**, não declarado: VPN ou pessoa viajando pode sair errado.

#### Os campos que NÃO dá pra mandar — e por quê

`em` (e-mail), `ph` (telefone), `fn`/`ln` (nome/sobrenome), `db` (nascimento),
`ge` (gênero), `ct` (cidade), `st` (estado), `zp` (CEP).

**A LP não coleta nenhum desses dados.** Ela é uma tela de redirecionamento de
~4 segundos: não tem formulário, não tem cadastro, não pergunta nada a ninguém.

Preencher com palpite **pioraria** a correspondência em vez de melhorar — o
pixel faz hash do que receber, e hash de dado errado não casa com pessoa
nenhuma. Cidade e estado por geolocalização de IP caem no mesmo problema: o IP
costuma devolver a cidade do provedor, não a da pessoa.

Se um dia a LP passar a pedir algum desses dados, é só acrescentar em
`buildAdvancedMatching()` (em `src/lib/metaPixel.ts`) que ele já entra nos dois
eventos.

### 2.2 `fbc` e `fbp` — não são parâmetros

O pixel lê os cookies `_fbc`/`_fbp` sozinho; não existe API pra passá-los na
mão no navegador (só na Conversions API).

O `fbc` é o parâmetro que **mais pesa** na qualidade da correspondência (+32% no
diagnóstico do Events Manager) e nasce do `?fbclid=` na URL. Por isso
`restoreFbclidToUrl()` roda **antes** do `init`: quem clicou num anúncio nos
últimos 90 dias e hoje voltou por outro caminho (link do influencer, digitando a
URL) chega sem `fbclid` e sem cookie — a função devolve o `fbclid` guardado pra
query string e deixa o **pixel** montar o cookie, no escopo e no formato dele.

> Escrever o cookie `_fbc` na mão seria pior: o pixel escolhe o domínio subindo
> pelos níveis do host até achar o mais amplo que cola, e um cookie nosso num
> escopo diferente viraria **dois** `_fbc` com o mesmo nome, sem jeito confiável
> de saber qual vale.

A janela de 90 dias é a mesma do cookie do pixel — clique mais velho está fora
da janela de atribuição do Meta e não é restaurado.

### 2.3 IP e user agent

Preenchidos pelo Meta automaticamente, por serem parte de como a requisição
chega até ele. **Não há nada a fazer no código.** (No server-side é diferente:
lá `client_ip_address` e `client_user_agent` precisam ir na mão.)

### 2.4 Parâmetros personalizados

Não contam pra qualidade da correspondência, mas aparecem no Events Manager e
servem pra montar Conversões personalizadas e públicos. Vão nos dois eventos:

| Parâmetro | O que é |
| --- | --- |
| `influencer` / `rede_social` | de onde veio o tráfego (`/nathan/instagram`) |
| `device` | `mobile`, `tablet` ou `desktop` |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` | os UTMs da URL do anúncio |
| `campaign_id`, `adset_id`, `ad_id` | preenchidos pelo Meta quando o gestor usa as macros `{{campaign.id}}` / `{{adset.id}}` / `{{ad.id}}` na URL do anúncio — é o que permite dizer qual **anúncio específico** trouxe quem converteu |

Só no `Reencaminhado`:

| Parâmetro | O que é |
| --- | --- |
| `redirect_mode` | `auto` (o timer estourou) ou `manual` (tocou no link de escape) |
| `tempo_na_pagina_ms` | quanto tempo a pessoa ficou na tela de espera |

Campo vazio é **removido** antes de mandar — valor nulo viraria ruído.

### 2.5 `eventID`

Vai no 3º argumento do `track`, nos dois eventos. Serve pra deduplicar quando o
mesmo evento também for mandado pelo servidor (Conversions API): os dois lados
mandam o mesmo id e o Meta conta uma vez só. O da conversão é gravado em
`conversion_event_id` no banco, justamente pra que o envio server-side reuse ele.

---

## 3. Como configurar

No `.env`:

```env
VITE_META_PIXEL_ID=1594793878256072
```

Só os números do ID — pega em **Events Manager → Fontes de dados → seu pixel**.
Vazio (ou valor inválido) cai no padrão embutido em `src/lib/metaPixel.ts`.

O Vite lê o `.env` **só no boot**: depois de editar, reinicie o `npm run dev` e,
em produção, faça rebuild + deploy.

---

## 4. O GTM foi removido (03/ago)

O container `GTM-TL5N76RP` **não está mais na página**. Não existe nenhuma
camada de tag entre o código e o Meta.

### Por quê — os números que decidiram

Diagnóstico feito em 03/ago pela Graph API (`/{pixel_id}/stats`), últimas 24h do
pixel `Pixel SG - Roblox #01`:

| Evento | 24h |
| --- | --- |
| PageView | 56 |
| ViewContent10 / 25 / 50 / 75 | 41 cada |
| ViewContent90 | 29 |
| **Lead** (a conversão) | **3** |

Duas coisas saltam:

**1. A conversão estava morta.** 56 aberturas de página, 3 conversões. Numa LP
onde ~100% de quem abre é redirecionado, `Lead` deveria acompanhar o PageView.
As tags de conversão dependiam de gatilhos que morreram quando o vídeo saiu da
página em 01/ago (`video_play`, `video_progress`, `clique_bloqueado`, classe
`state_unlock`) — morreram **em silêncio**, com o site parecendo saudável.

**2. ~193 eventos falsos por dia.** Os `ViewContent10..90` disparavam em bloco,
praticamente um conjunto completo por pageview, numa página **sem vídeo desde
01/ago**. O `ViewContent90` ficava pra trás (29 contra 41) porque a página
redireciona antes do último gatilho de tempo — a assinatura de tags em **gatilho
de tempo**, sobras da era do vídeo.

O custo disso não é cosmético: `ViewContent` é evento **padrão** do Meta, usado
em otimização e público de remarketing. Os públicos estavam sendo montados em
cima de gente que "assistiu 75% de um vídeo" inexistente — sinal 4× mais poluído
que limpo.

### Se um dia precisar de Google Analytics / Google Ads

O caminho é a tag própria de cada um, direto no `index.html`. Um container que
ninguém audita foi exatamente o que produziu os dois problemas acima.

---

## 5. Como testar

1. **Console do navegador** — abrir a LP e conferir as duas linhas:
   `[PIXEL] PageView -> <id> | matching: external_id, country` na abertura e
   `[PIXEL] Reencaminhado (conversão) -> <id>` na saída pro jogo.
2. **Meta Pixel Helper** (extensão do Chrome) — confirmar `PageView` **1×** e
   `Reencaminhado` **1×** por acesso. Se aparecer duplicado, é tag sobrando no GTM.
3. **Events Manager → Test Events** — confirmar que o `Reencaminhado` chega com
   `external_id` e `country` reconhecidos.
4. **Teste do `fbclid`** — abrir a LP com `?fbclid=teste123` e conferir no banco
   (`lp_roblox.fbclid` / `fbc`) que a captura funcionou.
5. **Teste da restauração** — depois do passo 4, abrir a LP **sem** `?fbclid=`.
   O console deve mostrar `| fbclid restaurado` e a URL deve ganhar o parâmetro
   de volta.
6. **Qualidade da correspondência** — Events Manager → o evento → *Qualidade da
   correspondência de eventos*. Os parâmetros compartilhados devem listar
   Endereço IP, Agente do usuário, `fbp`, Identificação externa e — para quem
   veio de anúncio — `fbc`.

### O termômetro que importa

Comparar, no mesmo período:

- **Redirecionados** no painel `/admin`
- **Reencaminhado** no Events Manager

Os dois deveriam andar juntos. O site espera o beacon do pixel sair antes de
navegar (teto de 600ms) justamente pra isso — antes ele navegava na hora e o
navegador cancelava a requisição, então o painel contava redirecionamentos que o
Meta nunca via.

Se ainda divergirem muito: **Meta > painel** é tag duplicada (confira o GTM);
**Meta < painel** é adblock/ITP, que é perda esperada.

---

## 6. O que isto NÃO resolve

Vale o alinhamento com o gestor de tráfego, porque é uma limitação de estratégia
e não de implementação:

**A LP é um redirect de ~4 segundos. Ninguém faz nada dentro dela.** Todo mundo
que abre e espera é redirecionado, então o `Reencaminhado` dispara pra
praticamente 100% dos visitantes.

Um evento que dispara pra todo mundo **não ensina nada ao algoritmo** — não
existe diferença entre o clique bom e o ruim pra ele aprender. Otimizar por essa
conversão empurra o Meta na direção de "gente que carrega uma página e espera 4
segundos", que é o tráfego mais barato e mais frio disponível.

**Isso é independente da qualidade da correspondência.** Mandar mais parâmetros
faz o Meta reconhecer melhor *quem* converteu — não muda o fato de que o evento
não separa quem presta de quem não presta.

Antes, o vídeo era o filtro: o botão só liberava acima de 75% assistido, então
"Entrou no jogo" era um sinal genuinamente qualificado. Ao remover o vídeo, o que
se perdeu não foi só o pixel — foi **o mecanismo que separava quente de frio**.

### Onde está o sinal quente de verdade

Na tabela `coupon_usages`: **`robux_spent` e `play_time`**. Quem resgatou
codiguin, gastou robux e tem tempo de jogo é inquestionavelmente quente. Isso
acontece dentro do Roblox, depois do redirect — fora do alcance do navegador.

O caminho é uma Edge Function no Supabase mandando esse resgate pra **Conversions
API** como `Purchase`, com `value = robux_spent`. Aí o Meta otimiza por quem gasta
robux, não por quem carrega página. O `event_id` e o `fbc`/`fbp` que o site já
grava existem justamente pra viabilizar isso.

Falta um elo pra atribuição ficar 1:1: hoje não dá pra ligar um resgate
individual a um clique individual (`coupon_usages` tem o `user_id` do Roblox,
`lp_roblox` tem o `visitor_id`, e o único elo é o código do influencer, que é por
pessoa e não por clique). O link de redirect já usa `launchData`, que o Roblox
entrega ao jogo via `Player:GetJoinData().LaunchData` — injetando o `visitor_id`
ali, o jogo consegue devolver esse dado junto com o uso do cupom. Depende do time
do jogo guardar o campo na API.
