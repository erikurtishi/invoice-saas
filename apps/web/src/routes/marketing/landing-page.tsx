import {
  DEFAULT_TEMPLATE_PRESET_ID,
  PLAN_CATALOG,
  TEMPLATE_PRESETS,
  USER_TIERS,
  type UserTierName,
} from '@invoice-saas/shared';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Check, FileText, Languages, Sparkles, Wand2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';

import { LanguageSwitcher } from '../../components/layout/language-switcher';
import { AppFooter } from '../../components/layout/app-footer';
import { TemplateThumbnail } from '../../components/template/template-thumbnail';
import { Button } from '../../components/ui';
import { useSession } from '../../features/auth/use-auth';
import { useFormatters } from '../../i18n/format';
import { useReducedMotion } from '../../lib/motion-presets';

gsap.registerPlugin(ScrollTrigger);

/** X.6.3 — set the document title + social/meta tags for the current UI language,
 * re-running whenever the visitor switches language on the page. OG/Twitter image
 * artwork is a separate design deliverable; the tags point at a stable path. */
function useLandingSeo() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? i18n.language ?? 'en';

  useEffect(() => {
    const title = t('landing.metaTitle');
    const description = t('landing.metaDescription');
    document.title = title;

    const tags: Array<[string, string, string]> = [
      ['name', 'description', description],
      ['property', 'og:title', title],
      ['property', 'og:description', description],
      ['property', 'og:type', 'website'],
      ['property', 'og:locale', lang],
      ['property', 'og:image', '/og-image.png'],
      ['name', 'twitter:card', 'summary_large_image'],
      ['name', 'twitter:title', title],
      ['name', 'twitter:description', description],
    ];
    const created: HTMLMetaElement[] = [];
    for (const [attr, key, value] of tags) {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
        created.push(el);
      }
      el.setAttribute('content', value);
    }
    return () => created.forEach((el) => el.remove());
  }, [t, lang]);
}

function Reveal({
  children,
  className,
  disabled,
}: {
  children: React.ReactNode;
  className?: string;
  disabled: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (disabled || !ref.current) return;
    const ctx = gsap.context(() => {
      gsap.from(ref.current, {
        opacity: 0,
        y: 24,
        duration: 0.6,
        ease: 'power2.out',
        scrollTrigger: { trigger: ref.current, start: 'top 85%', once: true },
      });
    }, ref);
    return () => ctx.revert();
  }, [disabled]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/**
 * The public marketing page (backlog X.6.1) — value prop, feature strip, template
 * showcase, pricing, CTA. Trilingual through the same i18n bundle as the app
 * (X.6.4) with the shared `<LanguageSwitcher>` in the header; GSAP scroll reveals
 * (X.6.2), skipped wholesale under `prefers-reduced-motion`. Owns `/`, so a
 * signed-in visitor is forwarded to their console / admin center.
 */
export function LandingPage() {
  const { t } = useTranslation();
  const { formatMoney } = useFormatters();
  const { data: user } = useSession();
  const reduceMotion = useReducedMotion() ?? false;
  useLandingSeo();

  if (user) return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/console'} replace />;

  const features = [
    { icon: FileText, key: 'fast' },
    { icon: Sparkles, key: 'branded' },
    { icon: Wand2, key: 'ai' },
    { icon: Languages, key: 'local' },
  ] as const;

  const showcase = [
    { id: 'classic', nameKey: 'landing.preset_classic' },
    { id: 'modern', nameKey: 'landing.preset_modern' },
    { id: 'formal', nameKey: 'landing.preset_formal' },
  ] as const;

  const tierPrice = (tier: UserTierName) => {
    const { priceMinor, currency } = PLAN_CATALOG[tier];
    return priceMinor === 0
      ? t('landing.priceFree')
      : t('landing.pricePerMonth', { price: formatMoney(priceMinor, currency) });
  };

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <span className="text-sm font-semibold text-foreground">{t('app.name')}</span>
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher className="hidden w-36 sm:flex" />
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">{t('landing.navLogIn')}</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/signup">{t('landing.navSignUp')}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-24">
          <Reveal disabled={reduceMotion} className="flex flex-col gap-5">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="size-3.5" aria-hidden />
              {t('landing.heroEyebrow')}
            </span>
            <h1 className="text-3xl font-semibold leading-tight text-foreground sm:text-4xl lg:text-5xl">
              {t('landing.heroTitle')}
            </h1>
            <p className="max-w-md text-base text-muted-foreground sm:text-lg">
              {t('landing.heroSubtitle')}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/signup">{t('landing.heroPrimaryCta')}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#pricing">{t('landing.heroSecondaryCta')}</a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('landing.heroFinePrint')}</p>
          </Reveal>

          <Reveal disabled={reduceMotion} className="flex justify-center lg:justify-end">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <TemplateThumbnail
                config={TEMPLATE_PRESETS.find((p) => p.id === DEFAULT_TEMPLATE_PRESET_ID)!.config}
              />
            </div>
          </Reveal>
        </section>

        {/* Feature strip */}
        <section className="border-y border-border bg-muted/30">
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            {features.map(({ icon: Icon, key }) => (
              <Reveal
                key={key}
                disabled={reduceMotion}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-5"
              >
                <Icon className="size-5 text-primary" aria-hidden />
                {/* h2 (not h3): sits directly under the hero h1 with no section
                    heading between — keeps the document outline gap-free (L3.5.2). */}
                <h2 className="text-sm font-semibold text-foreground">
                  {t(`landing.feature_${key}_title`)}
                </h2>
                <p className="text-sm text-muted-foreground">{t(`landing.feature_${key}_body`)}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Template showcase */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <Reveal disabled={reduceMotion} className="mb-8 max-w-xl">
            <h2 className="text-2xl font-semibold text-foreground">{t('landing.showcaseTitle')}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t('landing.showcaseBody')}</p>
          </Reveal>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {showcase.map((preset) => {
              const config = TEMPLATE_PRESETS.find((p) => p.id === preset.id)?.config;
              if (!config) return null;
              return (
                <Reveal
                  key={preset.id}
                  disabled={reduceMotion}
                  className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-4"
                >
                  <TemplateThumbnail config={config} />
                  <span className="text-sm font-medium text-foreground">{t(preset.nameKey)}</span>
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-t border-border bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <Reveal disabled={reduceMotion} className="mb-8 max-w-xl">
              <h2 className="text-2xl font-semibold text-foreground">
                {t('landing.pricingTitle')}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">{t('landing.pricingBody')}</p>
            </Reveal>
            <div className="grid gap-6 lg:grid-cols-3">
              {USER_TIERS.map((tier) => {
                const highlighted = tier === 'BASIC';
                return (
                  <Reveal
                    key={tier}
                    disabled={reduceMotion}
                    className={`flex flex-col gap-4 rounded-xl border bg-card p-6 ${
                      highlighted ? 'border-primary shadow-sm' : 'border-border'
                    }`}
                  >
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {t(`landing.tier_${tier}_name`)}
                      </h3>
                      <p className="mt-1 text-2xl font-semibold text-foreground">
                        {tierPrice(tier)}
                      </p>
                    </div>
                    <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                      {(['a', 'b', 'c'] as const).map((row) => (
                        <li key={row} className="flex items-start gap-2">
                          <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                          {t(`landing.tier_${tier}_${row}`)}
                        </li>
                      ))}
                    </ul>
                    <Button
                      asChild
                      className="mt-auto"
                      variant={highlighted ? 'primary' : 'outline'}
                    >
                      <Link to="/signup">{t('landing.pricingCta')}</Link>
                    </Button>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6">
          <Reveal
            disabled={reduceMotion}
            className="mx-auto flex max-w-xl flex-col items-center gap-4"
          >
            <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
              {t('landing.finalCtaTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('landing.finalCtaBody')}</p>
            <Button asChild size="lg">
              <Link to="/signup">{t('landing.heroPrimaryCta')}</Link>
            </Button>
          </Reveal>
        </section>
      </main>

      <AppFooter />
    </div>
  );
}
