-- LP Roblox — configs individuais por influencer
--
-- unlock_seconds: segundos de VÍDEO assistido até o botão liberar.
--   NULL  = não configurado  -> usa a regra padrão da LP (75% do vídeo)
--   0     = botão liberado desde o início (sem gate)
--   N > 0 = libera após N segundos de vídeo assistido
--
-- redirect_url: link de destino do botão para ESTE influencer.
--   NULL / vazio = usa o link padrão da LP (gameUrl)
--   preenchido   = manda esse influencer para uma experiência diferente do Roblox
--
-- Idempotente: pode rodar mais de uma vez sem erro.
alter table public.lp_influencers
  add column if not exists unlock_seconds integer,
  add column if not exists redirect_url  text;

-- Garante que ninguém salve segundos negativos.
alter table public.lp_influencers
  drop constraint if exists lp_influencers_unlock_seconds_nonneg;
alter table public.lp_influencers
  add constraint lp_influencers_unlock_seconds_nonneg
  check (unlock_seconds is null or unlock_seconds >= 0);
