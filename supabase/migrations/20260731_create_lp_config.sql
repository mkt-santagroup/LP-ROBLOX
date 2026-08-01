-- LP Roblox — configurações globais editáveis pelo painel (/admin/configuracoes)
--
-- Tabela chave/valor simples. Serve pra trocar, SEM deploy:
--   redirect_url          -> link pra onde a LP manda a pessoa
--   redirect_delay_ms     -> quantos ms a tela de "redirecionando" fica na frente
--   meta_token            -> token da Graph API do Meta (aba Anúncios)
--   meta_ad_account       -> conta de anúncios (act_...)
--   meta_prefixo_campanha -> tag no nome das campanhas ('' = todas)
--
-- Idempotente: pode rodar mais de uma vez sem erro.

create table if not exists public.lp_config (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

-- Mantém updated_at sempre certo (útil pra saber quando alguém trocou o link).
create or replace function public.lp_config_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists lp_config_touch on public.lp_config;
create trigger lp_config_touch
  before update on public.lp_config
  for each row execute function public.lp_config_touch();

alter table public.lp_config enable row level security;

-- ===========================================================================
--  ⚠️  LEIA ANTES DE RODAR — MODELO DE ACESSO
-- ---------------------------------------------------------------------------
--  As políticas abaixo liberam LEITURA e ESCRITA para a chave anon (pública),
--  porque o painel /admin roda 100% no navegador e não tem login de verdade
--  (a senha do /admin é só uma tela, ela não protege o banco).
--
--  Consequência: quem descobrir a URL + anon key do projeto consegue ler e
--  alterar estas linhas — inclusive trocar o link de redirecionamento e ler
--  o token do Meta. É o MESMO nível de exposição que o token já tinha no
--  .env (VITE_* vai pro bundle e é público), então não é uma piora — mas é
--  bom saber.
--
--  Pra fechar isso de verdade seria preciso: ativar Supabase Auth, restringir
--  as políticas a usuários autenticados, e mover as chamadas da Graph API do
--  Meta pra uma Edge Function (aí o token nunca chega ao navegador).
-- ===========================================================================

drop policy if exists lp_config_select on public.lp_config;
create policy lp_config_select on public.lp_config
  for select using (true);

drop policy if exists lp_config_insert on public.lp_config;
create policy lp_config_insert on public.lp_config
  for insert with check (true);

drop policy if exists lp_config_update on public.lp_config;
create policy lp_config_update on public.lp_config
  for update using (true) with check (true);

-- Valor inicial do link (não sobrescreve se já existir).
insert into public.lp_config (key, value) values
  ('redirect_url', 'https://www.roblox.com/games/start?launchData=utm1%3A0%2C0%2Cweb-link%2Cnavbar-play-button%2C%3B&placeId=124924744052568'),
  ('redirect_delay_ms', '4000')
on conflict (key) do nothing;
