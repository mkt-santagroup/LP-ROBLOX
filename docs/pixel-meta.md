# Pixel do Meta — 2 disparos, direto no código

---

## 1. O que dispara

Dois eventos. Só dois. Ambos ficam em [`src/lib/metaPixel.ts`](../src/lib/metaPixel.ts).

| # | Evento | Quando | Onde no código |
| --- | --- | --- | --- |
| 1 | `PageView` | a pessoa abre a LP | `initMetaPixel()`, na montagem do `useRobloxAnalytics` |
| 2 | `Lead` | **a conversão** — a pessoa é mandada pro jogo | `trackMetaConversion()`, dentro de `trackRedirect()` |

`Lead` é evento **padrão** do Meta (e não um `trackCustom`) porque só os padrão
servem pra otimização de campanha e criação de público parecido.

O `Lead` sai **uma vez por acesso**. Se a pessoa tocar no link de escape depois
do redirect automático já ter disparado, o toque só engrossa `manual_clicks` no
banco — o pixel não repete.

### Parâmetros que vão junto

| Parâmetro | Onde vai | Pra que serve |
| --- | --- | --- |
| `external_id` | no `fbq('init', …)` (Advanced Matching) | É o `visitor_id` da LP. É o **único** dado de identificação que esta página tem — ela não coleta e-mail nem telefone. Vai cru; o pixel faz o hash sozinho no navegador. |
| `eventID` | 3º argumento do `fbq('track', …)` | Deduplicação com um envio server-side (Conversions API). Sem ele o mesmo evento contaria duas vezes quando a camada de servidor entrar. É o mesmo id gravado em `conversion_event_id` no banco. |

O `fbc`/`fbp` **não** são passados na mão: o próprio pixel lê esses cookies. Eles
são lidos e gravados no banco pra alimentar a Conversions API mais pra frente.

---

## 2. Como configurar

No `.env`:

```env
VITE_META_PIXEL_ID=1594793878256072
```

Só os números do ID — pega em **Events Manager → Fontes de dados → seu pixel**.
Vazio (ou valor inválido) cai no padrão embutido em `src/lib/metaPixel.ts`.

O Vite lê o `.env` **só no boot**: depois de editar, reinicie o `npm run dev` e,
em produção, faça rebuild + deploy.

---

## 3. ⚠️ O GTM

O container `GTM-TL5N76RP` continua carregado na página, mas **não gerencia mais
o pixel do Meta**.

**Se ainda existir uma tag do pixel do Meta lá dentro, pause ela.** Duas tags
disparando o mesmo evento = conversão contada em dobro, e o `eventID` não
resolve isso (ele deduplica navegador × servidor, não navegador × navegador).

O site ainda empurra `page_view` e `entrou_no_jogo` pro `dataLayer`, mas só pro
lado Google (GA4 / Google Ads). Nada do Meta depende deles.

### Por que saiu do GTM

O pixel virou tag de GTM em jun/2026. Em 01/ago a LP virou redirect direto: o
vídeo e o botão de CTA foram removidos, e com eles sumiram os eventos
`video_play`, `video_progress`, `clique_bloqueado` e a classe `state_unlock`.

Qualquer tag amarrada nesses gatilhos **morreu em silêncio** — do lado do site
tudo parecia certo e o Events Manager não recebia nada. Foi essa a causa provável
do "perdemos o pixel". Com o pixel no código, o que dispara está escrito no
repositório: dá pra ler, testar e versionar junto com a LP.

---

## 4. Como testar

1. **Console do navegador** — abrir a LP e conferir as duas linhas:
   `[PIXEL] PageView -> <id>` na abertura e `[PIXEL] Lead (conversão) -> <id>`
   na saída pro jogo.
2. **Meta Pixel Helper** (extensão do Chrome) — confirmar `PageView` **1×** e
   `Lead` **1×** por acesso. Se aparecer duplicado, é tag sobrando no GTM.
3. **Events Manager → Test Events** — confirmar que o `Lead` chega com o
   `external_id` reconhecido.
4. **Teste do `fbclid`** — abrir a LP com `?fbclid=teste123` e conferir no banco
   (`lp_roblox.fbclid` / `fbc`) que a captura funcionou.

### O termômetro que importa

Comparar, no mesmo período:

- **Redirecionados** no painel `/admin`
- **Leads** no Events Manager

Os dois deveriam andar juntos. O site espera o beacon do pixel sair antes de
navegar (teto de 600ms) justamente pra isso — antes ele navegava na hora e o
navegador cancelava a requisição, então o painel contava redirecionamentos que o
Meta nunca via.

Se ainda divergirem muito: **Leads > Redirecionados** é tag duplicada (confira o
GTM); **Leads < Redirecionados** é adblock/ITP, que é perda esperada.

---

## 5. O que isto NÃO resolve

Vale o alinhamento com o gestor de tráfego, porque é uma limitação de estratégia
e não de implementação:

**A LP é um redirect de ~4 segundos. Ninguém faz nada dentro dela.** Todo mundo
que abre e espera é redirecionado, então o `Lead` dispara pra praticamente 100%
dos visitantes.

Um evento que dispara pra todo mundo **não ensina nada ao algoritmo** — não
existe diferença entre o clique bom e o ruim pra ele aprender. Otimizar por esse
`Lead` empurra o Meta na direção de "gente que carrega uma página e espera 4
segundos", que é o tráfego mais barato e mais frio disponível.

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
