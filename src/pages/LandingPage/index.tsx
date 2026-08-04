import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Clouds } from '../../components/Clouds';
import { getInfluencerBySlug, slugify } from '../../lib/influencers';
import { fetchAppConfig, fallbackConfig, isValidUrl } from '../../lib/appConfig';
import { useRobloxAnalytics, TRACKING_FLUSH_MS } from '../../hooks/useRobloxAnalytics';
import styles from './Redirect.module.css';

//
// LP de REDIRECIONAMENTO DIRETO.
//
// A pessoa cai aqui, vê o fundo com "Estamos redirecionando você pro jogo" por
// alguns segundos e é mandada automaticamente pro link. Sem vídeo, sem botão
// de desbloqueio.
//
// Regras que o código respeita:
//  1. O redirecionamento SEMPRE acontece. Se o Supabase estiver fora do ar, se
//     a config demorar, se o tracking falhar — o timer dispara mesmo assim,
//     usando o link do .env / o padrão do código.
//  2. O link vem, nessa ordem: influencer > config global do painel > .env > padrão.
//  3. A conversão é enviada ANTES de navegar, com um teto de espera curto pra
//     não segurar a pessoa na tela. O teto cobre os dois lados da conversão: a
//     gravação no banco e o disparo do pixel do Meta. A gravação em si vai com
//     `keepalive` e termina mesmo depois de a página sair do ar; o pixel NÃO
//     tem essa garantia — se a gente navegar antes do beacon sair, o navegador
//     cancela e a conversão nunca chega ao Meta. Por isso o teto espera as duas
//     coisas, não só o banco.
//  4. A saída é registrada com o MODO ('auto' quando o timer estoura sozinho,
//     'manual' quando a pessoa toca no link de escape antes disso). É o que
//     separa, no painel, quem foi redirecionado de quem teve que clicar.
//

export const LandingPage = () => {
  // Captura a origem do tráfego da URL: /:influencer/:social
  const { influencer, social } = useParams();

  // Registra o acesso (PageView do pixel + visitante no banco) e devolve o
  // disparo da conversão, usado na saída pro jogo.
  const { trackRedirect } = useRobloxAnalytics({ influencer, social });

  // Começa já com o fallback (.env / padrão) pra nunca existir um instante em
  // que a página não saiba pra onde ir.
  const initial = fallbackConfig();
  const [targetUrl, setTargetUrl] = useState(initial.redirectUrl);
  const [delayMs, setDelayMs] = useState(initial.redirectDelayMs);
  const [progress, setProgress] = useState(0);

  // Instante em que a tela apareceu — a contagem é sempre medida a partir daqui,
  // então descobrir o link no meio do caminho não reinicia a espera.
  const startedAt = useRef<number>(Date.now());
  const redirected = useRef(false);
  const targetRef = useRef(targetUrl);
  targetRef.current = targetUrl;

  // ---- 1. Descobre o link de destino (sem travar a contagem) ----
  useEffect(() => {
    let active = true;

    (async () => {
      // Config global do painel (cai no .env sozinha se o banco não responder).
      const cfg = await fetchAppConfig();
      if (!active) return;

      let url = cfg.redirectUrl;
      let delay = cfg.redirectDelayMs;

      // O link do influencer, quando existir, ganha de tudo.
      if (influencer) {
        try {
          const inf = await getInfluencerBySlug(slugify(influencer));
          if (inf?.redirect_url && isValidUrl(inf.redirect_url)) {
            url = inf.redirect_url.trim();
          }
        } catch {
          // Influencer não encontrado ou banco fora: segue com o link global.
        }
      }
      if (!active) return;

      setTargetUrl(url);
      setDelayMs(delay);
    })();

    return () => { active = false; };
  }, [influencer]);

  // ---- 2. Dispara o redirecionamento ----
  const go = useCallback(async (mode: 'auto' | 'manual') => {
    if (redirected.current) return;
    redirected.current = true;

    const url = targetRef.current;

    // Manda a conversão, mas sem deixar a pessoa esperando: se o banco/pixel
    // demorar mais que o teto, navega assim mesmo.
    try {
      await Promise.race([
        Promise.resolve(trackRedirect(mode)),
        new Promise((r) => setTimeout(r, TRACKING_FLUSH_MS)),
      ]);
    } catch {
      // Tracking nunca bloqueia a navegação.
    }

    // `replace` em vez de `href`: a tela de redirecionamento não fica no
    // histórico, então o "voltar" do navegador não joga a pessoa de volta nela.
    window.location.replace(url);
  }, [trackRedirect]);

  // ---- 3. Contagem + barra de progresso ----
  useEffect(() => {
    let frame = 0;

    const tick = () => {
      const elapsed = Date.now() - startedAt.current;
      const pct = Math.min((elapsed / delayMs) * 100, 100);
      setProgress(pct);

      if (elapsed >= delayMs) {
        go('auto');
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    // Rede de segurança do redirect: o navegador PAUSA o requestAnimationFrame
    // em aba que não está na frente — quem abre o link em nova aba (ou num
    // in-app browser que pré-carrega a página) ficaria preso na tela de espera
    // pra sempre, e apareceria no painel como quem "saiu antes". O setTimeout
    // é só afunilado em segundo plano, não congelado, então ele garante a saída.
    // `go` é idempotente: quem chegar primeiro manda.
    const restante = Math.max(0, delayMs - (Date.now() - startedAt.current));
    const rede = setTimeout(() => go('auto'), restante + 250);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(rede);
    };
  }, [delayMs, go]);

  const secondsLeft = Math.max(0, Math.ceil((delayMs - (progress / 100) * delayMs) / 1000));

  return (
    <div className={styles.wrapper}>
      <Clouds />

      <main className={styles.card} role="status" aria-live="polite">
        <img src="/logo.png" alt="Brazilian Life RP" className={styles.logo} />

        <div className={styles.spinner} aria-hidden="true" />

        <h1 className={styles.title}>Estamos redirecionando você pro jogo</h1>
        <p className={styles.subtitle}>
          Segura aí, já vai abrir{secondsLeft > 0 ? ` em ${secondsLeft}s` : ''}...
        </p>

        <div className={styles.progressTrack}>
          <div className={styles.progressBar} style={{ width: `${progress}%` }} />
        </div>

        {/* Rede de segurança: se o navegador bloquear o redirect automático
            (alguns in-app browsers fazem isso), a pessoa ainda tem um toque.
            O toque vira uma saída 'manual' no painel — é o número que mostra
            quantas pessoas não esperaram (ou não puderam esperar) o automático. */}
        <a
          href={targetUrl}
          className={styles.manualLink}
          onClick={(e) => {
            // O automático já disparou e mesmo assim a pessoa tocou: o navegador
            // provavelmente segurou o redirect. Deixa o link seguir sozinho —
            // interceptar aqui deixaria o toque sem efeito nenhum — e só registra.
            if (redirected.current) { trackRedirect('manual'); return; }
            // Ainda dentro da contagem: intercepta pra gravar a saída como
            // manual antes de navegar.
            e.preventDefault();
            go('manual');
          }}
        >
          Não abriu? Toque aqui pra entrar
        </a>
      </main>
    </div>
  );
};
