-- LP Roblox — identificadores de anúncio do Meta
--
-- A LP virou redirect puro: a pessoa não faz nada dentro dela, então não existe
-- comportamento na página que diga ao Meta se aquele clique era bom. O que dá
-- pra fazer é guardar QUEM clicou no anúncio e devolver isso junto da conversão.
--
--   fbclid              -> o clique no anúncio, como vem na URL (?fbclid=...).
--                          É o sinal mais forte: identifica o anúncio exato.
--   fbc                 -> o mesmo clique no formato que o Meta consome
--                          (fb.1.<instante>.<fbclid>).
--   fbp                 -> identifica o NAVEGADOR. Cobre quem volta depois, sem
--                          fbclid na URL.
--   conversion_event_id -> id único da conversão daquele visitante. É o que
--                          permite mandar o MESMO evento pelo navegador (pixel)
--                          e pelo servidor (Conversions API) sem o Meta contar
--                          duas vezes. Fica salvo justamente pra que o envio
--                          server-side, quando existir, reuse o mesmo id.
--   campaign_params     -> utm_source/medium/campaign/content/term e os ids de
--                          campanha/conjunto/anúncio, como vieram na URL.
--                          jsonb porque a lista muda conforme o que o gestor
--                          configura nas macros do anúncio — coluna fixa pra
--                          cada um viraria migration nova a cada mudança.
--
-- Enquanto esta migration não rodar, a LP continua funcionando: o código tenta
-- gravar com estas colunas e, se o PostgREST recusar, repete sem elas. Perde-se
-- o dado de anúncio, nunca o registro do visitante nem a conversão.
--
-- Idempotente: pode rodar mais de uma vez sem erro.

alter table public.lp_roblox
  add column if not exists fbclid              text,
  add column if not exists fbc                 text,
  add column if not exists fbp                 text,
  add column if not exists conversion_event_id text,
  add column if not exists campaign_params     jsonb;

-- "Quem veio de anúncio" é o recorte mais consultado do painel. Índice parcial:
-- o tráfego orgânico (fbclid nulo) não ocupa espaço no índice.
create index if not exists lp_roblox_fbclid_idx
  on public.lp_roblox (fbclid)
  where fbclid is not null;

-- Busca pelo id da conversão — usada pelo envio server-side pra descobrir quais
-- conversões ainda não foram mandadas pra Conversions API.
create index if not exists lp_roblox_conversion_event_id_idx
  on public.lp_roblox (conversion_event_id)
  where conversion_event_id is not null;
