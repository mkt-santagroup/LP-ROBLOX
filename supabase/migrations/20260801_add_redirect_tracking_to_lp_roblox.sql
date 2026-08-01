-- LP Roblox — rastreio do REDIRECIONAMENTO
--
-- A LP virou redirect puro (sem vídeo). Quem cai nela sai pro jogo de dois
-- jeitos, e a diferença entre eles importa:
--
--   'auto'   -> o timer estourou e a página navegou sozinha (fluxo esperado);
--   'manual' -> a pessoa tocou em "Não abriu? Toque aqui pra entrar" ANTES do
--               timer estourar. Muito clique manual é sinal de que o tempo de
--               espera está longo demais ou de que o navegador in-app está
--               segurando o redirect automático.
--
-- `click_link` continua sendo "saiu pro jogo" — é o que os registros da LP
-- antiga (com vídeo, onde a saída era o clique no CTA) já usam, então ele
-- segue como a contagem TOTAL de redirecionados. As colunas abaixo dizem
-- COMO e QUANDO a saída aconteceu:
--
--   redirect_mode  -> 'auto' | 'manual' | NULL (NULL = registro da LP antiga)
--   redirected_at  -> instante em que a pessoa foi mandada pro jogo
--   manual_clicks  -> quantos toques no link de escape (2+ = redirect travado)
--
-- Idempotente: pode rodar mais de uma vez sem erro.

alter table public.lp_roblox
  add column if not exists redirect_mode text,
  add column if not exists redirected_at timestamptz,
  add column if not exists manual_clicks integer not null default 0;

-- Só dois valores fazem sentido — qualquer outra coisa é bug de escrita.
alter table public.lp_roblox
  drop constraint if exists lp_roblox_redirect_mode_check;
alter table public.lp_roblox
  add constraint lp_roblox_redirect_mode_check
  check (redirect_mode is null or redirect_mode in ('auto', 'manual'));

-- O painel quebra as saídas por modo dentro de cada período/influencer.
-- Índice parcial: as linhas com modo NULL (LP antiga) nunca são filtradas por aqui.
create index if not exists lp_roblox_redirect_mode_idx
  on public.lp_roblox (redirect_mode)
  where redirect_mode is not null;
