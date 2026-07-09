-- LP Roblox — prefixo de campanha de anúncios por influencer.
--
-- ad_prefix: tag no nome das campanhas do Meta deste influencer (ex: "[ROBLOX] [HANZO]").
--   Usado pra atribuir o gasto/custo do Meta a cada influencer no dashboard.
--   Campanhas só com "[ROBLOX]" (sem sufixo de influencer) são da SpawningAds (tráfego geral).
--   NULL/vazio = influencer sem campanha própria atribuída.
--
-- Idempotente.
alter table public.lp_influencers
  add column if not exists ad_prefix text;
