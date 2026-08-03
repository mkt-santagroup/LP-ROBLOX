# Pixel do Meta via GTM — o que o site manda e o que configurar

Documento de handoff pra quem administra o **GTM-TL5N76RP**.

---

## 1. O que aconteceu

O pixel do Meta saiu do código em **19/jun** (commit `0dc1775`) e passou a ser
gerenciado 100% dentro do GTM. O site só empurra eventos pro `dataLayer`.

Em **01/ago** (commit `4de26ba`) a LP virou um redirect direto: o vídeo e o botão
de CTA foram removidos. Com eles, estes eventos **pararam de existir**:

| Evento que sumiu | Por quê |
| --- | --- |
| `video_play` | não existe mais elemento de vídeo na página |
| `video_progress` | idem |
| `clique_bloqueado` | o botão "calma" não existe mais |
| classe `state_unlock` no botão | o botão não existe mais |

**Se alguma tag do pixel estava disparando por Click Classes (`state_unlock`) ou
pelos eventos de vídeo, ela está morta desde 01/ago.** É a causa provável do
"perdemos o pixel".

Continuam vivos: `page_view`, `entrou_no_jogo`, `redirect_auto` / `redirect_manual`.

---

## 2. O que o site manda agora

O `dataLayer` foi enriquecido. O contrato é este:

### `page_view` — dispara na abertura da LP

```js
{
  event: 'page_view',
  external_id: '<uuid do visitante>',
  fbc: 'fb.1.<timestamp>.<fbclid>' | null,
  fbp: 'fb.1.<timestamp>.<random>' | null
}
```

> No `page_view` o `fbp` costuma vir `null` — quem cria esse cookie é o próprio
> pixel, que muitas vezes ainda não rodou nesse instante. Ele é lido de novo na
> conversão e o push de lá sobrescreve.

### `entrou_no_jogo` — **a conversão**. Dispara na saída pro jogo

```js
{
  event: 'entrou_no_jogo',
  event_id: '<uuid único desta conversão>',
  external_id: '<uuid do visitante>',
  fbc: 'fb.1.<timestamp>.<fbclid>' | null,
  fbp: 'fb.1.<timestamp>.<random>' | null,
  redirect_mode: 'auto' | 'manual'
}
```

### `redirect_auto` / `redirect_manual` — diagnóstico interno

Separa quem saiu sozinho (timer) de quem teve que tocar no link de escape.
**Não é conversão** — não amarre tag de pixel nesses.

### Para que serve cada campo

| Campo | Para que serve |
| --- | --- |
| `external_id` | Advanced Matching. É o único dado de identificação que esta LP tem — ela não coleta e-mail nem telefone. |
| `event_id` | Deduplicação com o envio server-side (Conversions API). Sem ele, o mesmo evento contaria duas vezes quando a camada de servidor entrar. |
| `fbc` / `fbp` | **Não precisam ir na tag do pixel do navegador** — o pixel lê esses cookies sozinho. Estão no `dataLayer` por dois motivos: (a) ficam visíveis no Preview do GTM, o que permite conferir se a captura do `fbclid` está funcionando; (b) são necessários se um dia houver um container server-side. O site também grava os dois no banco, que é o que vai alimentar a Conversions API. |
| `redirect_mode` | Permite separar no GTM sem precisar de outro evento. |

---

## 3. O que configurar no GTM

### 3.1 Variáveis (Data Layer Variable)

Criar uma pra cada, com o **Data Layer Variable Name** exatamente igual ao nome:

- `event_id`
- `external_id`
- `fbc`
- `fbp`
- `redirect_mode`

### 3.2 Acionador (Trigger)

**Tipo:** Custom Event
**Nome do evento:** `entrou_no_jogo`

### 3.3 Tag do pixel

Recomendação: evento padrão **`Lead`** (e não um `trackCustom`). Evento padrão
tem suporte melhor pra otimização e pra criação de públicos.

Se a tag for **Custom HTML**:

```html
<script>
  fbq('init', 'SEU_PIXEL_ID', {
    external_id: {{dlv - external_id}}
  });

  fbq('track', 'Lead', {}, {
    eventID: {{dlv - event_id}}
  });
</script>
```

Pontos que **não** podem ser esquecidos:

1. O `external_id` vai no **`init`** (Advanced Matching), não no `track`.
   Pode mandar cru — o pixel faz o hash sozinho no navegador.
2. O `eventID` vai no **terceiro** argumento do `track`, não no segundo.
   É o que evita contagem dupla quando a Conversions API entrar.
3. A tag precisa disparar **só** no acionador `entrou_no_jogo`. Se disparar em
   All Pages, a conversão perde qualquer sentido.

> O pixel que estava no código antes de 19/jun era o `1594793878256072`.
> Vale conferir se é esse mesmo que está configurado hoje no GTM.

---

## 4. Como testar

1. **GTM Preview** — abrir a LP e confirmar que `entrou_no_jogo` aparece com
   `event_id` e `external_id` preenchidos.
2. **Meta Pixel Helper** (extensão do Chrome) — confirmar que o `Lead` sai uma
   vez só, e não a cada carregamento.
3. **Events Manager → Test Events** — confirmar que o evento chega com o
   `external_id` reconhecido.
4. **Teste do `fbclid`** — abrir a LP com `?fbclid=teste123` na URL e conferir no
   Preview que `fbc` aparece como `fb.1.<numero>.teste123`.

### O termômetro que importa

Comparar, no mesmo período:

- **Redirecionados** no painel `/admin`
- **Leads** no Events Manager

Antes desta correção esses números divergiam muito: o site navegava pra fora
antes de a tag do pixel disparar, e o navegador cancelava a requisição. Agora o
site espera a tag confirmar o disparo (via `eventCallback` do GTM) antes de
navegar, com teto de 600ms. **Se os dois números continuarem muito diferentes,
o problema é configuração no GTM, não no site.**

---

## 5. O que isto NÃO resolve

Vale o alinhamento com o gestor de tráfego, porque é uma limitação de estratégia
e não de implementação:

**A LP é um redirect de ~4 segundos. Ninguém faz nada dentro dela.** Todo mundo
que abre e espera é redirecionado, então `entrou_no_jogo` dispara pra
praticamente 100% dos visitantes.

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
começou a gravar existem justamente pra viabilizar isso.

Falta um elo pra atribuição ficar 1:1: hoje não dá pra ligar um resgate
individual a um clique individual (`coupon_usages` tem o `user_id` do Roblox,
`lp_roblox` tem o `visitor_id`, e o único elo é o código do influencer, que é por
pessoa e não por clique). O link de redirect já usa `launchData`, que o Roblox
entrega ao jogo via `Player:GetJoinData().LaunchData` — injetando o `visitor_id`
ali, o jogo consegue devolver esse dado junto com o uso do cupom. Depende do time
do jogo guardar o campo na API.
